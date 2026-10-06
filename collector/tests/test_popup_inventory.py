import copy
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import weekly
from popup_inventory import OfficialInventory, InventoryState, matching_event
from popup_catalog_sources import directories, inventory_page, event_record
from popup_http import OfficialHttp
from media_fetch import MediaError

ROOT=Path(__file__).resolve().parents[1]
SCOPE={'region':'SEOUL_GYEONGGI','timezone':'Asia/Seoul','startDate':'2026-11-01','endDate':'2026-12-31'}


class PopupInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        cfg=weekly.load_config(None);cfg['stateDirectory']=self.temp.name
        self.run=weekly.Pipeline(cfg,Path(self.temp.name)/'run',SCOPE,dry_run=True)
        self.path=Path(self.temp.name)/'inventory.json'
        self.branch=dict(key='LOTTE:0399',company='LOTTE',code='0399',name='동탄점',venue='롯데백화점 동탄점',region='GYEONGGI',url='https://www.lotteshopping.com/contents/shpgInfo?cstrCd=0399',items={})
        self.event=json.loads((ROOT/'examples/v5/events.json').read_text(encoding='utf-8'))['events'][0]
        self.event.update(subcategory='POPUP_RETAIL',subjects=['CHARACTER_IP'],region='GYEONGGI',address='경기도 화성시 동탄역로 160')
        self.event['occurrences']=[dict(startDate='2026-11-10',endDate='2026-11-11',startTime=None,endTime=None)]
        self.event['banners']=[dict(imageUrl='https://example.com/banner.png',pageUrl=self.event['sources'][0]['url'],rights='UNKNOWN',rightsEvidence=None,matchesEdition=True)]
        # The real final batch gate now requires native original-page evidence.
        # Supply matching visible source markup instead of trusting the fixture Boolean.
        self.banner_robots=patch('event_banner_validation.allowed_by_robots',return_value=True)
        self.banner_html=patch('event_banner_validation.fetch_html',side_effect=lambda *args:(
            '<main><h1>'+self.event['name']+'</h1><p>행사 개최일: 2026.11.10 ~ 2026.11.11</p>'
            '<img src="https://example.com/banner.png" alt="'+self.event['name']+' 포스터"></main>',''))
        self.banner_robots.start();self.addCleanup(self.banner_robots.stop)
        self.banner_html.start();self.addCleanup(self.banner_html.stop)

    def collector(self,**kw):
        return OfficialInventory(self.run,state_path=self.path,known_events=[],published_events=[],**kw)

    def scan(self,collector,page,record=None):
        with patch('popup_inventory.bootstrap',return_value=('bootstrap',{})),patch('popup_inventory.inventory_page',side_effect=page),patch('popup_inventory.event_record',return_value=(record or self.event,None)) as details,redirect_stdout(io.StringIO()):
            collector.scan_branch(collector.state.branches()[self.branch['key']])
        return details

    def test_page_cursor_persists_and_details_wait_for_complete_inventory(self):
        first=dict(id='one',title='one',url='https://example.com/one')
        second=dict(id='two',title='two',url='https://example.com/two')
        def page(branch,cursor,*args):
            return ([first],2,{'page':2}) if cursor.get('page',1)==1 else ([second],2,None)
        collector=self.collector(max_pages=1);collector.state.branches()[self.branch['key']]=copy.deepcopy(self.branch)
        details=self.scan(collector,page)
        branch=collector.state.branches()[self.branch['key']]
        self.assertEqual(branch['state'],'PARTIAL');self.assertEqual(branch['cursor'],{'page':2})
        details.assert_not_called();self.assertFalse(branch['items'])
        resumed=self.collector(max_pages=1)
        details=self.scan(resumed,page)
        branch=resumed.state.branches()[self.branch['key']]
        self.assertTrue(branch['inventoryComplete']);self.assertEqual(branch['state'],'COMPLETE')
        self.assertEqual(set(branch['items']),{'one','two'});self.assertEqual(details.call_count,2)

    def test_default_traversal_finishes_more_than_eight_pages_and_forty_details(self):
        def page(branch,cursor,*args):
            number=cursor.get('page',1)
            rows=[dict(id=str(number*6+i),title='event',url='https://example.com/'+str(number*6+i)) for i in range(6)]
            return rows,60,dict(page=number+1) if number<10 else None
        collector=self.collector();collector.state.branches()[self.branch['key']]=copy.deepcopy(self.branch)
        details=self.scan(collector,page)
        branch=collector.state.branches()[self.branch['key']]
        self.assertEqual(branch['state'],'COMPLETE');self.assertEqual(len(branch['items']),60)
        self.assertEqual(details.call_count,60)

    def test_shifted_first_page_invalidates_continuation_even_when_count_is_same(self):
        first=dict(id='one',title='one',url='https://example.com/one')
        collector=self.collector(max_pages=1);collector.state.branches()[self.branch['key']]=copy.deepcopy(self.branch)
        self.scan(collector,lambda *args:([first],2,{'page':2}))
        resumed=self.collector(max_pages=1)
        details=self.scan(resumed,lambda *args:([{**first,'id':'new'}],2,{'page':2}))
        branch=resumed.state.branches()[self.branch['key']]
        self.assertEqual(branch['state'],'FAILED');self.assertEqual(branch['cursor'],{})
        self.assertFalse(branch['scanItems']);details.assert_not_called()

    def test_truncated_inventory_does_not_become_complete(self):
        collector=self.collector();collector.state.branches()[self.branch['key']]=copy.deepcopy(self.branch)
        details=self.scan(collector,lambda *a:([dict(id='one',title='one',url='https://example.com/one')],2,None))
        branch=collector.state.branches()[self.branch['key']]
        self.assertEqual(branch['state'],'FAILED');self.assertFalse(branch.get('inventoryComplete'))
        details.assert_not_called()

    def test_ambiguous_detail_becomes_persistent_research_job(self):
        collector=self.collector();collector.state.branches()[self.branch['key']]=copy.deepcopy(self.branch)
        row=dict(id='one',title='종합 팝업 안내',url='https://www.shinsegae.com/cms12/a.txt')
        with patch('popup_inventory.bootstrap',return_value=('html',{})),patch('popup_inventory.inventory_page',return_value=([row],1,None)),patch('popup_inventory.event_record',side_effect=ValueError('individual dates unknown')):
            collector.scan_branch(collector.state.branches()[self.branch['key']])
        branch=collector.state.branches()[self.branch['key']]
        self.assertEqual(branch['state'],'PARTIAL')
        self.assertEqual(branch['items']['one']['outcome'],'RESEARCH_QUEUED')
        key=branch['items']['one']['researchKey']
        self.assertEqual(self.run.discovery_work_queue.jobs[key]['payload']['seeds'],[row['url']])

    def test_shared_weekly_url_does_not_match_a_different_event(self):
        other={**copy.deepcopy(self.event),'name':'another popup'}
        self.assertIsNone(matching_event(self.event,[{'id':1,'event':other}]))
        self.assertEqual(matching_event(self.event,[{'id':2,'event':copy.deepcopy(self.event)}])['id'],2)

    def test_known_event_gaps_are_staged_and_cancellation_is_preserved(self):
        old=copy.deepcopy(self.event);old['banners']=[];old['address']=None
        old['operationStatus']=dict(state='CANCELED',note='confirmed',sourceUrl=old['sources'][0]['url'],checkedOn='2026-11-01')
        collector=self.collector();collector.known=[{'id':12,'event':old}]
        item=dict(id='one',title=self.event['name'],url=self.event['sources'][0]['url'])
        with redirect_stdout(io.StringIO()):collector.reconcile(self.branch,item,self.event)
        self.assertEqual(item['outcome'],'EXISTING');self.assertTrue(item['gapFillStaged'])
        payload=next((self.run.folder/'jobs').glob('official-fill-*/payload.json'))
        saved=json.loads(payload.read_text(encoding='utf-8'))['result']['events'][0]
        self.assertEqual(saved['operationStatus']['state'],'CANCELED');self.assertTrue(saved['banners'])

    def test_corrupt_inventory_state_is_not_silently_reset(self):
        self.path.write_text('{"schemaVersion":"0"}',encoding='utf-8')
        with self.assertRaises(ValueError):InventoryState(self.path)

    def test_hyundai_weekly_mode_survives_duplicate_legacy_branch_link(self):
        html='<a href="https://thehyundaiseoul.ehyundai.com/">더현대 서울</a><a href="/newPortal/DP/DP000000_V.do?branchCd=B00140000">더현대 서울</a>'
        row=directories('HYUNDAI',html)[0]
        self.assertEqual(row['mode'],'WEEKLY');self.assertEqual(row['region'],'SEOUL')

    def test_lotte_two_directory_widgets_merge_known_buildings_without_eval(self):
        first={'cstrCd':'0340','cstrDspNm':'김포공항점','lrclsDtlCdNm':'백화점','mdclsDtlCdNm':'서울지역'}
        second={**first,'lrclsDtlCdNm':'쇼핑몰'}
        html="<a class='branch-item' onclick='hideGnbBranchPopup(this, "+json.dumps(first)+")'>김포공항점</a>"
        html+="<a class='branch-item' onclick='hideBranchPopup(this, "+json.dumps(second)+"); setQuickCstrInfo("+json.dumps(second)+")'>김포공항점</a>"
        rows=directories('LOTTE',html)
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['officialNames'],['백화점 김포공항점','쇼핑몰 김포공항점'])

    def test_shinsegae_exposure_period_is_not_used_for_event_dates(self):
        branch=dict(company='SHINSEGAE',code='SC00002',venue='신세계 강남점',region='SEOUL')
        item=dict(id='one',title='브랜드 팝업',url='https://www.shinsegae.com/cms12/SC00002/a.txt',raw={'badge1':'팝업스토어','startDt':'20261101000000','endDt':'20261130000000','expDt':'브랜드별 행사기간 상이'})
        with self.assertRaisesRegex(ValueError,'individual popup dates'):
            event_record(branch,item,SCOPE,lambda *a:json.dumps({'stor_cd':'SC00002','expDt':'브랜드별 행사기간 상이'}))

    def test_unknown_starfield_notice_is_queued_for_detail_instead_of_discarded(self):
        item=dict(id='one',title='캐릭터 체험전',url='https://www.starfield.co.kr/coexmall/eventBenefit/events/1',raw={})
        with self.assertRaisesRegex(ValueError,'requires detail research'):
            event_record(dict(company='STARFIELD'),item,SCOPE,lambda *a:'')

    def test_transport_rejects_unreviewed_post_and_private_url(self):
        with self.assertRaisesRegex(ValueError,'Unreviewed'):
            OfficialHttp()('https://www.shinsegae.com/anything',{'x':'y'})
        with self.assertRaises(ValueError):OfficialHttp()('https://127.0.0.1/a')

    def test_transport_honors_robots_without_opening_connection(self):
        with patch('popup_http.allowed_by_robots',return_value=False),patch('popup_http.PinnedHTTPS') as connection:
            with self.assertRaisesRegex(MediaError,'robots denied'):OfficialHttp()('https://www.shinsegae.com/shopping/event/list.do')
        connection.assert_not_called()


if __name__=='__main__':unittest.main()
