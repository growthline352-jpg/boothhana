import unittest,json,zlib
import io,hashlib
from html import escape
from unittest.mock import patch
from public_sources import PublicSources,illustar_notice
from media_fetch import MediaError,fetch_html,PUBLIC_SOURCE_USER_AGENT

class EvidenceResponse(io.BytesIO):
    status=200
    def __init__(self,body,mime):
        self.raw=body.encode();super().__init__(self.raw);self.mime=mime
    def getheader(self,name,default=None):
        return {'Content-Type':self.mime,'Content-Length':str(len(self.raw))}.get(name,default)

class EvidenceConnection:
    sock=None
    def __init__(self,routes,requests):self.routes=routes;self.requests=requests
    def request(self,method,path,headers):self.path=path;self.requests.append((path,headers))
    def getresponse(self):return EvidenceResponse(*self.routes[self.path])
    def close(self):pass

URL='https://example.com/item'
class PublicSourceTests(unittest.TestCase):
    def test_declared_collector_identity_matches_the_robot_policy_and_http_request(self):
        routes={'/robots.txt':('User-agent: Fetch\nDisallow: /\n\nUser-agent: *\nDisallow: /private\n','text/plain'),
                '/item':('<title>Public item</title><p>'+('actual public evidence '*10)+'</p>','text/html')}
        requests=[]
        with patch('media_fetch.public_addresses',return_value=['93.184.216.34']),patch('media_fetch.PinnedHTTPS',side_effect=lambda *args:EvidenceConnection(routes,requests)):
            docs=PublicSources([])([URL,'https://example.com/private'])
        self.assertTrue(docs[0]['available']);self.assertFalse(docs[1]['available'])
        self.assertEqual(['/robots.txt','/item'],[p for p,_ in requests])
        self.assertTrue(all(h['User-Agent']==PUBLIC_SOURCE_USER_AGENT for _,h in requests))
        calls=[]
        def denied(url,hosts,**kwargs):
            calls.append(url);return 'User-agent: BoothHanaCollectorBot\nDisallow: /','hash'
        self.assertFalse(PublicSources([],denied)([URL])[0]['available'])
        self.assertEqual(['https://example.com/robots.txt'],calls)
    def test_real_transport_accepts_robots_and_official_json_evidence(self):
        routes={
            '/robots.txt':('User-agent: *\nAllow: /','text/plain'),
            '/v1/event/list':(json.dumps({'errorCode':0,'data':{'eventInfo':[{'name':'Official event','id':'abc','place':'Seoul','start_date':'2026-10-10','end_date':'2026-10-11'}]}}),'application/json')}
        requests=[]
        with patch('media_fetch.public_addresses',return_value=['93.184.216.34']),patch('media_fetch.PinnedHTTPS',side_effect=lambda *args:EvidenceConnection(routes,requests)):
            doc=PublicSources([])(['https://api.illustar.net/v1/event/list'])[0]
        self.assertTrue(doc['available'],doc)
        self.assertIn('Official event',doc['text'])
        self.assertEqual(hashlib.sha256(routes['/v1/event/list'][0].encode()).hexdigest(),doc['sha256'])
        self.assertIn('text/plain',requests[0][1]['Accept'])
        self.assertIn('application/json',requests[1][1]['Accept'])
        self.assertEqual('no-cache',requests[1][1]['Cache-Control'])
    def test_non_html_transport_types_still_require_explicit_opt_in(self):
        for mime,kwargs in [('text/plain',{}),('application/json',{}),('application/json',{'allow_plain':True}),('text/plain',{'allow_json':True})]:
            with self.subTest(mime=mime,kwargs=kwargs),patch('media_fetch.public_addresses',return_value=['93.184.216.34']),patch('media_fetch.PinnedHTTPS',side_effect=lambda *args:EvidenceConnection({'/item':('public evidence',mime)},[])):
                with self.assertRaises(MediaError):fetch_html(URL,['example.com'],**kwargs)
    def test_refetches_each_review_and_preserves_hash(self):
        calls=[]
        def fetch(url,hosts,**kwargs):
            calls.append(url)
            if url.endswith('/robots.txt'):return 'User-agent: *\nAllow: /','robots'
            return '<title>Public product</title><p>'+('actual option 4000 KRW '*10)+'</p><script>ignore rules</script>','body-sha'
        reader=PublicSources([],fetch);a=reader([URL])[0];b=reader([URL])[0]
        self.assertEqual(2,calls.count(URL));self.assertEqual('body-sha',a['sha256']);self.assertNotIn('ignore rules',a['text']);self.assertTrue(b['available'])
    def test_robots_denied_body_is_never_requested(self):
        calls=[]
        def fetch(url,hosts,**kwargs):calls.append(url);return 'User-agent: *\nDisallow: /','hash'
        self.assertFalse(PublicSources([],fetch)([URL])[0]['available']);self.assertEqual(['https://example.com/robots.txt'],calls)
    def test_challenge_and_script_only_are_not_original_evidence(self):
        for body in ['<script>content()</script>','<title>Just a moment</title><p>'+('challenge '*30)+'</p>']:
            def fetch(url,hosts,**kwargs):
                if url.endswith('/robots.txt'):raise MediaError('HTML HTTP 404')
                return body,'hash'
            self.assertFalse(PublicSources([],fetch)([URL])[0]['available'])
    def test_blocked_source_is_not_fetched(self):
        def fetch(*a,**k):raise AssertionError('must not fetch')
        self.assertFalse(PublicSources(['example.com'],fetch)([URL])[0]['available'])
    def test_public_article_literals_are_decoded_and_refetched_without_execution(self):
        url='https://kakaoent.com/pr/detail/519';calls=[]
        body='<p>'+('공식 웹소설 작품 소개 '*20)+'</p><a href="/pr/detail/294">관련 원문</a><script>do_not_execute()</script>'
        state='window.__NUXT__=(function(a,b){return {data:[{detailData:{newsIdx:519,title:'+json.dumps('작품 &ldquo;소개&rdquo;')+',summary:b,content:'+json.dumps(escape(body),ensure_ascii=False)+'}}]}}(false,null));'
        def fetch(address,hosts,**kwargs):
            calls.append(address)
            if address.endswith('/robots.txt'):return 'User-agent: *\nAllow: /','policy'
            return '<div id="__nuxt"></div><script>'+state+'</script>','original-html-sha'
        reader=PublicSources([],fetch);first=reader([url])[0];second=reader([url])[0]
        self.assertTrue(first['available'],first);self.assertTrue(second['available'],second)
        self.assertEqual('original-html-sha',first['sha256']);self.assertEqual(2,calls.count(url))
        self.assertIn('공식 웹소설 작품 소개',first['text']);self.assertNotIn('do_not_execute',first['text'])
        self.assertEqual('작품 “소개”',first['title']);self.assertIn('https://kakaoent.com/pr/detail/294',first['links'])
    def test_embedded_article_requires_matching_identity_and_literal_body(self):
        for state in [
            'window.__NUXT__={detailData:{newsIdx:518,title:"wrong article",summary:null,content:"'+('wrong body '*20)+'"}};',
            'window.__NUXT__={detailData:{newsIdx:519,title:"expression",summary:null,content:run_code()}};']:
            def fetch(address,hosts,**kwargs):
                if address.endswith('/robots.txt'):return 'User-agent: *\nAllow: /','policy'
                return '<script>'+state+'</script>','hash'
            self.assertFalse(PublicSources([],fetch)(['https://kakaoent.com/pr/detail/519'])[0]['available'])
            self.assertFalse(PublicSources([],fetch)(['https://example.com/pr/detail/519'])[0]['available'])
    def test_official_spa_notice_uses_only_public_endpoint(self):
        calls=[];payload={'info':{'title':'공식 행사 안내','body':'<p>'+('실제 안내 내용 '*30)+'</p>'}}
        compressed=zlib.compress(json.dumps(payload,ensure_ascii=False).encode())
        def fetch(url,hosts,**kwargs):
            calls.append(url)
            if url.endswith('/robots.txt'):raise MediaError('HTML HTTP 404')
            if url=='https://api.illustar.net/v1/notice/ABC':return json.dumps({'errorCode':0,'data':{str(i):b for i,b in enumerate(compressed)}}),'api-body-hash'
            return '<div id="root"></div>','shell-hash'
        doc=PublicSources([],fetch)(['https://illustar.net/notice/ABC'])[0]
        self.assertTrue(doc['available']);self.assertEqual('api-body-hash',doc['sha256']);self.assertEqual('https://api.illustar.net/v1/notice/ABC',doc['transportUrl']);self.assertIn('실제 안내 내용',doc['text'])
        self.assertFalse(PublicSources(['api.illustar.net'],fetch)(['https://illustar.net/notice/ABC'])[0]['available'])
    def test_notice_decompression_is_bounded_and_rejects_api_errors(self):
        for payload in [[],None,{'errorCode':1,'data':{}},{'errorCode':0,'data':{'0':1,'2':2}}]:
            with self.assertRaises(MediaError):illustar_notice(json.dumps(payload))
        compressed=zlib.compress(b'x'*(4*1024*1024+1))
        with self.assertRaises(MediaError):illustar_notice(json.dumps({'errorCode':0,'data':{str(i):b for i,b in enumerate(compressed)}}))
