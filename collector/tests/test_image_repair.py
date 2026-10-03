import copy,hashlib,io,json,sys,tempfile,unittest
from contextlib import ExitStack
from datetime import datetime,timedelta,timezone
from pathlib import Path
from unittest.mock import patch,Mock
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import image_repair as repair
import media_fetch
from robots_policy import allowed
from official_poster_sources import parse_official_document
from catalog_transport import Api

PAGE='https://official.example/event/2026'
URL='https://official.example/poster.png'
PUBLIC='https://images.example/verified/poster.png'
AGENT='BoothHana-Public-Event-Collector/1'
stream=io.BytesIO();Image.new('RGB',(3,2),(20,30,40)).save(stream,format='PNG')
RAW=stream.getvalue();SHA=hashlib.sha256(RAW).hexdigest()
def target(id=1):
    return dict(id=id,revision=2,event=dict(name='2026 테스트 행사',sources=[dict(kind='OFFICIAL',url=PAGE)],discoveryLinks=[]),
                assets=[],storedHashes={},banner=None,selectedBannerAssetId=None)
def asset(id=10,rights='APPROVED',state='STORED'):
    return dict(id=id,revision=7,imageUrl=URL,pageUrl=PAGE,rightsState=rights,storageState=state,storedUrl=PUBLIC if state=='STORED' else None)
class FakeApi:
    def __init__(self,rows):self.rows=rows;self.calls=[];self.public={'banner':{'id':10,'url':PUBLIC}}
    def public_event(self,id):return self.public
    def request(self,method,path,data=None,**kwargs):
        self.calls.append((method,path,data,kwargs))
        if method=='GET':
            after=int(path.split('afterId=')[1]);return [copy.deepcopy(t) for t in self.rows if t['id']>after][:100]
        if path.endswith('/content'):return asset()
        if path.endswith('/assets'):return dict(id=42,rightsState='PENDING')
        raise AssertionError('Unintended mutation '+path)

class RobotsTests(unittest.TestCase):
    def test_longest_rule_and_whitespace_recover_seoul_page_without_allowing_image_path(self):
        text='User-agent: *\nDisallow: /\nAllow : /festival\nDisallow: /festival/private\n'
        self.assertTrue(allowed(text,AGENT,'https://festival.seoul.go.kr/festival/main/view?id=1'))
        for path in ('/resources/poster.jpg','/festival/private/poster.jpg'):
            self.assertFalse(allowed(text,AGENT,'https://festival.seoul.go.kr'+path))
    def test_equal_specificity_allows_and_specific_groups_merge(self):
        text='User-agent: *\nDisallow: /\nUser-agent: BoothHana\nDisallow: /x\nUser-agent: boothhana\nAllow: /x\n'
        self.assertTrue(allowed(text,AGENT,'https://x.example/x'))
        self.assertFalse(allowed(text,'OtherBot/1','https://x.example/x'))
    def test_wildcard_anchor_query_and_brackets_are_literal(self):
        text='User-agent: *\nDisallow: /*.png$\nDisallow: /a?x=[1]\n'
        self.assertFalse(allowed(text,AGENT,'https://x.example/a/poster.png'))
        self.assertTrue(allowed(text,AGENT,'https://x.example/a/poster.png?size=2'))
        self.assertFalse(allowed(text,AGENT,'https://x.example/a?x=[1]'))
        self.assertTrue(allowed(text,AGENT,'https://x.example/abx=1'))
    def test_percent_encoding_does_not_decode_reserved_separators(self):
        text='User-agent: *\nDisallow: /a/b\nDisallow: /한글\nDisallow: /~private\n'
        self.assertTrue(allowed(text,AGENT,'https://x.example/a%2fb'))
        self.assertFalse(allowed(text,AGENT,'https://x.example/%ED%95%9C%EA%B8%80'))
        self.assertFalse(allowed(text,AGENT,'https://x.example/%7Eprivate'))
    def test_body_images_and_same_host_notice_links_on_unlisted_official_host(self):
        html='<h1>2026 행사</h1><img data-src="/poster.png"><div style="background-image:url(/art.jpg)"></div><a href="/notice/7">행사 안내</a><a href="https://evil.example/notice">안내</a><a href="/notice/delete">안내</a>'
        doc=parse_official_document(html,PAGE,'2026-10-03','2026 행사')
        self.assertEqual({i['role'] for i in doc['images']},{'CONTENT','BACKGROUND'})
        self.assertEqual(doc['childUrls'],['https://official.example/notice/7'])

class RepairTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.cfg=dict(blockedSourceHosts=[],imageAllowedHosts=['official.example'],stateDirectory=str(self.root))
    def job(self,rows=None,apply=False,**kwargs):return repair.Repair(self.cfg,FakeApi(rows or [target()]),self.root/'repair',apply=apply,**kwargs)
    def mock_network(self,html='<h1>2026 행사</h1><img src="/poster.png">'):
        stack=ExitStack();self.addCleanup(stack.close)
        stack.enter_context(patch.object(repair,'allowed_by_robots',return_value=True))
        stack.enter_context(patch.object(repair,'fetch_html',return_value=(html,'unused')))
        def fetch(url,*args,source_trace=None,**kwargs):
            if source_trace is not None:source_trace.append(url)
            return RAW,'image/png',SHA
        return stack.enter_context(patch.object(repair,'fetch_image',side_effect=fetch))
    def test_keyset_visits_every_published_event_after_first_100(self):
        rows=[target(i) for i in range(1,244)];job=self.job(rows);self.assertEqual(len(job.targets()),243)
        self.assertEqual([call[1].split('afterId=')[1] for call in job.api.calls],['0','100','200'])
    def test_non_advancing_cursor_is_an_error(self):
        job=self.job();job.api.request=lambda *args:[target(1)]*100
        with self.assertRaisesRegex(repair.RunError,'Non-advancing'):job.targets()
    def test_dry_discovery_has_no_mutation_or_live_report_overwrite(self):
        self.mock_network();job=self.job();(job.folder/'report.json').write_text('live')
        self.assertEqual(job.run(),2)
        self.assertEqual(job.queue.rows['1']['state'],'DISCOVERED_FOR_REVIEW')
        self.assertTrue(all(c[0]=='GET' for c in job.api.calls))
        self.assertEqual((job.folder/'report.json').read_text(),'live')
        self.assertTrue((job.folder/'dry-report.json').exists())
    def test_pending_candidate_never_uploaded_approved_selected_or_published(self):
        fetch=self.mock_network();job=self.job(apply=True);state,note=job.discover(target())
        self.assertEqual(state,'WAITING_REVIEW');self.assertEqual(note['candidates'][0]['assetId'],42)
        self.assertEqual(fetch.call_args.kwargs['user_agent'],AGENT)
        self.assertEqual([c[1] for c in job.api.calls],[repair.PATH+'/events/1/assets'])
        value=target();value['assets']=[asset(rights='PENDING',state='PENDING')]
        job.api.calls.clear();self.assertEqual(job.repair(value)[0],'WAITING_REVIEW');self.assertEqual(job.api.calls,[])
    def test_approved_upload_carries_revision_size_hash_and_verifies_actual_public_file(self):
        self.mock_network();job=self.job(apply=True);value=target();value['assets']=[asset(state='PENDING')]
        self.assertEqual(job.store(value,value['assets'][0])[0],'VERIFIED')
        upload=job.api.calls[0];self.assertEqual(upload[1],repair.PATH+'/assets/10/content')
        self.assertEqual(upload[3]['raw'],RAW)
        self.assertEqual(upload[3]['headers'],{'Content-Type':'image/png','X-Image-Size':str(len(RAW)),'X-Image-SHA256':SHA,'X-Asset-Revision':'7'})
    def test_verified_requires_public_asset_identity_storage_url_and_checksum(self):
        self.mock_network();job=self.job();value=target();value.update(assets=[asset()],storedHashes={'10':SHA},banner=asset())
        self.assertEqual(job.verify(value)[0],'VERIFIED')
        for changed in (dict(storedHashes={'10':'0'*64}),dict(assets=[asset(rights='REJECTED')]),dict(assets=[asset(state='PENDING')])):
            self.assertEqual(job.verify({**value,**changed})[0],'PUBLICATION_FAILED')
        job.api.public={'banner':{'id':10,'url':'https://evil.example/poster'}}
        self.assertEqual(job.verify(value)[0],'PUBLICATION_FAILED')
    def test_unreadable_public_file_is_not_completion(self):
        self.mock_network();job=self.job();value=target();value.update(assets=[asset()],storedHashes={'10':SHA},banner=asset())
        with patch.object(repair,'fetch_image',side_effect=TimeoutError):self.assertEqual(job.verify(value)[0],'PUBLICATION_FAILED')
    def test_rejected_candidate_is_not_reregistered(self):
        self.mock_network();job=self.job(apply=True);value=target();value['assets']=[asset(rights='REJECTED')]
        self.assertEqual(job.discover(value)[0],'NO_IMAGE_FOUND');self.assertEqual(job.api.calls,[])
    def test_placeholder_and_invalid_bytes_never_become_candidates(self):
        self.mock_network();job=self.job(apply=True)
        for raw,sha in ((RAW,next(iter(repair.PLACEHOLDER_SHA256))),(b'<html>error</html>',SHA)):
            with patch.object(repair,'fetch_image',return_value=(raw,'image/png',sha)),patch.object(repair,'inspect_image',return_value=sha if raw==RAW else 'invalid'):
                state,note=job.discover(target());self.assertEqual(note['candidates'],[])
        self.assertEqual(job.api.calls,[])
    def test_host_policy_waits_without_downloading_or_expanding_policy(self):
        fetch=self.mock_network('<h1>2026 행사</h1><img src="https://cdn.example/poster.png">');job=self.job(apply=True)
        state,note=job.discover(target());self.assertEqual(state,'WAITING_REVIEW');self.assertEqual(note['candidates'][0]['state'],'WAITING_HOST')
        fetch.assert_not_called();self.assertEqual(self.cfg['imageAllowedHosts'],['official.example'])
    def test_storage_disable_setting_stops_upload_and_source_download(self):
        fetch=self.mock_network();self.cfg['downloadApprovedImages']=False;job=self.job(apply=True)
        value=target();value['assets']=[asset(state='PENDING')]
        self.assertEqual(job.repair(value)[0],'STORAGE_DISABLED');self.assertEqual(job.api.calls,[]);fetch.assert_not_called()
    def test_robots_denied_image_is_reported_and_never_fetched(self):
        fetch=self.mock_network();job=self.job()
        with patch.object(job,'permitted',side_effect=lambda url:url==PAGE):
            self.assertEqual(job.discover(target())[0],'SOURCE_BLOCKED')
        fetch.assert_not_called()
    def test_blocked_page_is_never_fetched(self):
        self.mock_network();self.cfg['blockedSourceHosts']=['official.example'];job=self.job()
        with patch.object(repair,'fetch_html',side_effect=AssertionError('blocked fetch')):
            self.assertEqual(job.discover(target())[0],'SOURCE_BLOCKED')
    def test_notice_fallback_after_primary_source_has_no_image(self):
        self.mock_network();job=self.job()
        with patch.object(repair,'fetch_html',side_effect=[('<h1>2026 행사</h1><a href="/notice/7">행사 안내</a>',''),('<h1>행사 안내</h1><img src="/poster.png">','')]) as pages:
            state,note=job.discover(target())
        self.assertEqual(state,'DISCOVERED_FOR_REVIEW');self.assertEqual(pages.call_count,2)
        self.assertEqual(note['candidates'][0]['sourceUrl'],'https://official.example/notice/7')
    def test_failed_approved_source_still_searches_for_pending_replacement(self):
        self.mock_network('<h1>행사</h1><img src="/replacement.png">');job=self.job(apply=True);value=target();value['assets']=[asset(state='FAILED')]
        with patch.object(job,'store',side_effect=TimeoutError):state,note=job.repair(value)
        self.assertEqual(state,'WAITING_REVIEW');self.assertEqual(note['storageAttempts'][0]['state'],'STORAGE_FAILED')
        self.assertEqual([c[1] for c in job.api.calls],[repair.PATH+'/events/1/assets'])
    def test_explicit_rejected_selection_is_not_silently_changed(self):
        job=self.job(apply=True);value=target();value.update(assets=[asset()],selectedBannerAssetId=99)
        self.assertEqual(job.repair(value)[0],'SELECTION_BLOCKED');self.assertEqual(job.api.calls,[])
    def test_failed_selected_asset_is_repaired_even_when_another_asset_is_stored(self):
        job=self.job(apply=True);value=target();chosen=asset(id=11,state='FAILED')
        value.update(assets=[asset(),chosen],selectedBannerAssetId=11)
        with patch.object(job,'store',return_value=('VERIFIED',{})) as store:
            self.assertEqual(job.repair(value)[0],'VERIFIED');store.assert_called_once_with(value,chosen)
    def test_special_extractor_timeout_still_checks_alternative_official_source(self):
        self.mock_network();job=self.job();value=target();value['event']['sources'].append(dict(kind='OFFICIAL',url='https://takemm.com/prod/view/71267'))
        with patch.object(repair,'collect_detail_sources',side_effect=TimeoutError):state,note=job.discover(value)
        self.assertEqual(state,'DISCOVERED_FOR_REVIEW');self.assertEqual(note['sources'][0]['state'],'FETCH_FAILED')
    def test_generic_private_cache_survives_original_url_expiry_after_approval(self):
        self.mock_network();job=self.job(apply=True);job.discover(target());value=target();value['assets']=[asset(id=42,state='PENDING')]
        job.api.public={'banner':{'id':42,'url':PUBLIC}}
        original=job.api.request
        job.api.request=lambda method,path,*args,**kwargs:asset(id=42) if path.endswith('/content') else original(method,path,*args,**kwargs)
        def public_only(url,*args,**kwargs):
            self.assertEqual(url,PUBLIC,'Expired source should use verified cache');return RAW,'image/png',SHA
        with patch.object(repair,'fetch_image',side_effect=public_only):self.assertEqual(job.store(value,value['assets'][0])[0],'VERIFIED')
    def test_tmm_detail_retains_new_candidate_but_never_overwrites_approved_identity(self):
        self.mock_network('<h1>상품 상세</h1>');job=self.job(apply=True);value=target();page='https://takemm.com/prod/view/71267'
        value['event']['sources']=[dict(kind='OFFICIAL',url=page)]
        image=dict(url=URL,analysisStatus='ATTACHED',sha256=SHA,role='POSTER')
        details=[dict(sourceUrl=page,status='READ',images=[image])]
        with patch.object(repair,'collect_detail_sources',return_value=(details,[])),patch.object(repair,'retain_images') as retain:
            self.assertEqual(job.discover(value)[0],'WAITING_REVIEW');retain.assert_called_once()
            value['assets']=[{**asset(),'pageUrl':page}];retain.reset_mock();job.api.calls.clear()
            job.discover(value);retain.assert_not_called();self.assertEqual(job.api.calls,[])
    def test_racing_existing_approval_does_not_replace_its_private_review_bytes(self):
        self.mock_network();job=self.job(apply=True);job.api.request=lambda *args,**kwargs:dict(id=42,rightsState='APPROVED')
        with patch.object(repair,'retain_images') as retain:
            self.assertEqual(job.discover(target())[0],'ASSET_STATE_CHANGED');retain.assert_not_called()
    def test_daily_limit_rotates_and_network_timeouts_do_not_abort_next_event(self):
        job=self.job([target(i) for i in range(1,5)],max_events=2)
        with patch.object(job,'repair',side_effect=[TimeoutError,('NO_IMAGE_FOUND',{})]):self.assertEqual(job.run(),2)
        seen=[]
        with patch.object(job,'repair',side_effect=lambda row:(seen.append(row['id']) or 'NO_IMAGE_FOUND',{})):job.run()
        self.assertEqual(seen,[3,4])
    def test_delivery_verification_is_not_starved_by_large_missing_queue(self):
        rows=[target(i) for i in range(1,11)];rows[-1]['banner']=asset();job=self.job(rows,max_events=5);seen=[]
        with patch.object(job,'repair',side_effect=lambda row:(seen.append(row['id']) or 'NO_IMAGE_FOUND',{})):job.run()
        self.assertEqual(seen,[1,2,3,4,10])
    def test_changed_fingerprint_invalidates_verified_report_even_if_batch_deferred(self):
        first,second=target(1),target(2);job=self.job([first,second],max_events=1)
        stamp,_=job.queue.due(second,job.policy,repair.now());job.queue.record(second,stamp,'VERIFIED',{},repair.now())
        job.api.rows[1]['revision']=3
        with patch.object(job,'repair',return_value=('NO_IMAGE_FOUND',{})):job.run()
        report=json.loads((job.folder/'dry-report.json').read_text())
        self.assertEqual(report['events'][1]['state'],'NEEDS_RECHECK');self.assertNotIn('VERIFIED',report['counts'])
    def test_global_budget_leaves_work_pending_without_recording_failure(self):
        job=self.job()
        with patch.object(job,'repair',side_effect=repair.BudgetExpired):job.run()
        self.assertEqual(job.queue.rows,{})
        self.assertEqual(json.loads((job.folder/'dry-report.json').read_text())['dueDeferred'],1)
    def test_expired_verification_is_not_counted_complete_when_deferred(self):
        value=target(2);value['banner']=asset();job=self.job([target(1),value],max_events=1)
        stamp,_=job.queue.due(value,job.policy,repair.now());job.queue.record(value,stamp,'VERIFIED',{},repair.now()-timedelta(days=2))
        with patch.object(job,'repair',return_value=('NO_IMAGE_FOUND',{})):job.run()
        self.assertEqual(json.loads((job.folder/'dry-report.json').read_text())['events'][1]['state'],'VERIFICATION_DUE')

