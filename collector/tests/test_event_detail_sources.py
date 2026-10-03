from copy import deepcopy
import io,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import event_detail_sources as details
import weekly
from data_quality import missing_reasons,merge_enrichment,select_targets,attempt_record
from visitor_guide import validate_guide
from rules import public_url

URL='https://takemm.com/prod/view/12345'

def raw_product(body=None):
    return json.dumps({'code':'SUCCESS/','data':{'prod_info':{
        'prod_id':12345,'title':'가상 생일카페',
        'contents':body or '<p>10/10 테이블 예약 50분. QR 캡처 불가.</p><img src="https://image.takemm.com/menu.jpg"><p>🇲 🇪 🇳 🇺 음료 6,500원</p>',
        'open_date':'2026-09-26T21:00:00','close_date':'2026-10-02T00:00:00','status':'fin',
        'bank_account':'PRIVATE_ACCOUNT','email':'PRIVATE_EMAIL','password':'PRIVATE_PASSWORD'},
        'user_data':{'name':'PRIVATE_USER'},'seller_data':{'phone':'PRIVATE_PHONE'}}},ensure_ascii=False).encode()

def event():
    value=json.loads((weekly.ROOT/'examples/v5/events.json').read_text(encoding='utf-8'))['events'][0]
    value.update(subcategory='BIRTHDAY_CAFE',eventFormat='SINGLE_HOST',visitorGuide=None)
    value['sources']=[dict(url=URL,kind='OFFICIAL',access='ORIGINAL',evidence='가상 주최자 공개 예약폼')]
    return value

