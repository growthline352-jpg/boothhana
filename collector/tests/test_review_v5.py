"""Multi-week regression using the real Pipeline, fake CLI and deterministic mock server.
These tests do not substitute for the opt-in PostgreSQL/JDBC tests.
"""
import copy,io,json,os,sys,tempfile,unittest,uuid
from datetime import date
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout,redirect_stderr
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import weekly
from catalog_rules import InvalidResult,parse_schema,validate_discovery,validate_stage
FIX=weekly.ROOT/'examples/v5'
def fixture(name):return json.loads((FIX/(name+'.json')).read_text())
SCOPE={'region':'SEOUL','timezone':'Asia/Seoul','startDate':'2026-10-01','endDate':'2026-10-31'}

class MemoryServer:
 def __init__(self,pages=1):
  self.pages=pages;self.pipeline=None;self.states={};self.receipts={};self.calls=[];self.visits=[];self.attempts=[];self.fail_response=False
  self.cursor={'sourceKey':'a'*64,'rootUrl':'https://example.com/list?page=1','requestedUrl':'https://example.com/list?page=1','passNo':1,'pageIndex':0,'revision':1,'state':'ACTIVE'}
  self.event={'id':11,'revision':1,'event':fixture('events')['events'][0]};self.targets=[];self.assets=[];self.discovery_status='SUCCESS';self.discovery_counts=(1,0,0,0)
 def request(self,method,path,data=None,**kw):
  self.calls.append((method,path,copy.deepcopy(data)))
  if path.endswith('/pipelines'):
   self.pipeline=data['runId'];state=self.states.get(self.pipeline,'RUNNING');self.states[self.pipeline]='RUNNING' if state!='SUCCESS' else state
   return {'runId':self.pipeline,'state':state}
  if path.endswith('/finish'):self.states[self.pipeline]=data['state'];return {'state':data['state']}
  if path.endswith('/cursors'):
   if self.cursor['state']=='COMPLETE' and self.cursor.get('last')!=self.pipeline:
    self.cursor.update(state='ACTIVE',requestedUrl=self.cursor['rootUrl'],pageIndex=0,passNo=self.cursor['passNo']+1,revision=self.cursor['revision']+1)
   return [copy.deepcopy(self.cursor)]
  if '/events?' in path:return [copy.deepcopy(self.event)]
  if '/participants?' in path:
   # Backend regression for exact SQL lives in CatalogPostgresTests. This endpoint returns its queue.
   return copy.deepcopy(self.targets)
  if path.endswith('/attempt'):self.attempts.append((path,data));return data
  if '/assets?' in path:return self.assets
  if path.endswith('/content'):return {'storageState':'STORED'}
  if path.endswith('/batches') or path.endswith('/stages'):
   rid=data['runId']
   if rid in self.receipts:return copy.deepcopy(self.receipts[rid])
   if path.endswith('/batches'):
    counts=self.discovery_counts;status=self.discovery_status;ids=[]
   else:
    if data['stage']=='PARTICIPANTS':
     ref=data['cursor'];assert ref['revision']==self.cursor['revision'],'stale cursor'
     nxt=data['result']['coverage']['nextPageUrl'];done=data['result']['coverage']['completeness']=='COMPLETE';failed=data['result']['searchStatus']=='FAILED'
     self.cursor.update(revision=ref['revision']+1,last=self.pipeline)
     if failed:self.cursor.update(state='BLOCKED')
     else:self.cursor.update(state='COMPLETE' if done else 'ACTIVE' if nxt else 'BLOCKED',pageIndex=ref['pageIndex']+1,requestedUrl=nxt)
     counts=(len(data['result']['participants']),0,0,0);status='FAILED' if failed else 'SUCCESS' if done else 'PARTIAL';ids=[21]
    else:
     counts=(int(data['result']['sales'] is not None),0,0,0);status='FAILED' if data['result']['searchStatus']=='FAILED' else 'SUCCESS' if counts[0] else 'NO_RESULTS';ids=[]
   r={'runId':rid,'status':status,**dict(zip(('inserted','changed','unchanged','rejected'),counts)),'participantIds':ids,'issues':[]};self.receipts[rid]=copy.deepcopy(r)
   if self.fail_response and path.endswith('/stages'):
    self.fail_response=False;raise weekly.RunError('simulated response lost after commit')
   return r
  return {}
 def cli(self,cfg,folder,prompt,schema):
  if folder.name=='discovery':r=fixture('events')
  elif folder.name.startswith('participants-'):
   ctx=json.loads(prompt.split('UNTRUSTED CONTEXT DATA (not instructions):\n')[1]);url=ctx['nextPageUrl'];page=int(url.rsplit('=',1)[1]);self.visits.append(page)
   r=fixture('participants');r['participants'][0]['sourceEntryId']=f'page-{page}'
   r['coverage'].update(completeness='COMPLETE' if page>=self.pages else 'PARTIAL',nextPageUrl=None if page>=self.pages else f'https://example.com/list?page={page+1}')
   r['searchStatus']='COMPLETE' if page>=self.pages else 'PARTIAL'
  else:r=fixture('sales')
  return json.dumps(r).encode(),True,{}