class RedirectPolicyTests(unittest.TestCase):
    def test_blocked_redirect_is_rejected_before_connection_or_dns_lookup(self):
        response=Mock(status=302);response.getheader.return_value='https://blocked.example/poster.png'
        connection=Mock();connection.getresponse.return_value=response;visited=[]
        def guard(url):visited.append(url);return 'blocked.example' not in url
        with patch.object(media_fetch,'public_addresses',return_value=['93.184.216.34']) as dns,patch.object(media_fetch,'PinnedHTTPS',return_value=connection):
            with self.assertRaisesRegex(media_fetch.MediaError,'policy denied'):
                media_fetch.fetch_image(URL,['official.example','blocked.example'],url_guard=guard)
        self.assertEqual(dns.call_count,1);self.assertEqual(connection.request.call_count,1)
        self.assertEqual(visited,[URL,'https://blocked.example/poster.png'])

class PublicTransportTests(unittest.TestCase):
    def test_public_request_never_sends_collector_token(self):
        api=Api('https://api.example','secret-'+'x'*32);response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
        response.read.return_value=b'{"banner":null}';api.opener=Mock();api.opener.open.return_value=response
        self.assertEqual(api.public_event(7),{'banner':None})
        request=api.opener.open.call_args.args[0];self.assertIsNone(request.get_header('Authorization'))
        self.assertEqual(request.full_url,'https://api.example/api/public/catalog/events/7')

if __name__=='__main__':unittest.main()