class DetailSourceTests(unittest.TestCase):
    def test_strict_public_fact_projection_and_hidden_html(self):
        value=details.parse_tmm_product(raw_product('<script>SECRET_SCRIPT</script><template>SECRET_TEMPLATE</template><p>QR 안내</p>'),URL,'2026-10-03')
        serialized=json.dumps(value)
        for secret in ('PRIVATE_ACCOUNT','PRIVATE_EMAIL','PRIVATE_PASSWORD','PRIVATE_USER','PRIVATE_PHONE','SECRET_SCRIPT','SECRET_TEMPLATE'):
            self.assertNotIn(secret,serialized)
        self.assertEqual(value['bodyText'],'QR 안내')
        self.assertEqual(value['formStateRaw'],'fin')
        self.assertEqual(value['reservationOpenRaw'],'2026-09-26T21:00:00')
    def test_mismatched_or_restricted_product_is_not_read(self):
        for change in ('identity','restricted','empty'):
            value=json.loads(raw_product())
            if change=='identity':value['data']['prod_info']['prod_id']=999
            if change=='restricted':value['code']='FAIL/PASSWORD_REQUIRED'
            if change=='empty':value['data']['prod_info']['contents']=''
            with self.assertRaises(ValueError):details.parse_tmm_product(json.dumps(value).encode(),URL,'2026-10-03')
    def test_source_urls_are_exact_and_no_private_image_hosts(self):
        for url in ('http://takemm.com/prod/view/12345','https://takemm.com.evil.org/prod/view/12345','https://user:pass@takemm.com/prod/view/12345','https://takemm.com:8443/prod/view/12345'):
            self.assertIsNone(details.tmm_product_url(url))
        self.assertEqual(details.tmm_product_url(URL+'?tracking=1'),URL)
        value=details.parse_tmm_product(raw_product('<img src="https://127.0.0.1/secret"><img src="https://evil.org/x"><p>QR 안내</p>'),URL,'2026-10-03')
        self.assertEqual(value['images'],[])
    def test_menu_image_first_limit_four_and_resume_without_network(self):
        body=''.join(f'<img src="https://image.takemm.com/{i}.jpg"><p>{"MENU 메뉴" if i==5 else "선물"}</p>' for i in range(7))
        calls=[]
        def fetch(url,*args):calls.append(url);return raw_product(body)
        def image(url,*args):calls.append(url);return b'fictional-image','image/jpeg','a'*64
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            observations,files=details.collect_detail_sources(event(),directory,[],fetcher=fetch,image_fetcher=image,robots_checker=lambda *args:True)
            self.assertEqual(len(files),4)
            self.assertIn('/5.jpg',calls[1])
            self.assertEqual(observations[0]['status'],'READ')
            count=len(calls)
            cached=details.collect_detail_sources(event(),directory,[],fetcher=lambda *args:self.fail('Resume fetched'),robots_checker=lambda *args:self.fail('Resume robots'))
            self.assertEqual(cached,(observations,files));self.assertEqual(len(calls),count)
            self.assertNotIn('PRIVATE', (directory/'detail-sources.json').read_text(encoding='utf-8'))
            self.assertIn('DETAIL_IMAGES_NOT_FULLY_READ',details.detail_coverage_issues(event(),observations))
    def test_robots_or_config_blocks_before_fetch_and_restricted_api_stays_inaccessible(self):
        for hosts,robots in [(['takemm.com'],True),([],False)]:
            with tempfile.TemporaryDirectory() as tmp:
                observations,files=details.collect_detail_sources(event(),Path(tmp),hosts,fetcher=lambda *args:self.fail('Blocked fetched'),robots_checker=lambda *args:robots)
                self.assertEqual(observations[0]['status'],'BLOCKED');self.assertEqual(files,[])
        with tempfile.TemporaryDirectory() as tmp:
            observations,files=details.collect_detail_sources(event(),Path(tmp),[],fetcher=lambda *args:b'{"code":"FAIL/PASSWORD_REQUIRED"}',robots_checker=lambda *args:True)
            self.assertEqual(observations[0]['status'],'INACCESSIBLE');self.assertEqual(files,[])
    def test_unrelated_source_does_not_start_network(self):
        value=event();value['sources'][0]['url']='https://example.com/event'
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(details.collect_detail_sources(value,Path(tmp),[],fetcher=lambda *args:self.fail()),([],[]))
    def test_tmm_first_detail_read_is_queued_even_if_general_fields_complete(self):
        target=dict(id=11,event=event())
        with patch('data_quality.missing_reasons',return_value=[]):
            self.assertEqual(select_targets([target],{},1,[]),[target])
            self.assertEqual(select_targets([target],{'11':attempt_record(target['event'],'SUCCESS',[URL])},1,[]),[])
            self.assertEqual(select_targets([target],{'11':attempt_record(target['event'],'FAILED',[URL])},1,[]),[target])
    def test_document_rejects_redirect_html_and_oversize_without_retaining_body(self):
        class Response:
            def __init__(self,status,headers):self.status=status;self.headers=headers
            def getheader(self,key,default=None):return self.headers.get(key,default)
            def read(self,size):return b''
        for status,headers in [(302,{}),(200,{'Content-Type':'text/html'}),(200,{'Content-Type':'application/json','Content-Length':str(details.MAX_DOCUMENT_BYTES+1)}),(200,{'Content-Type':'application/json','Content-Encoding':'gzip'})]:
            connection=unittest.mock.Mock();connection.getresponse.return_value=Response(status,headers)
            with patch.object(details,'public_addresses',return_value=['8.8.8.8']),patch.object(details,'PinnedHTTPS',return_value=connection):
                with self.assertRaises(ValueError):details.fetch_document('https://api.takemm.com/prod/view?last_selection_id=12345',details.API_HOSTS,5)
            connection.close.assert_called_once()
    def test_missing_guide_sections_and_safe_title_description_upgrade(self):
        value=event();value['description']=value['name']
        self.assertIn('MISSING_DESCRIPTION',missing_reasons(value))
        observation=details.parse_tmm_product(raw_product(),URL,'2026-10-03');observation['status']='READ'
        self.assertEqual(details.detail_coverage_issues(value,[observation]),['MISSING_DETAIL_MENU','MISSING_DETAIL_VISIT_FAQ','MISSING_DETAIL_RESERVATION'])
        observed=deepcopy(value);observed['description']='확인된 상세 소개'
        self.assertEqual(merge_enrichment(value,observed)['description'],'확인된 상세 소개')
        value['description']='기존 편집 소개'
        self.assertEqual(merge_enrichment(value,observed)['description'],'기존 편집 소개')
    def test_existing_menu_price_note_survives_conflicting_new_observation(self):
        value=event()
        sale=dict(id='menu',title='메뉴',salesMethod='현장 주문',salesStartsAt=None,salesEndsAt=None,pickupDay=None,note='딸기라떼 6,500원',sourceUrl=URL,checkedOn='2026-10-02')
        value['visitorGuide']=dict(tickets=[],programs=[],faq=[],sales=[sale],coverage=[])
        observed=deepcopy(value);observed['visitorGuide']['sales'][0].update(note='딸기라떼 7,500원',checkedOn='2026-10-03')
        merged=merge_enrichment(value,observed)
        self.assertEqual(merged['visitorGuide']['sales'][0]['note'],'딸기라떼 6,500원')
        self.assertTrue(any('관람 안내 충돌 검토' in note and URL in note for note in merged['warnings']))

