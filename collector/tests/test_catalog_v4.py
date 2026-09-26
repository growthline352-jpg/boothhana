from __future__ import annotations
import copy,io,json,os,socket,sys,tempfile,threading,unittest,uuid
from datetime import datetime,date,timezone
from pathlib import Path
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import weekly
from catalog_rules import parse_schema,validate_stage,validate_discovery,check_participant,check_sales
from rules import InvalidResult
from media_fetch import check_url,public_addresses,inspect_image,MediaError,fetch_image
from catalog_transport import Api
from transport import DeliveryError
from PIL import Image
FIX=ROOT/'examples/v5'
def fixture(name):return json.loads((FIX/(name+'.json')).read_text(encoding='utf-8'))
class CatalogRulesTests(unittest.TestCase):
 def setUp(self):self.event=fixture('events')['events'][0];self.p=fixture('participants');self.s=fixture('sales')
 def test_new_discovery_schema(self):parse_schema((FIX/'events.json').read_bytes(),'event-result-v4.schema.json')
 def test_both_stage_schemas(self):
  for n in ['participants','sales']:parse_schema((FIX/(n+'.json')).read_bytes(),'stage-result-v5.schema.json')
 def test_joint_booth_preserved(self):validate_stage(self.p,'PARTICIPANTS',self.event,[]);self.assertEqual(len(self.p['participants']),1);self.assertEqual(len(self.p['participants'][0]['members']),2)
 def test_assigned_requires_code(self):
  self.p['participants'][0]['locations'][0]['code']=None
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_unknown_has_no_fabricated_number(self):
  self.p['participants'][0]['locations'][0]['status']='UNKNOWN'
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_unassigned_valid(self):
  self.p['participants'][0]['locations'][0].update(code=None,status='UNASSIGNED');validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_location_on_closed_day_rejected(self):
  self.p['participants'][0]['locations'][0].update(startDate='2026-10-12',endDate='2026-10-12')
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_reversed_location_dates(self):
  self.p['participants'][0]['locations'][0].update(startDate='2026-10-11',endDate='2026-10-10')
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_general_catalog_not_changed_to_event_sale(self):validate_stage(self.s,'SALES',self.event,[]);self.assertEqual(self.s['sales']['products'][0]['evidenceScope'],'GENERAL_CATALOG')
 def test_no_sales_is_allowed_without_fabrication(self):self.s['sales']=None;validate_stage(self.s,'SALES',self.event,[])
 def test_bad_price(self):
  self.s['sales']['products'][0]['price']['amount']='-3000'
  with self.assertRaises(ValueError):validate_stage(self.s,'SALES',self.event,[])
 def test_free_is_explicit_zero(self):self.s['sales']['products'][0]['price']['amount']='0';validate_stage(self.s,'SALES',self.event,[])
 def test_unknown_price_is_null(self):self.s['sales']['products'][0]['price']=None;validate_stage(self.s,'SALES',self.event,[])
 def test_no_sources(self):
  self.p['participants'][0]['sources']=[]
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_inaccessible_only(self):
  self.p['participants'][0]['sources'][0]['access']='INACCESSIBLE'
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_complete_with_more_pages_rejected(self):
  self.p['coverage']['nextPageUrl']='https://example.com/page2'
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_partial_with_more_pages_allowed(self):self.p['coverage'].update(completeness='PARTIAL',nextPageUrl='https://example.com/page2');validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_failed_research_cannot_smuggle_data(self):
  self.p['searchStatus']='FAILED'
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_stage_data_not_mixed(self):
  self.p['sales']=self.s['sales']
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_duplicate_json_keys(self):
  with self.assertRaises(ValueError):parse_schema(b'{"x":1,"x":2}','stage-result-v5.schema.json')
 def test_json_size_limit(self):
  with self.assertRaises(ValueError):parse_schema(b' '* (2*1024*1024+1),'stage-result-v5.schema.json')
 def test_blocked_sources_excluded(self):
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,['example.com'])
 def test_local_image_url_denied(self):
  self.p['participants'][0]['images'][0]['imageUrl']='http://127.0.0.1/a.png'
  with self.assertRaises(ValueError):validate_stage(self.p,'PARTICIPANTS',self.event,[])
 def test_outside_seoul_excluded(self):
  data=fixture('events');data['events'][0]['venueName']='킨텍스'
  accepted,rejected=validate_discovery(data,date(2026,10,1),date(2026,10,31),[]);self.assertEqual(len(accepted),0);self.assertEqual(len(rejected),1)
 def test_disjoint_days_preserved(self):
  accepted,_=validate_discovery(fixture('events'),date(2026,10,1),date(2026,10,31),[]);self.assertEqual(len(accepted[0]['occurrences']),2)
