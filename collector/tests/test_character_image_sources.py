import hashlib,json,tempfile,unittest,uuid
from pathlib import Path
from unittest.mock import patch
from graph_worker import Worker,configuration,attached_image_documents
from media_fetch import MediaError
from tests.test_graph_worker import FakeApi

PAGE='https://comicw.net/g/3077'
IMAGE='https://comicw.net/data/info/item/list_3077_2_1788497563.png'
RAW=b'validated image bytes'
HASH=hashlib.sha256(RAW).hexdigest()

def result():
 return {'assignments':[],'unresolved':[],'sources':[{'url':IMAGE,'kind':'OFFICIAL','access':'ORIGINAL','evidence':'Actual attached product image'}]}

def sources(urls):
 return [{'url':u,'available':False,'failure':'Floorplan page is not HTML'} if u==IMAGE else {'url':u,'available':True,'sha256':'a'*64,'capturedAt':'2026-10-24T01:00:00Z','text':'Official page'} for u in urls]

def job():
 return {'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'kind':'CHARACTERS','contextHash':'a'*64,'context':{'input':{},'product':{'data':{'sources':[{'url':PAGE,'access':'ORIGINAL','evidence':'Official page'}],'images':[{'imageUrl':IMAGE,'pageUrl':PAGE}]}}}}

class CharacterImageSourceTests(unittest.TestCase):
 def test_unattached_or_mismatched_hash_cannot_create_original_evidence(self):
  manifest={'url':IMAGE,'sha256':HASH,'capturedAt':'2026-10-23T00:00:00+00:00','pageUrl':PAGE}
  self.assertEqual([],attached_image_documents([],[manifest],[]))
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'image.png';path.write_bytes(b'other bytes')
   self.assertEqual([],attached_image_documents([path],[manifest],[]))
   path.write_bytes(RAW);docs=attached_image_documents([path],[manifest],[])
   self.assertEqual([IMAGE],[d['url'] for d in docs]);self.assertNotIn(PAGE,[d['url'] for d in docs])
 def test_blocked_invalid_or_failed_image_manifest_never_becomes_opened(self):
  manifest={'url':IMAGE,'sha256':HASH,'capturedAt':'2026-10-23T00:00:00+00:00'}
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'image.png';path.write_bytes(RAW)
   for change in ({'url':'https://witchform.com/image.png'},{'url':'http://comicw.net/image.png'},
                  {'url':'https://user:pass@comicw.net/image.png'},{'url':'https://comicw.net:444/image.png'},
                  {'capturedAt':'2026-10-23T00:00:00'},{'capturedAt':'invalid'},{'unavailable':True}):
    with self.subTest(change=change):self.assertEqual([],attached_image_documents([path],[{**manifest,**change}],['witchform.com']))
 def process(self,fetch,*,candidate=None,search_extra=None):
  with tempfile.TemporaryDirectory() as temp:
   cfg=configuration();cfg['stateDirectory']=temp;api=FakeApi();calls=[]
   def search(cfg,directory,prompt,output_schema,**kwargs):
    images=kwargs['images'];calls.append({'phase':directory.name,'bytes':[p.read_bytes() for p in images],'prompt':prompt})
    value=(candidate or result()) if directory.name=='extract' else {'verdict':'APPROVE','reason':'Independent image inspection'}
    if search_extra:search_extra(directory)
    return json.dumps(value),False,{}
   with patch('graph_worker.fetch_image',side_effect=fetch):Worker(cfg,api,search,sources).process(job())
   return api,calls
 def test_actual_attached_image_url_is_original_evidence_even_when_not_html(self):
  api,calls=self.process(lambda *a,**k:(RAW,'image/png',HASH))
  self.assertEqual('APPROVE',api.calls[-1][2]['verdict'])
  for _,path,body in api.calls:
   if path.endswith(('/extract','/decide')):
    self.assertIn(IMAGE,body['audit']['openedUrls'])
    self.assertNotIn('https://comicw.net/unseen-page',body['audit']['openedUrls'])
    doc=next(d for d in body['audit']['sourceDocuments'] if d['url']==IMAGE)
    self.assertEqual(HASH,doc['sha256']);self.assertIn('capturedAt',doc)
 def test_review_refetches_and_attaches_original_bytes_independently(self):
  seen=[]
  def fetch(url,hosts,**kwargs):seen.append(url);return RAW,'image/png',HASH
  api,calls=self.process(fetch)
  self.assertEqual([IMAGE,IMAGE],seen)
  self.assertEqual(['extract','review'],[c['phase'] for c in calls])
  self.assertTrue(all(c['bytes']==[RAW] for c in calls))
 def test_image_change_between_extract_and_review_cannot_publish(self):
  changed=b'changed image';count=0
  def fetch(*a,**k):
   nonlocal count
   count+=1;raw=RAW if count==1 else changed
   return raw,'image/png',hashlib.sha256(raw).hexdigest()
  api,calls=self.process(fetch)
  self.assertEqual('ENRICH',api.calls[-1][2]['verdict'])
  self.assertIn('Image',api.calls[-1][2]['reason'])
  self.assertEqual([changed],calls[-1]['bytes'])
 def test_failed_review_image_is_not_recorded_as_opened(self):
  count=0
  def fetch(*a,**k):
   nonlocal count
   count+=1
   if count>1:raise MediaError('Image HTTP 403')
   return RAW,'image/png',HASH
  api,calls=self.process(fetch)
  self.assertEqual('ENRICH',api.calls[-1][2]['verdict']);self.assertNotIn(IMAGE,api.calls[-1][2]['audit']['openedUrls'])
  self.assertEqual([],calls[-1]['bytes'])
 def test_image_attachment_does_not_prove_an_unopened_html_page(self):
  candidate=result();candidate['sources'][0]['url']='https://other.example.test/unavailable'
  with tempfile.TemporaryDirectory() as temp:
   cfg=configuration();cfg['stateDirectory']=temp;api=FakeApi()
   def search(cfg,directory,prompt,output_schema,**kw):return json.dumps(candidate if directory.name=='extract' else {'verdict':'APPROVE','reason':'Claimed'}),False,{}
   def loader(urls):return [{'url':PAGE,'available':True,'sha256':'a'*64,'capturedAt':'2026-10-24T01:00:00Z','text':'Official'}]
   with patch('graph_worker.fetch_image',return_value=(RAW,'image/png',HASH)):Worker(cfg,api,search,loader).process(job())
   self.assertEqual('ENRICH',api.calls[-1][2]['verdict']);self.assertNotIn(candidate['sources'][0]['url'],api.calls[-1][2]['audit']['openedUrls'])

if __name__=='__main__':unittest.main()
