import unittest,json,zlib
from public_sources import PublicSources,illustar_notice
from media_fetch import MediaError

URL='https://example.com/item'
class PublicSourceTests(unittest.TestCase):
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