class MediaTests(unittest.TestCase):
 def test_no_implicit_allowlist(self):
  with self.assertRaises(MediaError):check_url('https://example.com/a.png',[])
 def test_exact_host_allowed(self):check_url('https://example.com/a.png',['example.com'])
 def test_lookalike_host_denied(self):
  with self.assertRaises(MediaError):check_url('https://example.com.evil.org/a.png',['example.com'])
 def test_subdomain_explicit_wildcard(self):check_url('https://cdn.example.com/a',['*.example.com'])
 def test_http_rejected(self):
  with self.assertRaises(MediaError):check_url('http://example.com/a',['example.com'])
 def test_private_dns_denied(self):
  with self.assertRaises(MediaError):public_addresses('example.com',443,lambda *a,**k:[(None,None,None,None,('127.0.0.1',443))])
 def test_mixed_dns_denied(self):
  with self.assertRaises(MediaError):public_addresses('example.com',443,lambda *a,**k:[(None,None,None,None,('8.8.8.8',443)),(None,None,None,None,('10.0.0.1',443))])
 def test_public_dns_pinned(self):self.assertEqual(public_addresses('example.com',443,lambda *a,**k:[(None,None,None,None,('8.8.8.8',443))]),['8.8.8.8'])
 def test_valid_png(self):
  out=io.BytesIO();Image.new('RGB',(2,2)).save(out,format='PNG');self.assertEqual(len(inspect_image(out.getvalue(),'image/png')),64)
 def test_wrong_mime(self):
  out=io.BytesIO();Image.new('RGB',(2,2)).save(out,format='PNG')
  with self.assertRaises(MediaError):inspect_image(out.getvalue(),'image/jpeg')
 def test_svg_rejected(self):
  with self.assertRaises(MediaError):inspect_image(b'<svg></svg>','image/svg+xml')
 def test_signature_only_fake_rejected(self):
  with self.assertRaises(MediaError):inspect_image(b'\x89PNG\r\n\x1a\n','image/png')
 def test_excess_size(self):
  with self.assertRaises(MediaError):inspect_image(b'a'*(10*1024*1024+1),'image/png')
class ScheduleTests(unittest.TestCase):
 def test_sunday_kst_from_utc(self):self.assertEqual(weekly.week_key(datetime(2026,9,19,18,0,tzinfo=timezone.utc)),'2026-09-20')
 def test_missed_monday_catchup_same_week(self):self.assertEqual(weekly.week_key(datetime(2026,9,21,0,0,tzinfo=timezone.utc)),'2026-09-20')
 def test_previous_week_saturday(self):self.assertEqual(weekly.week_key(datetime(2026,9,19,0,0,tzinfo=timezone.utc)),'2026-09-13')
 def test_windows_weekly_not_daily(self):
  s=(ROOT/'register-task.ps1').read_text();self.assertIn('-Weekly',s);self.assertIn('-DaysOfWeek Sunday',s);self.assertNotIn('-Daily',s)
 def test_linux_explicit_timezone(self):self.assertIn('Sun *-*-* 03:00:00 Asia/Seoul',(ROOT/'systemd/boothhana-weekly.timer').read_text())
 def test_fixtures_cannot_write(self):
  with self.assertRaises(weekly.RunError):weekly.main(['--fixtures',str(FIX)])
class PipelineTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.calls=[];self.state={'status':'RUNNING'}
  outer=self
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*a):pass
   def reply(self,value,status=200):self.send_response(status);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(value).encode())
   def do_GET(self):
    if self.headers.get('Authorization')!='Bearer '+('t'*40):return self.reply({},401)
    if '/events?' in self.path:return self.reply([{'id':11,'revision':1,'event':fixture('events')['events'][0]}])
    if '/participants?' in self.path:return self.reply([{'id':21,'eventId':11,'revision':1,'event':fixture('events')['events'][0],'participant':fixture('participants')['participants'][0]}])
    if '/assets?' in self.path:return self.reply([])
    return self.reply({},404)
   def do_POST(self):
    if self.headers.get('Authorization')!='Bearer '+('t'*40):return self.reply({},401)
    b=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))));outer.calls.append((self.path,b))
    if self.path.endswith('/pipelines'):return self.reply({'runId':b['runId'],'state':outer.state['status']})
    if self.path.endswith('/cursors'):
     if not hasattr(outer,'progress'):outer.progress=[{'sourceKey':'a'*64,'rootUrl':None,'requestedUrl':None,'passNo':1,'pageIndex':0,'revision':1,'state':'ACTIVE'}]
     return self.reply(outer.progress)
    if self.path.endswith('/finish'):outer.state['status']=b['state'];return self.reply({'state':b['state']})
    if self.path.endswith('/batches') or self.path.endswith('/stages'):
     if self.path.endswith('/stages'):
      if b['eventId']!=11:return self.reply({},409)
      if b['stage']=='SALES' and b['participantId']!=21:return self.reply({},409)
      if b['stage']=='PARTICIPANTS' and hasattr(outer,'progress'):outer.progress[0].update(state='COMPLETE',revision=outer.progress[0]['revision']+1,pageIndex=outer.progress[0]['pageIndex']+1)
     return self.reply({'runId':b['runId'],'status':'SUCCESS','inserted':1,'changed':0,'unchanged':0,'rejected':0,'participantIds':[21]})
    return self.reply({})
  self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
  self.cfg=weekly.load_config(None);self.cfg.update(apiBaseUrl=f'http://127.0.0.1:{self.server.server_port}',stateDirectory=str(self.root))
  self.scope={'region':'SEOUL','timezone':'Asia/Seoul','startDate':'2026-10-01','endDate':'2026-10-31'}
  self.env=patch.dict(os.environ,{'BOOTH_COLLECTOR_TOKEN':'t'*40});self.env.start()
 def tearDown(self):self.env.stop();self.server.shutdown();self.server.server_close();self.tmp.cleanup()
 def cli(self,cfg,folder,prompt,schema):
  name='events' if schema.name.startswith('event') else 'participants' if folder.name.startswith('participants') else 'sales'
  return (FIX/(name+'.json')).read_bytes(),True,{}
 def test_three_stages_save_parent_ids(self):
  with patch.object(weekly,'execute_search',side_effect=self.cli) as cli:self.assertEqual(weekly.Pipeline(self.cfg,self.root/'run',self.scope).run(),0);self.assertEqual(cli.call_count,3)
  stages=[b for p,b in self.calls if p.endswith('/stages')];self.assertEqual([b['stage'] for b in stages],['PARTICIPANTS','SALES']);self.assertEqual(stages[1]['participantId'],21)
 def test_success_resume_does_not_research_or_duplicate(self):
  with patch.object(weekly,'execute_search',side_effect=self.cli) as cli:
   first=weekly.Pipeline(self.cfg,self.root/'run',self.scope);first.run();count=len(self.calls);second=weekly.Pipeline(self.cfg,self.root/'run',self.scope,resume=True);second.run();self.assertEqual(cli.call_count,3);self.assertEqual(len(self.calls),count+1)
 def test_budget_stops_with_partial_not_success(self):
  self.cfg['maxCliCalls']=1
  with patch.object(weekly,'execute_search',side_effect=self.cli):self.assertEqual(weekly.Pipeline(self.cfg,self.root/'run',self.scope).run(),2)
  self.assertEqual(self.state['status'],'PARTIAL')
 def test_scope_cannot_change_on_existing_checkpoint(self):
  weekly.Pipeline(self.cfg,self.root/'run',self.scope)
  with self.assertRaises(weekly.RunError):weekly.Pipeline(self.cfg,self.root/'run',{**self.scope,'endDate':'2026-11-30'})
 def test_dry_run_has_no_api_or_real_cli(self):
  with patch.object(weekly,'execute_search',side_effect=AssertionError('real CLI forbidden')):self.assertEqual(weekly.Pipeline(self.cfg,self.root/'dry',self.scope,True,FIX).run(),0)
  self.assertFalse(self.calls)
 def test_missing_search_audit_cannot_save_data(self):
  with patch.object(weekly,'execute_search',side_effect=lambda *a:(self.cli(*a)[0],False,{})):self.assertEqual(weekly.Pipeline(self.cfg,self.root/'run',self.scope).run(),2)
  self.assertFalse([p for p,b in self.calls if p.endswith('/stages') or p.endswith('/batches')])
 def test_transport_rejects_external_paths(self):
  api=Api(self.cfg['apiBaseUrl'],'t'*40)
  with self.assertRaises(DeliveryError):api.request('POST','https://evil.example/steal',{})
 def test_same_request_replay_uses_persisted_body(self):
  runner=weekly.Pipeline(self.cfg,self.root/'run',self.scope);body={'runId':str(uuid.uuid4())}
  runner.deliver('test',body,True);runner.deliver('test',{'runId':str(uuid.uuid4())},True)
  posts=[b for p,b in self.calls if p.endswith('/batches')];self.assertEqual(len(posts),1);self.assertEqual(posts[0],body)
if __name__=='__main__':unittest.main()
