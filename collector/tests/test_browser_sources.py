import copy,json,os,tempfile,unittest,threading,time
from datetime import datetime,timezone,timedelta
from unittest.mock import Mock,patch
from pathlib import Path
from browser_sources import BrowserSources,CaptureQueue,BrowserPending,documents,target
from social_sources import SocialSources
from graph_worker import configuration,Worker,schema,require_opened
from media_fetch import MediaError
from run import RunError

PROFILE='https://x.com/artist'
POST=PROFILE+'/status/123'
def snapshot(url=POST):
 return {'url':url,'anonymous':True,'profile':'공식 작가','posts':[{'url':POST,'author':'artist','text':'10월 일페 판매 안내: 아크릴 키링 5000원',
  'links':['https://store.example.com/item'],'images':['https://pbs.twimg.com/media/sale?format=jpg','https://pbs.twimg.com/profile_images/avatar.jpg']} ]}

class BrowserSourceTests(unittest.TestCase):
 def test_attached_original_image_counts_as_opened_evidence_in_review(self):
  image='https://pbs.twimg.com/media/sale?format=jpg'
  result={'assignments':[],'unresolved':[],'sources':[{'url':image,'kind':'OFFICIAL','access':'ORIGINAL','evidence':'실제 첨부 판매표'}]}
  with tempfile.TemporaryDirectory() as temp:
   cfg=configuration();cfg['stateDirectory']=temp
   doc={'url':POST,'available':True,'sha256':'a'*64,'capturedAt':'2026-10-19T00:00:00Z','text':'공식 판매표','images':[{'imageUrl':image,'pageUrl':POST}]}
   worker=Worker(cfg,api=Mock(),search=lambda *a,**k:(json.dumps(result),False,{}),source_loader=lambda urls:[doc])
   with patch('graph_worker.fetch_image',return_value=(b'checked-image','image/png','b'*64)):
    value,audit=worker.call(Path(temp)/'review','review',schema('CHARACTERS'),[],[POST],auto_sns_images=True)
   self.assertIn(image,audit['openedUrls']);require_opened(value,audit)
 def test_more_than_four_sale_images_are_all_read_in_each_independent_phase(self):
  import hashlib
  urls=['https://pbs.twimg.com/media/'+str(i) for i in range(9)]
  result={'assignments':[],'unresolved':[],'sources':[{'url':POST,'kind':'OFFICIAL','access':'ORIGINAL','evidence':'판매표'}]}
  with tempfile.TemporaryDirectory() as temp:
   cfg=configuration();cfg['stateDirectory']=temp;seen=[]
   doc={'url':POST,'available':True,'sha256':'a'*64,'capturedAt':'2026-10-19T00:00:00Z','text':'공식 판매표','images':[{'imageUrl':url,'pageUrl':POST} for url in urls]}
   def search(cfg,directory,prompt,schema_path,images,web_search):
    seen.append((directory.parent.name,directory.name,len(images)))
    if directory.name.startswith('images-'):
     offset=int(directory.name.split('-')[1]);value={'observations':[{'imageIndex':offset+i,'visibleText':'옵션 '+str(offset+i),'uncertainties':[]} for i in range(len(images))]}
    else:value=result
    return json.dumps(value),False,{}
   worker=Worker(cfg,api=Mock(),search=search,source_loader=lambda urls:[doc])
   with patch('graph_worker.fetch_image',side_effect=lambda url,*a,**k:(url.encode(),'image/png',hashlib.sha256(url.encode()).hexdigest())):
    for phase in ('extract','review'):worker.call(Path(temp)/phase,'test',schema('CHARACTERS'),[],[POST],auto_sns_images=True)
   for phase in ('extract','review'):
    self.assertEqual([4,4,1],[count for parent,name,count in seen if parent==phase and name.startswith('images-')])
    self.assertEqual([9],[count for parent,name,count in seen if name==phase])
 def queue_response(self,directory,change=None):
  for _ in range(100):
   paths=list(Path(directory).glob('*.request.json'))
   if paths:break
   time.sleep(.01)
  request=json.loads(paths[0].read_text(encoding='utf-8'))
  value={'id':request['id'],'requestedUrl':request['url'],'capturedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'snapshot':snapshot()}
  if change:value.update(change)
  Path(directory,request['id']+'.response.json').write_text(json.dumps(value),encoding='utf-8')
 def test_live_capture_protocol_accepts_js_time_and_marks_fulfilled(self):
  with tempfile.TemporaryDirectory() as temp:
   thread=threading.Thread(target=self.queue_response,args=(temp,));thread.start()
   result=CaptureQueue(temp,wait_seconds=2)(POST);thread.join()
   self.assertEqual(POST,result['url'])
   self.assertEqual('FULFILLED',json.loads(next(Path(temp).glob('*.request.json')).read_text())['state'])
 def test_live_capture_protocol_rejects_other_request_stale_and_changed_destination(self):
  for change in ({'id':'another'},{'requestedUrl':PROFILE},{'capturedAt':(datetime.now(timezone.utc)-timedelta(days=1)).isoformat()},{'snapshot':snapshot('https://x.com/other/status/123')},{'snapshot':{**snapshot(),'anonymous':False}}):
   with tempfile.TemporaryDirectory() as temp:
    thread=threading.Thread(target=self.queue_response,args=(temp,change));thread.start()
    with self.assertRaises(MediaError):CaptureQueue(temp,wait_seconds=2)(POST)
    thread.join()
 def test_pending_capture_propagates_instead_of_becoming_empty_sales(self):
  with tempfile.TemporaryDirectory() as temp,patch.dict(os.environ,{},clear=True):
   browser=BrowserSources([],renderer=CaptureQueue(temp,wait_seconds=0))
   with self.assertRaises(BrowserPending):SocialSources([],browser=browser)([POST])
   self.assertEqual('DEFERRED',json.loads(next(Path(temp).glob('*.request.json')).read_text())['state'])
 def test_public_post_binds_author_and_real_media_without_native_account_id(self):
  doc=documents(POST,snapshot())[0]
  self.assertTrue(doc['available']);self.assertFalse(doc['browserPartial'])
  self.assertEqual([{'imageUrl':'https://pbs.twimg.com/media/sale?format=jpg','pageUrl':POST}],doc['images'])
  self.assertNotIn('platformAccountId',doc);self.assertEqual(64,len(doc['sha256']))
  self.assertIn('not HTTP',doc['hashScope'])
 def test_image_only_public_sale_sheet_is_still_original_evidence(self):
  value=snapshot();value['posts'][0]['text']=''
  self.assertEqual(1,len(documents(POST,value)[0]['images']))
 def test_visible_profile_does_not_claim_feed_completion_or_cursor(self):
  docs=documents(PROFILE,snapshot(PROFILE));self.assertEqual(2,len(docs))
  self.assertTrue(docs[0]['browserPartial']);self.assertNotIn('socialPageReceipt',docs[0]);self.assertNotIn('nextPageUrl',docs[0])
 def test_public_profile_links_keep_actual_href_separate_from_visible_label(self):
  value=snapshot(PROFILE);value['profileLinks']=[{'url':'https://t.co/public','text':'postype.com/@artist'},
   {'url':'https://user:secret@example.com/private','text':'bad'},{'url':'http://example.com/','text':'bad'}]
  doc=documents(PROFILE,value)[0];data=json.loads(doc['text'])
  self.assertEqual([{'url':'https://t.co/public','text':'postype.com/@artist'}],data['profileLinks'])
  self.assertIn('https://t.co/public',doc['links']);self.assertNotIn('https://postype.com/@artist',doc['links'])
  self.assertNotIn('secret',doc['text']);self.assertNotIn('platformAccountId',doc)
 def test_profile_capture_rejects_nontext_or_oversize_profile_without_claiming_success(self):
  for profile in ({'not':'text'},'x'*8001):
   value=snapshot(PROFILE);value['profile']=profile
   with self.assertRaises(MediaError):documents(PROFILE,value)
 def test_post_redirect_keeps_the_requested_evidence_url_and_actual_destination(self):
  requested='https://x.com/ARTIST/status/123'
  doc=documents(requested,snapshot())[0]
  self.assertEqual(requested,doc['url']);self.assertEqual(POST,doc['transportUrl'])
 def test_other_authors_reposts_quotes_and_wrong_post_are_not_goods(self):
  for change in ({'author':'other'},{'url':PROFILE+'/status/999'},{'repost':True},{'quoted':True}):
   data=snapshot();data['posts'][0].update(change)
   with self.assertRaises(MediaError):documents(POST,data)
 def test_login_challenge_and_destination_changes_are_rejected(self):
  for change in ({'blocked':True},{'url':'https://x.com/i/flow/login'},{'url':'https://x.com/other/status/123'}):
   data=snapshot();data.update(change)
   with self.assertRaises(MediaError):documents(POST,data)
 def test_private_credentials_and_foreign_url_cannot_start_browser(self):
  renderer=Mock()
  loader=BrowserSources([],renderer)
  for bad in ['http://x.com/artist','https://x.com@localhost/artist','https://x.com:444/artist','https://x.com.evil.test/artist',PROFILE+'?bh_cursor=x','https://127.0.0.1/artist']:
   with self.assertRaises(MediaError):loader(bad)
  renderer.assert_not_called()
  with self.assertRaises(MediaError):BrowserSources(['x.com'],renderer)(POST)
  renderer.assert_not_called()
 def test_missing_api_credential_automatically_uses_browser(self):
  renderer=Mock(return_value=snapshot());browser=BrowserSources([],renderer)
  with patch.dict(os.environ,{},clear=True):docs=SocialSources([],browser=browser)([POST])
  self.assertTrue(docs[0]['available']);renderer.assert_called_once_with(POST)
  self.assertEqual('ANONYMOUS_BROWSER_DOM',docs[0]['captureMethod'])
 def test_api_success_does_not_open_browser(self):
  browser=Mock()
  fetch=Mock(return_value=(json.dumps({'data':{'id':'1','username':'artist'}}),'a'*64))
  with patch.dict(os.environ,{'X_BEARER_TOKEN':'secret'}):docs=SocialSources([],browser=browser,x_fetch=fetch)([PROFILE])
  self.assertTrue(docs[0]['available']);browser.assert_not_called();self.assertNotIn('secret',json.dumps(docs))
 def test_forbidden_or_throttled_api_uses_anonymous_browser_without_token(self):
  browser=Mock(return_value=documents(POST,snapshot()))
  for code in (401,403,429,500,503):
   with patch.dict(os.environ,{'X_BEARER_TOKEN':'secret'}):
    result=SocialSources([],browser=browser,x_fetch=Mock(side_effect=MediaError('X API HTTP '+str(code))))([POST])
   self.assertTrue(result[0]['available']);self.assertNotIn('secret',json.dumps(result))
 def test_identity_mismatch_or_saved_owner_or_cursor_never_relaxes_identity(self):
  browser=Mock()
  with patch.dict(os.environ,{},clear=True):
   loader=SocialSources([],browser=browser);loader.expected_accounts={PROFILE:'123'}
   self.assertFalse(loader([POST])[0]['available'])
   loader.expected_accounts={}
   self.assertFalse(loader([PROFILE+'?bh_feed=1&bh_cursor=previous'])[0]['available'])
   self.assertFalse(SocialSources(['x.com'],browser=browser)([POST])[0]['available'])
  browser.assert_not_called()
 def test_browser_failure_is_unavailable_not_empty_completed_catalog(self):
  with patch.dict(os.environ,{},clear=True):docs=SocialSources([],browser=Mock(side_effect=MediaError('Public browser requires login')))([POST])
  self.assertFalse(docs[0]['available']);self.assertIn('browser',docs[0]['failure']);self.assertNotIn('COMPLETE',json.dumps(docs))
 def test_each_call_revisits_original_for_independent_review(self):
  renderer=Mock(return_value=snapshot());loader=BrowserSources([],renderer)
  loader(POST);loader(POST);self.assertEqual(2,renderer.call_count)
 def test_native_feed_fallback_keeps_requested_evidence_url_but_stays_partial(self):
  browser=Mock(return_value=documents(PROFILE,snapshot(PROFILE)))
  with patch.dict(os.environ,{},clear=True):docs=SocialSources([],browser=browser)([PROFILE+'?bh_feed=1'])
  self.assertEqual(PROFILE+'?bh_feed=1',docs[0]['url']);self.assertTrue(docs[0]['browserPartial'])
  browser.assert_called_once_with(PROFILE)
 def test_browser_option_requires_explicit_boolean(self):
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'config.json';path.write_text('{"xBrowserFallback":"true"}')
   with self.assertRaises(RunError):configuration(path)