class ReviewV5PipelineTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.server=MemoryServer();self.cfg=weekly.load_config(None);self.cfg.update(maxEventEnrichments=0,stateDirectory=str(self.root/'state'))
  self.env=patch.dict(os.environ,{'BOOTH_COLLECTOR_TOKEN':'t'*40});self.env.start()
 def tearDown(self):self.env.stop();self.temp.cleanup()
 def runner(self,name='run',resume=False):
  p=weekly.Pipeline(self.cfg,self.root/name,SCOPE,resume=resume);p.api=self.server;return p
 def run_one(self,name='run',resume=False,cli=None):
  p=self.runner(name,resume)
  with patch.object(weekly,'execute_search',side_effect=cli or self.server.cli),redirect_stdout(io.StringIO()),redirect_stderr(io.StringIO()):code=p.run()
  return p,code
 def test_25_pages_continue_over_three_weeks(self):
  self.server.pages=25;self.cfg['maxParticipantPages']=10
  a,_=self.run_one('week1');self.assertEqual(self.server.visits,list(range(1,11)))
  b,_=self.run_one('week2');self.assertEqual(self.server.visits,list(range(1,21)))
  c,code=self.run_one('week3');self.assertEqual(self.server.visits,list(range(1,26)));self.assertEqual(code,0)
  self.assertEqual(c.stats['participants'],5)
 def test_same_checkpoint_resume_advances_past_page_budget(self):
  self.server.pages=5;self.cfg['maxParticipantPages']=2
  p,_=self.run_one();rid=p.id
  q,_=self.run_one(resume=True);self.assertEqual(q.id,rid);self.assertEqual(self.server.visits,[1,2,3,4])
  r,code=self.run_one(resume=True);self.assertEqual(self.server.visits,[1,2,3,4,5]);self.assertEqual(code,0);self.assertEqual(r.stats['participants'],5)
 def test_complete_pass_refreshes_next_new_pipeline(self):
  self.server.pages=2;self.run_one('one');self.run_one('two');self.assertEqual(self.server.visits,[1,2,1,2]);self.assertEqual(self.server.cursor['passNo'],2)
 def test_committed_response_loss_replays_before_reading_next_cursor(self):
  self.server.pages=3;self.server.fail_response=True
  a,code=self.run_one();self.assertEqual(code,2);self.assertEqual(self.server.visits,[1])
  b,code=self.run_one(resume=True);self.assertEqual(self.server.visits,[1,2,3]);self.assertEqual(b.stats['participants'],3);self.assertEqual(code,0)
  ids=[d['runId'] for _,p,d in self.server.calls if p.endswith('/stages')];self.assertEqual(ids[0],ids[1])
 def test_success_checkpoint_skips_search(self):
  self.run_one();visits=self.server.visits[:];self.run_one(resume=True,cli=lambda *a:(_ for _ in ()).throw(AssertionError('no CLI')));self.assertEqual(self.server.visits,visits)
 def test_rejected_all_is_not_success(self):
  self.server.discovery_status='REJECTED_ALL';self.server.discovery_counts=(0,0,0,2)
  p,c=self.run_one();self.assertEqual(c,2);self.assertEqual(p.stats['discovery'],0);self.assertEqual(p.meta['summary']['receipts']['discovery']['status'],'REJECTED_ALL')
 def test_partial_receipt_counts_actual_accepted(self):
  self.server.discovery_status='PARTIAL';self.server.discovery_counts=(0,1,0,1)
  p,c=self.run_one();self.assertEqual(c,2);self.assertEqual(p.stats['discovery'],1);self.assertEqual(p.meta['summary']['receipts']['discovery']['changed'],1)
 def test_no_results_is_not_failed(self):
  self.server.discovery_status='NO_RESULTS';self.server.discovery_counts=(0,0,0,0)
  p,c=self.run_one();self.assertEqual(c,0);self.assertEqual(p.meta['summary']['receipts']['discovery']['status'],'NO_RESULTS')
 def test_invalid_receipt_cannot_report_success(self):
  p=self.runner()
  with self.assertRaises(weekly.RunError):p.record_receipt('discovery',{'status':'SUCCESS','inserted':True,'changed':0,'unchanged':0,'rejected':0})
 def test_unknown_receipt_status_rejected(self):
  with self.assertRaises(weekly.RunError):self.runner().record_receipt('x',{'status':'OK'})
 def test_server_warnings_survive_resume(self):
  p=self.runner();r={'status':'PARTIAL','inserted':1,'changed':0,'unchanged':0,'rejected':0,'issues':['identity ambiguous']}
  p.record_receipt('participants-one',r);self.assertIn('participants-one: identity ambiguous',p.issues)
 def test_receipt_replay_not_double_counted(self):
  p=self.runner();r={'status':'SUCCESS','inserted':1,'changed':2,'unchanged':3,'rejected':0}
  p.record_receipt('participants-x',r);p.record_receipt('participants-x',r);p.recount();self.assertEqual(p.stats['participants'],6)
 def test_cli_budget_exhaustion_still_stores_images(self):
  self.cfg['maxCliCalls']=1;self.server.assets=[{'id':2,'revision':1,'imageUrl':'https://example.com/a.png'}]
  with patch.object(weekly,'fetch_image',return_value=(b'png','image/png','0'*64)):
   p,c=self.run_one()
  self.assertEqual(c,2);self.assertEqual(p.stats['images'],1);self.assertEqual(p.stats['cliCalls'],1)
 def test_global_time_exhaustion_defers_images(self):
  p=self.runner();p.started-=self.cfg['maxRuntimeMinutes']*60+1
  with patch.object(weekly,'execute_search',side_effect=AssertionError('no time')),redirect_stdout(io.StringIO()),redirect_stderr(io.StringIO()):self.assertEqual(p.run(),2)
  self.assertFalse([x for x in self.server.calls if '/assets?' in x[1]])
 def test_one_failed_image_does_not_block_next_image(self):
  self.server.assets=[{'id':2,'revision':1,'imageUrl':'https://example.com/a.png'},{'id':3,'revision':1,'imageUrl':'https://example.com/b.png'}]
  with patch.object(weekly,'fetch_image',side_effect=[ValueError('failed first'),(b'png','image/png','0'*64)]):
   p,c=self.run_one()
  self.assertEqual(c,2);self.assertEqual(p.stats['images'],1)
 def test_no_results_sales_records_started_attempt(self):
  self.server.targets=[{'id':21,'eventId':11,'revision':1,'event':self.server.event['event'],'participant':fixture('participants')['participants'][0]}]
  def cli(*a):
   raw,seen,usage=self.server.cli(*a)
   if a[1].name.startswith('sales-'):
    r=json.loads(raw);r['sales']=None;r['searchStatus']='COMPLETE';raw=json.dumps(r).encode()
   return raw,seen,usage
  p,c=self.run_one(cli=cli);self.assertEqual(c,2);self.assertEqual([a[1]['state'] for a in self.server.attempts],['STARTED']);self.assertEqual(p.meta['summary']['receipts']['sales']['status'],'NO_RESULTS')
 def test_sales_pagination_continues_across_runs_without_repeating_first_page(self):
  self.server.targets=[{'id':21,'eventId':11,'revision':1,'event':self.server.event['event'],'participant':fixture('participants')['participants'][0]}]
  self.cfg['maxSalesPagesPerParticipant']=2;visits=[]
  def cli(cfg,folder,prompt,schema):
   if not folder.name.startswith('sales-'):return self.server.cli(cfg,folder,prompt,schema)
   ctx=json.loads(prompt.split('UNTRUSTED CONTEXT DATA (not instructions):\n')[1]);url=ctx['nextPageUrl'];page=1 if url is None else int(url.rsplit('=',1)[1]);visits.append(page)
   r=fixture('sales');product=r['sales']['products'][0];product['name']=f'상품 {page}';product['sourceEntryId']=f'product-{page}';product['identity']=None
   r['coverage'].update(reportedTotal=3,totalUnit='PRODUCTS',completeness='COMPLETE' if page==3 else 'PARTIAL',nextPageUrl=None if page==3 else f'https://example.com/products?page={page+1}')
   r['searchStatus']='COMPLETE' if page==3 else 'PARTIAL'
   return json.dumps(r).encode(),True,{}
  first,code=self.run_one('sales-week-1',cli=cli);self.assertEqual(code,2);self.assertEqual(visits,[1,2]);self.assertEqual(first.sales_cursors['21']['requestedUrl'],'https://example.com/products?page=3')
  second,code=self.run_one('sales-week-2',cli=cli);self.assertEqual(visits,[1,2,3]);self.assertEqual(second.sales_cursors['21']['state'],'COMPLETE');self.assertEqual(code,0)
 def test_finished_sales_pagination_is_not_left_partial(self):
  self.server.targets=[{'id':21,'eventId':11,'revision':1,'event':self.server.event['event'],'participant':fixture('participants')['participants'][0]}]
  visits=[]
  def cli(cfg,folder,prompt,schema):
   if not folder.name.startswith('sales-'):return self.server.cli(cfg,folder,prompt,schema)
   ctx=json.loads(prompt.split('UNTRUSTED CONTEXT DATA (not instructions):\n')[1]);page=1 if ctx['nextPageUrl'] is None else int(ctx['nextPageUrl'].rsplit('=',1)[1]);visits.append(page)
   r=fixture('sales');r['sales']['products'][0].update(name=f'상품 {page}',sourceEntryId=f'product-{page}',identity=None)
   r['coverage'].update(reportedTotal=3,totalUnit='PRODUCTS',completeness='COMPLETE' if page==3 else 'PARTIAL',nextPageUrl=None if page==3 else f'https://example.com/products?page={page+1}')
   r['searchStatus']='COMPLETE' if page==3 else 'PARTIAL'
   return json.dumps(r).encode(),True,{}
  pipeline,code=self.run_one('sales-one-run',cli=cli);self.assertEqual(visits,[1,2,3]);self.assertEqual(code,0);self.assertEqual(pipeline.meta['summary']['receipts']['sales']['status'],'SUCCESS')
 def test_reported_product_total_prevents_false_complete(self):
  state={'productKeys':[],'reportedTotal':None}
  result=fixture('sales');result['coverage'].update(reportedTotal=10,totalUnit='PRODUCTS',completeness='COMPLETE',nextPageUrl=None)
  normalized,keys,total=self.runner().normalize_sales_result(result,state)
  self.assertEqual(total,10);self.assertEqual(len(keys),1);self.assertEqual(normalized['searchStatus'],'PARTIAL');self.assertEqual(normalized['coverage']['completeness'],'PARTIAL')
 def test_discovery_leads_are_passed_as_community_candidates(self):
  lead='https://example.com/community-schedule';self.cfg['discoveryLeadUrls']=[lead];seen=[]
  def cli(cfg,folder,prompt,schema):
   if folder.name=='discovery':seen.append(prompt)
   return self.server.cli(cfg,folder,prompt,schema)
  self.run_one(cli=cli);self.assertIn(lead,seen[0]);self.assertIn('DISCOVERY SOURCE REGISTRY',seen[0]);self.assertIn('COMMUNITY_INDEX',seen[0])
 def test_discovery_event_names_are_passed_as_priority_candidates(self):
  self.cfg['discoveryEventNames']=['행사 후보 A','행사 후보 A','행사 후보 B'];seen=[]
  def cli(cfg,folder,prompt,schema):
   if folder.name=='discovery':seen.append(prompt)
   return self.server.cli(cfg,folder,prompt,schema)
  self.run_one(cli=cli);self.assertIn('priorityCandidateNames',seen[0]);self.assertEqual(seen[0].count('행사 후보 A'),1);self.assertIn('행사 후보 B',seen[0])
 def test_community_only_discovery_cannot_claim_complete(self):
  result=fixture('events');result['sourceCoverage']=[{'channel':'COMMUNITY_INDEX','status':'CHECKED','queries':['community calendar'],'checkedUrls':['https://example.com/community'],'notes':'candidate names only'}]
  normalized,issues=weekly.enforce_discovery_coverage(result)
  self.assertEqual(normalized['searchStatus'],'PARTIAL');self.assertIn('missing VENUE_CALENDAR',issues);self.assertIn('no authoritative source page checked',issues)
 def test_all_discovery_channels_with_authoritative_page_can_complete(self):
  result=fixture('events');normalized,issues=weekly.enforce_discovery_coverage(result)
  self.assertEqual(normalized['searchStatus'],'COMPLETE');self.assertEqual(issues,[])
 def test_discovery_coverage_rejects_blocked_checked_url(self):
  result=fixture('events');result['sourceCoverage'][0]['checkedUrls']=['https://witchform.com/event']
  with self.assertRaises(InvalidResult):validate_discovery(result,date(2026,1,1),date(2026,12,31),['witchform.com'])
 def test_cli_failure_records_failed_attempt_and_counts_call(self):
  self.server.targets=[{'id':21,'eventId':11,'revision':1,'event':self.server.event['event'],'participant':fixture('participants')['participants'][0]}]
  def cli(*a):
   if a[1].name.startswith('sales-'):raise weekly.RunError('CLI failed')
   return self.server.cli(*a)
  p,c=self.run_one(cli=cli);self.assertEqual(c,2);self.assertEqual([a[1]['state'] for a in self.server.attempts],['STARTED','FAILED']);self.assertEqual(p.stats['cliCalls'],3)
 def test_recorded_failed_stage_not_failed_twice(self):
  self.server.targets=[{'id':21,'eventId':11,'revision':1,'event':self.server.event['event'],'participant':fixture('participants')['participants'][0]}]
  def cli(*a):
   raw,seen,usage=self.server.cli(*a)
   if a[1].name.startswith('sales-'):
    r=json.loads(raw);r.update(sales=None,participants=[],searchStatus='FAILED');raw=json.dumps(r).encode()
   return raw,seen,usage
  p,c=self.run_one(cli=cli);self.assertEqual(c,2);self.assertEqual([a[1]['state'] for a in self.server.attempts],['STARTED']);self.assertEqual(p.meta['summary']['receipts']['sales']['status'],'FAILED')
 def test_v4_checkpoint_refused_without_modification(self):
  folder=self.root/'old';folder.mkdir();data={'runId':str(uuid.uuid4()),'scope':SCOPE,'dryRun':False};weekly.write_json(folder/'pipeline.json',data)
  with self.assertRaisesRegex(weekly.RunError,'v4 checkpoint'):self.runner('old',True)
  self.assertEqual(json.loads((folder/'pipeline.json').read_text()),data)
 def test_completed_sales_receipt_is_not_restarted_on_resume(self):
  self.server.pages=2;self.cfg['maxParticipantPages']=1
  self.server.targets=[{'id':21,'eventId':11,'revision':1,'event':self.server.event['event'],'participant':fixture('participants')['participants'][0]}]
  p,c=self.run_one();self.assertEqual(c,2);self.assertEqual(len(self.server.attempts),1)
  q,c=self.run_one(resume=True);self.assertEqual(c,0);self.assertEqual(len(self.server.attempts),1)
 def test_scheduled_checkpoint_namespace_isolated_from_v4(self):
  self.assertIn("state/'weekly-v18'/",(weekly.ROOT/'weekly.py').read_text())
 def test_new_identity_contract_validated(self):
  result=fixture('participants');p=result['participants'][0];source=p['sources'][0]['url'];p['identity']={'sourceSystem':'https://example.com','entryId':p['sourceEntryId'],'detailUrl':source}
  parse_schema(json.dumps(result).encode(),'stage-result-v5.schema.json');validate_stage(result,'PARTICIPANTS',self.server.event['event'],[])
 def test_identity_cannot_use_unrelated_namespace(self):
  result=fixture('participants');p=result['participants'][0];p['identity']={'sourceSystem':'https://other.example','entryId':p['sourceEntryId'],'detailUrl':None}
  with self.assertRaises(ValueError):validate_stage(result,'PARTICIPANTS',self.server.event['event'],[])
 def test_identity_id_mismatch_rejected(self):
  result=fixture('participants');p=result['participants'][0];p['identity']={'sourceSystem':'https://example.com','entryId':'DIFFERENT','detailUrl':None}
  with self.assertRaises(ValueError):validate_stage(result,'PARTICIPANTS',self.server.event['event'],[])
 def test_cursor_job_keys_include_generation_and_page(self):
  c=self.server.cursor;k=weekly.Pipeline.cursor_key(11,c)
  for f in ('revision','passNo','pageIndex'):self.assertNotEqual(k,weekly.Pipeline.cursor_key(11,{**c,f:c[f]+1}))
if __name__=='__main__':unittest.main()
