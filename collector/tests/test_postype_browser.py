import copy,json,tempfile,threading,time,unittest
from pathlib import Path
from datetime import datetime,timezone
from unittest.mock import Mock
from postype_browser import channel_route,postype_document
from public_sources import PublicSources
from media_fetch import MediaError

BASE='https://www.postype.com/@artist'
def snapshot(page=2,total=28):
 count=min(12,total-(page-1)*12);pages=max(1,(total+11)//12)
 return {'url':BASE+'?page='+str(page),'anonymous':True,'blocked':False,'title':'공개 채널',
  'activities':[{'text':'총 '+str(total)+'개',
   'posts':[{'url':BASE+'/post/'+str(i),'title':'공개 글 '+str(i),'text':'작가\n공개 글 '+str(i)+'\n성인\n500P'} for i in range((page-1)*12+1,(page-1)*12+count+1)],
   'navs':[{'buttons':[{'label':'이전 페이지','text':'','selected':False,'disabled':page==1}]+
    [{'label':'','text':str(i),'selected':i==page,'disabled':False} for i in range(1,pages+1)]+
    [{'label':'다음 페이지','text':'','selected':False,'disabled':page==pages}]}]}]}

class PostypeBrowserTests(unittest.TestCase):
 def test_visible_current_page_can_continue_without_claiming_paid_body_or_whole_catalog(self):
  value=snapshot();before=copy.deepcopy(value);doc=postype_document(BASE+'?page=2',value)
  self.assertEqual(before,value);self.assertTrue(doc['available']);self.assertTrue(doc['channelPageVerified'])
  self.assertEqual(12,len(doc['pagination']['entryUrls']));self.assertEqual(BASE+'?page=3',doc['pagination']['nextPageUrl'])
  self.assertTrue(doc['publicViewPartial']);self.assertEqual('ANONYMOUS_BROWSER_DOM',doc['captureMethod'])
  self.assertIn('not HTTP',doc['hashScope']);self.assertIn('500P',doc['text']);self.assertNotIn('price',doc)
 def test_wrong_page_actor_duplicate_region_missing_card_or_changed_controls_are_not_verified(self):
  for change in ('page','actor','duplicate','missing','selected','disabled','anonymous'):
   value=snapshot()
   if change=='page':value['url']=BASE+'?page=1'
   elif change=='actor':value['url']='https://www.postype.com/@other?page=2'
   elif change=='duplicate':value['activities']*=2
   elif change=='missing':value['activities'][0]['posts'].pop()
   elif change=='selected':value['activities'][0]['navs'][0]['buttons'][2]['selected']=False
   elif change=='disabled':value['activities'][0]['navs'][0]['buttons'][-1]['disabled']=True
   else:value['anonymous']=False
   with self.subTest(change=change),self.assertRaises(MediaError):postype_document(BASE+'?page=2',value)
 def test_last_page_inventory_terminates_but_public_metadata_stays_partial(self):
  doc=postype_document(BASE+'?page=3',snapshot(3))
  self.assertEqual(4,len(doc['pagination']['entryUrls']));self.assertIsNone(doc['pagination']['nextPageUrl']);self.assertTrue(doc['publicViewPartial'])
 def test_private_api_post_routes_and_unknown_queries_are_never_capture_targets(self):
  for url in (BASE+'/post/123',BASE+'?page=0',BASE+'?page=2&page=3',BASE+'?activity-type=request',BASE+'?secret=1',
              'https://api.postype.com/api/v2/channel/1/activity/all','https://www.postype.com/login','https://user:password@www.postype.com/@artist'):
   with self.subTest(url=url):self.assertIsNone(channel_route(url))
 def test_initial_html_shell_uses_renderer_only_after_page_robots_allow(self):
  renderer=Mock(return_value=snapshot());calls=[]
  def fetch(url,hosts,**kwargs):
   calls.append(url)
   return ('User-agent: *\nAllow: /' if url.endswith('/robots.txt') else '<title>공개 채널</title><p>공개 프로필 소개입니다.</p><div id="activity-content"></div>'+'공개 소개 '*30,'a'*64)
  result=PublicSources([],fetch=fetch,postype_renderer=renderer)([BASE+'?page=2'])[0]
  renderer.assert_called_once_with(BASE+'?page=2');self.assertTrue(result['channelPageVerified']);self.assertEqual('a'*64,result['httpSha256'])
  self.assertFalse(any('api.postype.com' in url for url in calls))
 def test_disallowed_channel_is_not_rendered(self):
  renderer=Mock();fetch=Mock(return_value=('User-agent: *\nDisallow: /','a'*64))
  result=PublicSources([],fetch=fetch,postype_renderer=renderer)([BASE+'?page=2'])[0]
  renderer.assert_not_called();self.assertFalse(result['available'])
 def test_invalid_renderer_keeps_http_profile_unverified_and_pending_is_not_empty_success(self):
  from browser_sources import BrowserPending
  def fetch(url,hosts,**kwargs):return ('User-agent: *\nAllow: /' if url.endswith('/robots.txt') else '<title>공개 채널</title><p>'+'공개 소개 '*30+'</p><div id="activity-content"></div>','b'*64)
  failed=Mock(side_effect=MediaError('Login required'))
  d=PublicSources([],fetch=fetch,postype_renderer=failed)([BASE+'?page=2'])[0]
  self.assertTrue(d['available']);self.assertFalse(d['channelPageVerified']);self.assertIn('renderFailure',d)
  with self.assertRaises(BrowserPending):PublicSources([],fetch=fetch,postype_renderer=Mock(side_effect=BrowserPending('fresh request pending')))([BASE+'?page=2'])
 def test_enabled_worker_uses_one_fresh_capture_queue_for_both_public_platforms(self):
  from graph_worker import Worker,configuration
  for enabled in (False,True):
   with self.subTest(enabled=enabled),tempfile.TemporaryDirectory() as temp:
    cfg=configuration();cfg.update(stateDirectory=temp,xBrowserFallback=enabled)
    worker=Worker(cfg,api=Mock())
    if enabled:self.assertIs(worker.source_loader.browser.capture_queue,worker.source_loader.public.postype_renderer)
    else:self.assertIsNone(worker.source_loader.public.postype_renderer)
 def test_pending_channel_retains_other_official_originals_without_fabricating_a_loaded_channel(self):
  from social_sources import SocialSources
  from browser_sources import BrowserPending
  official='https://dongne.co/events/example/circles/123'
  def public(urls):
   if urls==[BASE+'?page=2']:raise BrowserPending('fresh public channel pending')
   return [{'url':official,'available':True,'text':'공식 작가 연결'}]
  loader=SocialSources([],public=public)
  docs=loader([BASE+'?page=2',official],defer_browser_pending=True)
  self.assertEqual(2,len(docs));self.assertTrue(docs[0]['browserPending']);self.assertFalse(docs[0]['available']);self.assertEqual(official,docs[1]['url'])
  for defer in (False,True):
   with self.subTest(defer=defer),self.assertRaises(BrowserPending):loader([BASE+'?page=2'],defer_browser_pending=defer)
 def test_extraction_and_review_require_separate_fresh_channel_captures(self):
  from browser_sources import CaptureQueue
  with tempfile.TemporaryDirectory() as temp:
   served=[]
   def respond():
    deadline=time.monotonic()+5
    while len(served)<2 and time.monotonic()<deadline:
     for request in Path(temp).glob('*.request.json'):
      output=request.with_name(request.name.replace('.request.json','.response.json'))
      if output.exists():continue
      r=json.loads(request.read_text(encoding='utf-8'));served.append(r['id'])
      value={'id':r['id'],'requestedUrl':r['url'],'capturedAt':datetime.now(timezone.utc).isoformat(),'snapshot':snapshot()}
      temporary=output.with_suffix('.tmp');temporary.write_text(json.dumps(value),encoding='utf-8');temporary.replace(output)
     time.sleep(.01)
   thread=threading.Thread(target=respond);thread.start()
   queue=CaptureQueue(temp,wait_seconds=2)
   try:
    queue(BASE+'?page=2');queue(BASE+'?page=2')
   finally:thread.join()
   self.assertEqual(2,len(set(served)))


import os
@unittest.skipUnless(os.getenv('BOOTH_BROWSER_DOM_TESTS')=='1','explicit isolated Chromium DOM test')
class PostypePublicDomTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  from playwright.sync_api import sync_playwright
  cls.runtime=sync_playwright().start();cls.browser=cls.runtime.chromium.launch(headless=True,chromium_sandbox=True)
 @classmethod
 def tearDownClass(cls):cls.browser.close();cls.runtime.stop()
 def capture(self,body):
  from postype_browser import DOM
  context=self.browser.new_context(service_workers='block',accept_downloads=False)
  try:
   page=context.new_page();page.route('**/*',lambda r:r.fulfill(status=200,content_type='text/html; charset=utf-8',body=body) if r.request.resource_type=='document' else r.abort())
   page.goto(BASE,wait_until='domcontentloaded');return page.evaluate(DOM)
  finally:context.close()
 def fixture(self,second=''):
  return '<header data-sentry-component="MainTopNavigation"><nav><a href="/">포스타입</a><a href="/login">로그인</a><a href="/signup">회원가입</a></nav></header><div id="activity-content"><p>총 1개</p><article data-sentry-component="FeedPostItem"><span>작가</span><a href="/@artist/post/1">공개 글</a><p>성인 500P</p>'+second+'</article></div>'
 def test_public_cards_exclude_sidebar_hidden_content_scripts_and_paid_body(self):
  d=self.capture(self.fixture('<span aria-hidden="true">PRIVATE_HIDDEN</span>')+'<aside>PRIVATE_SIDEBAR</aside><script>const secret="PRIVATE_SCRIPT"</script><div>PRIVATE_PAID_BODY</div><form><input value="PRIVATE_PASSWORD"></form>')
  doc=postype_document(BASE,d);self.assertEqual(1,len(doc['pagination']['entryUrls']));self.assertNotIn('PRIVATE_',doc['text']);self.assertIn('500P',doc['text'])
 def test_interactive_form_in_channel_or_missing_logged_out_controls_is_unavailable(self):
  for body in (self.fixture('<form><input value="PRIVATE_LOGIN"></form>'),self.fixture().replace('<a href="/login">로그인</a>','')):
   with self.subTest(body=body):
    snapshot=self.capture(body);self.assertEqual([],snapshot['activities'])
    with self.assertRaises(MediaError):postype_document(BASE,snapshot)
 def test_content_links_external_login_links_and_authenticated_navigation_cannot_claim_anonymous(self):
  html=self.fixture()
  bodies=[html.replace('<header data-sentry-component="MainTopNavigation">','<div>').replace('</header>','</div>'),
          html.replace('href="/login"','href="https://other.example/login"'),
          html.replace('</nav>','<a href="/settings">내 계정</a></nav>'),
          '<div id="activity-content">'+html+'</div>']
  for body in bodies:
   with self.subTest(body=body):
    snapshot=self.capture(body);self.assertFalse(snapshot['anonymous']);self.assertEqual([],snapshot['activities'])

if __name__=='__main__':unittest.main()
