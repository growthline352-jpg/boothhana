import hashlib,json,os,unittest
from unittest.mock import patch,Mock
from urllib.parse import urlsplit,parse_qs
from social_sources import SocialSources,feed_url,social_route,x_json
from media_fetch import MediaError
from public_sources import context_urls
from run import child_environment
from pathlib import Path

PROFILE='https://bsky.app/profile/artist.bsky.social'
DID='did:plc:abc123'
def post(pid,author=DID):
    return {'uri':'at://'+author+'/app.bsky.feed.post/'+pid,'author':{'did':author,'handle':'artist.bsky.social'},'record':{'text':'판매표 '+pid,'createdAt':'2026-10-09T00:00:00Z'},'embed':{'$type':'app.bsky.embed.images#view','images':[{'fullsize':'https://cdn.bsky.app/'+pid+'.jpg'}]}}
class SocialSourceTests(unittest.TestCase):
    def loader(self,rows,cursor=None):
        def fetch(url,hosts,**kwargs):
            if 'getProfile' in url:value={'did':DID,'handle':'artist.bsky.social','description':'공식 작가'}
            elif 'getPosts' in url:
                pid=parse_qs(urlsplit(url).query)['uris'][0].rsplit('/',1)[-1];value={'posts':[post(pid)]}
            else:value={'feed':rows,**({'cursor':cursor} if cursor else {})}
            raw=json.dumps(value,ensure_ascii=False);return raw,hashlib.sha256(raw.encode()).hexdigest()
        return SocialSources([],fetch=fetch)
    def test_native_bluesky_posts_have_author_media_hash_and_real_cursor(self):
        loader=self.loader([{'post':post('abc')},{'post':post('other','did:plc:other'),'reason':{'$type':'repost'}}],'next/one')
        docs=loader([feed_url(PROFILE)])
        self.assertEqual(3,len(docs));self.assertEqual(PROFILE+'/post/abc',docs[1]['url'])
        self.assertEqual(DID,docs[1]['platformAccountId']);self.assertIn('getAuthorFeed',docs[1]['transportUrl'])
        self.assertEqual(feed_url(PROFILE,'next/one'),docs[0]['nextPageUrl']);self.assertEqual(1,len(docs[1]['images']))
        self.assertEqual(['abc'],docs[0]['socialPageReceipt']['postIds']);self.assertEqual(64,len(docs[0]['sha256']))
    def test_post_lookup_rejects_wrong_author_even_on_the_right_post_id(self):
        loader=self.loader([])
        def fetch(url,hosts,**kwargs):
            data={'did':DID,'handle':'artist.bsky.social'} if 'getProfile' in url else {'posts':[post('abc','did:plc:other')]}
            return json.dumps(data),'a'*64
        loader.fetch=fetch;self.assertFalse(loader([PROFILE+'/post/abc'])[0]['available'])
    def test_verified_account_id_detects_recycled_handle(self):
        loader=self.loader([]);loader.expected_accounts={PROFILE:'did:plc:previous'}
        doc=loader([PROFILE])[0];self.assertTrue(doc['identityMismatch']);self.assertEqual(DID,doc['platformAccountId'])
        self.assertFalse(loader([feed_url(PROFILE)])[1]['available'])
    def test_incremental_scan_stops_at_the_previous_checkpoint(self):
        loader=self.loader([{'post':post(p)} for p in ['new','known','older']],'another')
        loader.stop_posts={PROFILE:'known'};docs=loader([feed_url(PROFILE)])
        self.assertEqual(['new'],docs[0]['socialPageReceipt']['postIds']);self.assertIsNone(docs[0]['nextPageUrl'])
        self.assertEqual('new',docs[0]['socialPageReceipt']['headPostId']);self.assertEqual(3,len(docs))
    def test_quoted_artist_media_is_not_attributed_to_this_artist(self):
        row=post('abc');row['embed']={'$type':'app.bsky.embed.recordWithMedia#view','record':{'images':[{'fullsize':'https://cdn.bsky.app/other.jpg'}]},'media':row['embed']}
        docs=self.loader([{'post':row}])([feed_url(PROFILE)])
        self.assertEqual(['https://cdn.bsky.app/abc.jpg'],[m['imageUrl'] for m in docs[1]['images']])
    def test_x_without_credentials_is_unavailable_and_never_calls_api(self):
        fetch=Mock()
        with patch.dict(os.environ,{},clear=True):docs=SocialSources([],x_fetch=fetch)(['https://x.com/artist'])
        self.assertFalse(docs[0]['available']);fetch.assert_not_called();self.assertNotIn('COMPLETE',json.dumps(docs))
    def test_x_native_media_long_text_and_author_binding(self):
        def fetch(url,token):
            self.assertEqual('private',token)
            data={'data':{'id':'123','username':'artist'}} if '/users/by/username/' in url else {'data':[{'id':'456','author_id':'123','text':'short','note_post':{'text':'完整 판매표','entities':{'urls':[{'expanded_url':'https://store.example.com/item'}]}},'attachments':{'media_keys':['pic']}}], 'includes':{'media':[{'media_key':'pic','type':'photo','url':'https://pbs.twimg.com/pic.jpg'}]},'meta':{'next_token':'next'}}
            raw=json.dumps(data);return raw,hashlib.sha256(raw.encode()).hexdigest()
        with patch.dict(os.environ,{'X_BEARER_TOKEN':'private'}):docs=SocialSources([],x_fetch=fetch)(['https://x.com/artist?bh_feed=1'])
        self.assertEqual('123',docs[0]['platformAccountId']);self.assertIn('完整',docs[1]['text']);self.assertEqual('https://x.com/artist/status/456',docs[1]['url'])
        self.assertNotIn('private',json.dumps(docs));self.assertNotIn('X_BEARER_TOKEN',child_environment(Path('.'),{'X_BEARER_TOKEN':'private'}))
    def test_bearer_is_not_forwarded_to_redirects(self):
        connection=Mock();response=Mock();response.status=302;connection.getresponse.return_value=response
        with patch('social_sources.public_addresses',return_value=['1.1.1.1']),patch('social_sources.PinnedHTTPS',return_value=connection):
            with self.assertRaises(MediaError):x_json('https://api.x.com/2/users/by/username/artist','private')
        connection.request.assert_called_once();connection.close.assert_called_once()
    def test_foreign_hosts_status_routes_and_cursor_injection(self):
        for url in ['https://x.com.evil.test/artist','https://x.com@evil.test/artist','http://x.com/artist','https://x.com:444/artist','https://x.com/search?q=artist','https://bsky.app/profile/artist.bsky.social#fragment']:self.assertIsNone(social_route(url))
        loader=self.loader([])
        for suffix in ['?bh_feed=1&bh_cursor=','?bh_feed=1&bh_cursor=a&bh_cursor=b','?url=https://evil.test']:
            self.assertFalse(loader([PROFILE+suffix])[0]['available'])
    def test_context_reuses_booth_links_and_approved_creator_accounts(self):
        context={'creator':{'data':{'profileUrl':'https://comicw.net/creator/1'}},'creatorProvenance':[{'officialLinks':[PROFILE],'sources':[{'url':'https://comicw.net/event/1','access':'ORIGINAL'}]}],'publication':{'data':{'socialAccounts':[{'profileUrl':'https://x.com/artist'}]}},'creatorSources':[{'socialAccounts':[{'profileUrl':PROFILE}]}]}
        self.assertEqual(4,len(context_urls(context)));self.assertIn(PROFILE,context_urls(context))
    def test_public_postype_sale_sheet_images_are_attached_even_with_little_body_text(self):
        from public_sources import PublicSources
        def fetch(url,hosts,**kwargs):
            if url.endswith('/robots.txt'):raise MediaError('HTML HTTP 404')
            return '<title>작가 판매표</title><img src="https://cdn.example.com/sale.png"><img src>','a'*64
        url='https://artist.postype.com/post/123';doc=PublicSources([],fetch=fetch)([url])[0]
        self.assertTrue(doc['available']);self.assertEqual([{'imageUrl':'https://cdn.example.com/sale.png','pageUrl':url}],doc['images'])
