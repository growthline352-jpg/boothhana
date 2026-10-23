import hashlib,json,unittest,tempfile
from pathlib import Path
from urllib.robotparser import RobotFileParser
from unittest.mock import patch
from public_sources import PublicSources
from tmm_sources import tmm_route,tmm_document,tmm_policies,request_allowed
from media_fetch import MediaError
from graph_worker import Worker,configuration,schema
from run import RunError

URL='https://takemm.com/event/%40mdcrsweethome/timeline'
DATE='2026-10-25(일) 오후 12시 00분'
def snapshot(url=URL):
    return {'url':url,'anonymous':True,'title':'공개 행사 - TMM 폼','dateText':DATE,
            'text':'공개 행사\n행사 날짜\n'+DATE+'\n행사 장소\n부스 신청 및 입장권 구매자에게만 공개\n아직 공개된 부스가 없습니다.',
            'links':['https://takemm.com/event/@mdcrsweethome/info']}
def fetch(url,hosts,**kwargs):
    if url.endswith('/robots.txt'):return 'User-agent: *\nAllow: /','robots'
    return '<title>공개 행사</title><p>'+('행사 날짜 행사 장소 상품 부스 ' * 10)+'</p>','http-original-hash'

class TmmSourcesTests(unittest.TestCase):
    def test_rendered_public_date_is_not_lost_in_the_initial_html_stub(self):
        with patch('public_sources.render_tmm_page',side_effect=lambda url,policies:snapshot(url),create=True):
            doc=PublicSources([],fetch)([URL])[0]
        self.assertTrue(doc['available'],doc);self.assertIn(DATE,doc['text'])
        self.assertTrue(doc['publicViewPartial']);self.assertEqual('ANONYMOUS_BROWSER_DOM',doc['captureMethod'])
        self.assertEqual('http-original-hash',doc['httpSha256']);self.assertNotEqual(doc['httpSha256'],doc['sha256'])
    def test_extract_and_review_refetch_all_public_tabs_without_opening_private_routes(self):
        with patch('public_sources.render_tmm_page',side_effect=lambda url,policies:snapshot(url),create=True) as render:
            reader=PublicSources([],fetch);first=reader([URL]);second=reader([URL])
        self.assertEqual(3,len(first));self.assertEqual(3,len(second));self.assertEqual(6,render.call_count)
        self.assertEqual({'timeline','info','store'},{c.args[0].rsplit('/',1)[-1] for c in render.call_args_list})
        self.assertTrue(all(d['publicViewPartial'] for d in first+second))
    def test_event_routes_exclude_account_map_queries_and_encoded_traversal(self):
        self.assertEqual(('mdcrsweethome','timeline'),tmm_route(URL))
        for url in ('http://takemm.com/event/@a/info','https://takemm.com/event/map/2073','https://takemm.com/event/@a/apply',
                    'https://takemm.com/event/@a/info?private=1','https://takemm.com/event/@a/info#login',
                    'https://user:pass@takemm.com/event/@a/info','https://takemm.com/event/@..%2Fadmin/info',
                    'https://other.test/event/@a/info','https://takemm.com/account'):
            self.assertIsNone(tmm_route(url),url)
    def test_document_requires_fresh_anonymous_same_event_and_visible_date(self):
        for change in ({'anonymous':False},{'url':'https://takemm.com/event/@other/timeline'},
                       {'url':'https://takemm.com/event/@mdcrsweethome/store'},
                       {'dateText':''},{'text':'Only a loading placeholder'},{'title':'Access denied'}):
            with self.subTest(change=change),self.assertRaises(MediaError):tmm_document(URL,{**snapshot(),**change})
        doc=tmm_document(URL,snapshot());self.assertEqual(hashlib.sha256(doc['text'].encode()).hexdigest(),doc['sha256'])
        self.assertIn('not HTTP response bytes',doc['hashScope']);self.assertIn('비공개',doc['text'])
        self.assertNotIn('platformAccountId',doc)
    def test_network_is_read_only_exact_publisher_hosts_and_obeys_robots(self):
        policies=tmm_policies([],fetch,{})
        self.assertTrue(request_allowed('https://api.takemm.com/public/event','GET',policies))
        for url,method in [('https://api.takemm.com/public/event','POST'),('https://takemm.com/buy','DELETE'),
                           ('https://takemm.com.evil.test/event','GET'),('http://takemm.com/event','GET'),
                           ('https://takemm.com:444/event','GET'),('https://user:pass@takemm.com/event','GET')]:
            self.assertFalse(request_allowed(url,method,policies))
        policies['api.takemm.com']=RobotFileParser();policies['api.takemm.com'].parse(['User-agent: *','Disallow: /private'])
        self.assertFalse(request_allowed('https://api.takemm.com/private/event','GET',policies))
    def test_blocked_dependency_and_robots_denial_do_not_launch_a_browser(self):
        with patch('public_sources.render_tmm_page',side_effect=AssertionError('must not render')) as render:
            docs=PublicSources(['api.takemm.com'],fetch)([URL]);self.assertTrue(all(d.get('publicViewPartial') for d in docs));render.assert_not_called()
        calls=[]
        def denied(url,hosts,**kwargs):calls.append(url);return 'User-agent: *\nDisallow: /','robots'
        with patch('public_sources.render_tmm_page') as render:
            docs=PublicSources([],denied)([URL]);self.assertTrue(all(not d['available'] for d in docs));render.assert_not_called()
        self.assertEqual(['https://takemm.com/robots.txt'],calls)
    def test_browser_failure_keeps_partial_html_without_inventing_a_schedule(self):
        with patch('public_sources.render_tmm_page',side_effect=MediaError('Browser unavailable')):
            doc=PublicSources([],fetch)([URL])[0]
        self.assertTrue(doc['available']);self.assertTrue(doc['publicViewPartial']);self.assertIn('renderFailure',doc)
        self.assertNotIn(DATE,doc['text']);self.assertNotIn('captureMethod',doc)
    def test_unavailable_robots_is_distinct_from_rate_limit_server_failure_or_forbidden_page(self):
        def unavailable(url,hosts,**kwargs):raise MediaError('HTML HTTP 403')
        self.assertEqual(3,len(tmm_policies([],unavailable,{})))
        for error in ('HTML HTTP 429','HTML HTTP 503','Connection error'):
            def failure(url,hosts,**kwargs):raise MediaError(error)
            with self.assertRaises(MediaError):tmm_policies([],failure,{})
        def denied_page(url,hosts,**kwargs):
            if url.endswith('/robots.txt'):return 'User-agent: *\nAllow: /','robots'
            raise MediaError('HTML HTTP 403')
        with patch('public_sources.render_tmm_page') as render:
            self.assertTrue(all(not d['available'] for d in PublicSources([],denied_page)([URL])));render.assert_not_called()
    def test_excerpt_is_bounded_and_does_not_include_arbitrary_snapshot_fields(self):
        value=snapshot();value['text']+='x'*50000;value['apiToken']='PRIVATE';value['hiddenVenue']='PRIVATE'
        doc=tmm_document(URL,value);self.assertTrue(doc['truncated']);self.assertNotIn('PRIVATE',doc['text'])
        self.assertEqual(50000,len(json.loads(doc['text'])['visibleText']))
    def stage(self):
        return {'searchStatus':'COMPLETE','summary':'Current public page','queries':['event'],
                'coverage':{'completeness':'COMPLETE','reportedTotal':None,'totalUnit':'UNKNOWN',
                            'visitedPages':[URL],'nextPageUrl':'https://example.com/products?page=2','warnings':[]},
                'participants':[],'sales':None,'pageBatch':None}
    def test_gated_event_map_is_not_exported_as_a_research_lead(self):
        value=snapshot();value['links']+=['https://takemm.com/event/map/2073?event_url=mdcrsweethome']
        self.assertEqual(['https://takemm.com/event/@mdcrsweethome/info'],tmm_document(URL,value)['links'])
    def test_rendered_view_cannot_finish_catalogue_and_preserves_other_continuations(self):
        doc=tmm_document(URL,snapshot())
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp
            worker=Worker(cfg,api=object(),search=lambda *a,**k:(json.dumps(self.stage()),True,{}),source_loader=lambda urls:[doc])
            value,audit=worker.call(Path(temp)/'extract','test',schema('SALES'),[],[URL])
        self.assertEqual('PARTIAL',value['coverage']['completeness'])
        self.assertEqual('PARTIAL',value['searchStatus'])
        self.assertEqual('https://example.com/products?page=2',value['coverage']['nextPageUrl'])
        self.assertEqual(doc['sha256'],audit['sourceDocuments'][0]['sha256'])
    def test_partial_rendered_page_cannot_claim_a_complete_product_batch(self):
        doc=tmm_document(URL,snapshot());value=self.stage()
        value['pageBatch']={'sourceUrl':URL,'sourceHash':doc['sha256'],'offset':0,'total':101,'labels':['one']}
        with tempfile.TemporaryDirectory() as temp:
            cfg=configuration();cfg['stateDirectory']=temp
            worker=Worker(cfg,api=object(),search=lambda *a,**k:(json.dumps(value),True,{}),source_loader=lambda urls:[doc])
            with self.assertRaisesRegex(RunError,'complete captured original'):
                worker.call(Path(temp)/'extract','test',schema('SALES'),[],[URL])

if __name__=='__main__':unittest.main()