class DetailPipelineTests(unittest.TestCase):
    def test_images_reach_cli_source_audit_and_missing_menu_prevents_complete(self):
        value=event();observed=deepcopy(value)
        observed['visitorGuide']={'tickets':[],'programs':[],'faq':[dict(id='qr',question='QR 안내?',answer='10/10 캡처 불가',status='CONFIRMED',sourceUrl=URL,checkedOn='2026-10-03')],'sales':[],'coverage':[]}
        result=dict(schemaVersion='1',searchStatus='COMPLETE',summary='가상 조사',queries=['가상'],events=[observed],sourceCoverage=[dict(channel='ORGANIZER_OFFICIAL',status='CHECKED',queries=['가상'],checkedUrls=[URL],notes='공개 원문')])
        source=details.parse_tmm_product(raw_product(),URL,'2026-10-03');source['status']='READ'
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);cfg=weekly.load_config(None);cfg['stateDirectory']=str(root/'state')
            scope=dict(region='SEOUL_GYEONGGI',timezone='Asia/Seoul',startDate='2026-10-01',endDate='2026-10-31')
            image=root/'menu.png';stream=io.BytesIO();Image.new('RGB',(2,2)).save(stream,format='PNG');image.write_bytes(stream.getvalue())
            source['images'][0].update(analysisStatus='ATTACHED',imageFile=image.name)
            def cli(cfg,folder,prompt,schema,*,images):
                self.assertEqual(images,[image]);self.assertIn('publicDetailSources',prompt)
                self.assertNotIn('PRIVATE_ACCOUNT',prompt)
                (folder/'codex.jsonl').write_text('{}\n')
                return json.dumps(result,ensure_ascii=False).encode(),True,{}
            with patch.object(weekly,'collect_detail_sources',return_value=([source],[image])),patch.object(weekly,'execute_search',side_effect=cli),patch.object(weekly,'audit_opened_urls',return_value=['https://example.com/other']):
                pipeline=weekly.Pipeline(cfg,root/'run',scope,dry_run=True)
                pipeline.enrich_event(dict(id=11,revision=1,event=value))
            folder=root/'run/jobs/enrichment-11-1'
            payload=json.loads((folder/'payload.json').read_text(encoding='utf-8'))
            self.assertEqual(payload['result']['searchStatus'],'PARTIAL')
            self.assertIn('MISSING_DETAIL_MENU',payload['result']['summary'])
            audit=json.loads((folder/'audit.json').read_text(encoding='utf-8'))
            self.assertEqual(audit['openedUrls'],['https://example.com/other'])
            self.assertEqual(audit['fetchedSourceUrls'],[URL])
            self.assertFalse(any('checked URLs' in issue for issue in pipeline.issues))
            validate_guide(payload['result']['events'][0]['visitorGuide'],value['occurrences'],public_url)

if __name__=='__main__':unittest.main()
