from pathlib import Path
import unittest,tempfile,io,json,copy,hashlib,os,subprocess,sys
from unittest.mock import patch
from PIL import Image
from run import codex_command,execute_search,RunError
from weekly import load_config
from floorplans import FloorplanBatch
from floorplan_geometry import tiles,merge_tiles,EXTRACTOR,simple
from interactive_floorplan import build_schematic,merge_interactive_candidates,parse_accessible_booths,parse_accessible_layout,validate_comicw_map_edition
from run_scheduled import run as scheduled
ROOT=Path(__file__).resolve().parents[1];FIX=ROOT/'examples/floorplan-v8'
def png(w=1000,h=700):
 b=io.BytesIO();Image.new('RGB',(w,h),'white').save(b,format='PNG');return b.getvalue()
def geometry():return json.loads((FIX/'layout.json').read_text())
class GeometryTests(unittest.TestCase):
 def test_original_dimensions(self):
  with tempfile.TemporaryDirectory() as t:
   digest,w,h,overview,ts=tiles(png(),'image/png',Path(t));self.assertEqual((w,h),(1000,700));self.assertEqual(len(ts),1);self.assertEqual(digest,hashlib.sha256(png()).hexdigest());self.assertTrue(overview.exists())
 def test_tiles_overlap_cover_edges(self):
  with tempfile.TemporaryDirectory() as t:
   _,w,h,_,ts=tiles(png(3000,2100),'image/png',Path(t));self.assertEqual(max(x['x']+x['width'] for x in ts),w);self.assertEqual(max(x['y']+x['height'] for x in ts),h);self.assertTrue(any(x['x']>0 for x in ts))
 def test_tile_limit(self):
  with tempfile.TemporaryDirectory() as t:self.assertRaises(ValueError if False else Exception,tiles,png(3000,2100),'image/png',Path(t),max_tiles=1)
 def test_coordinates_rebased(self):
  tile={'x':1000,'y':0,'width':1000,'height':700};g=merge_tiles([(tile,geometry())],2000,700);self.assertAlmostEqual(g['shapes'][0]['points'][0]['x'],.55);self.assertEqual(g['extractorVersion'],EXTRACTOR)
 def test_deduplicated_tile(self):
  tile={'x':0,'y':0,'width':1000,'height':700};g=merge_tiles([(tile,geometry()),(tile,geometry())],1000,700);self.assertEqual(len(g['shapes']),4)
 def test_out_of_bounds(self):
  g=geometry();g['shapes'][0]['points'][0]['x']=1.2;v=merge_tiles([({'x':0,'y':0,'width':1000,'height':700},g)],1000,700);self.assertFalse(v['complete']);self.assertEqual(len(v['shapes']),3)
 def test_non_finite(self):
  for value in (float('nan'),float('inf'),True):
   g=geometry();g['shapes'][0]['points'][0]['x']=value;v=merge_tiles([({'x':0,'y':0,'width':1000,'height':700},g)],1000,700);self.assertEqual(len(v['shapes']),3)
 def test_clipped_not_guessed(self):
  g=geometry();g['shapes'][0]['boundaryConfirmed']=False;v=merge_tiles([({'x':0,'y':0,'width':1000,'height':700},g)],1000,700);self.assertEqual(len(v['shapes']),3);self.assertFalse(v['complete'])
 def test_self_intersections(self):
  self.assertFalse(simple([{'x':0,'y':0},{'x':1,'y':1},{'x':1,'y':0},{'x':0,'y':1}]))
 def test_repeated_points(self):self.assertFalse(simple([{'x':0,'y':0}]*4))
 def test_suffixes_preserved(self):
  v=merge_tiles([({'x':0,'y':0,'width':1000,'height':700},geometry())],1000,700);self.assertEqual([s['label'] for s in v['shapes']][-2:],['A-03a','A-03b'])
 def test_map_element_kind_preserved(self):
  g=geometry();g['shapes'][0]['kind']='RESTROOM';g['shapes'][0]['label']='화장실';v=merge_tiles([({'x':0,'y':0,'width':1000,'height':700},g)],1000,700)
  self.assertEqual(v['shapes'][0]['kind'],'RESTROOM');self.assertTrue(v['shapes'][0]['id'].startswith('f-'))
 def test_legacy_shape_without_kind_defaults_to_booth(self):
  g=geometry();g['shapes'][0].pop('kind');v=merge_tiles([({'x':0,'y':0,'width':1000,'height':700},g)],1000,700)
  self.assertEqual(v['shapes'][0]['kind'],'BOOTH');self.assertTrue(v['shapes'][0]['id'].startswith('b-'))
 def test_rotated_exif_refused(self):
  image=Image.new('RGB',(100,100));ex=image.getexif();ex[274]=6;b=io.BytesIO();image.save(b,format='JPEG',exif=ex)
  with tempfile.TemporaryDirectory() as t:self.assertRaises(Exception,tiles,b.getvalue(),'image/jpeg',Path(t))
class WorkerTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.path=Path(self.tmp.name);self.cfg=load_config(None);self.cfg['stateDirectory']=str(self.path/'state')
 def test_fixture_full_pipeline(self):
  batch=FloorplanBatch(self.cfg,self.path/'run',dry=True,fixtures=FIX);self.assertEqual(batch.run(),0);self.assertEqual(len(batch.events[0]['geometry']['shapes']),4)
 def test_image_arguments(self):
  cmd=codex_command('codex',Path('schema'),Path('out'),images=[Path('a.png'),Path('b.png')],web_search=False);self.assertEqual(cmd.count('--image'),2);self.assertIn('web_search="disabled"',cmd);self.assertIn('read-only',cmd);self.assertNotIn('--yolo',cmd)
 def test_live_image_subprocess_contract(self):
  script=self.path/'fake-codex.py';script.write_text("#!/usr/bin/env python3\nimport sys,json,os,pathlib\na=sys.argv[1:];assert a.count('--image')==2;assert 'BOOTH_COLLECTOR_TOKEN' not in os.environ;assert 'web_search=\"disabled\"' in a\nfor i,x in enumerate(a):\n if x=='--image':assert pathlib.Path(a[i+1]).exists()\nout=pathlib.Path(a[a.index('--output-last-message')+1]);out.write_text('{}');sys.stdin.read()\nprint(json.dumps({'type':'turn.completed','usage':{}}))\n",encoding='utf-8')
  if os.name=='nt':
   fake=self.path/'fake-codex.cmd';fake.write_text(f'@echo off\r\nset PYTHONUTF8=1\r\n"{sys.executable}" "{script}" %*\r\n',encoding='utf-8')
  else:
   fake=script;fake.chmod(0o755)
  cfg={**self.cfg,'codexExecutable':str(fake)};job=self.path/'job';job.mkdir()
  with patch.dict(os.environ,{'CODEX_API_KEY':'fake-only','BOOTH_COLLECTOR_TOKEN':'do-not-pass'}):raw,web,_=execute_search(cfg,job,'Analyze attached image',ROOT/'schemas/floorplan-layout.schema.json',images=[FIX/'map.png',FIX/'map.png'],web_search=False)
  self.assertEqual(raw,b'{}');self.assertFalse(web)
 def test_imminent_target_request(self):
  class API:
   def __init__(self):self.paths=[]
   def request(self,m,p,*a,**kw):self.paths.append(p);return []
  api=API();batch=FloorplanBatch(self.cfg,self.path/'run',api=api);self.assertEqual(batch.run(True),0);self.assertIn('imminent=true',api.paths[0])
 def test_failed_discovery_does_not_skip_sources(self):
  self._failure_case()
 def _failure_case(self):
  class API:
   def __init__(self):self.paths=[]
   def request(self,m,p,*a,**kw):
    self.paths.append(p)
    if '/targets?' in p:return json.loads((FIX/'targets.json').read_text())
    if p.endswith('/sources'):return []
    return {}
  api=API();b=FloorplanBatch(self.cfg,self.path/'r',api=api)
  with patch.object(b,'discover',side_effect=RunError('search failed')):self.assertEqual(b.run(),2)
  self.assertTrue(any(p.endswith('/sources') for p in api.paths));self.assertTrue(any(p.endswith('/finish') for p in api.paths))
 def test_pending_permissions_do_not_spend_limit(self):
  good={'asset':{'id':3,'rightsState':'APPROVED'},'canTransform':True};bad={'asset':{'id':1,'rightsState':'PENDING'},'canTransform':False}
  class API:
   def request(self,m,p,*a,**kw):
    if '/targets?' in p:return json.loads((FIX/'targets.json').read_text())
    if p.endswith('/sources'):return [bad,bad,good]
    return {}
  self.cfg['floorplanMaxSources']=1;b=FloorplanBatch(self.cfg,self.path/'r',api=API())
  with patch.object(b,'discover',return_value={'status':'NOT_FOUND'}),patch.object(b,'process_source',return_value={'state':'DRAFT'}) as process:self.assertEqual(b.run(),0)
  self.assertEqual(process.call_args.args[1],good)
 def test_unchanged_original_reuses_geometry(self):
  class API:
   def __init__(self):self.paths=[]
   def request(self,m,p,*a,**kw):self.paths.append(p);return {'id':'existing','geometry':{'shapes':[]},'state':'APPROVED'}
  source={'asset':{'id':1,'rightsState':'APPROVED','imageUrl':'https://example.com/map.png','pageUrl':'https://example.com/event'},'canTransform':True,'sourceRevision':1};api=API();b=FloorplanBatch(self.cfg,self.path/'r',api=api)
  with patch('floorplans.fetch_image',return_value=(png(),'image/png',hashlib.sha256(png()).hexdigest())),patch.object(b,'vision') as vision:b.process_source(1,source)
  vision.assert_not_called();self.assertTrue(api.paths[-1].endswith('/remap'))
 def test_partial_tile_resume(self):
  self.cfg['floorplanMaxCliCalls']=1;b=FloorplanBatch(self.cfg,self.path/'a',dry=True,fixtures=FIX);cache=self.path/'cache'
  with self.assertRaises(RunError):b.vision(1,png(2100,700),'image/png',cache)
  self.assertTrue((cache/'analysis-0/result.json').exists());b2=FloorplanBatch(self.cfg,self.path/'b',dry=True,fixtures=FIX);b2.vision(1,png(2100,700),'image/png',cache);self.assertEqual(b2.calls,1)
 def test_permissions_checked_before_download(self):
  b=FloorplanBatch(self.cfg,self.path/'r',dry=True)
  source={'asset':{'id':1,'rightsState':'PENDING','imageUrl':'https://example.com/map.png','pageUrl':'https://example.com/event'},'canTransform':False}
  with patch('floorplans.fetch_image') as fetch:r=b.process_source(1,source)
  fetch.assert_not_called();self.assertEqual(r['state'],'WAITING_PERMISSION')
 def test_live_dry_run_uses_only_given_events(self):
  eventfile=self.path/'events.json';eventfile.write_text((FIX/'targets.json').read_text());b=FloorplanBatch(self.cfg,self.path/'r',dry=True,event_file=eventfile)
  with patch.object(b,'discover',return_value={'status':'NOT_FOUND'}):self.assertEqual(b.run(),0)
 def test_expired_mode_checkpoint_rejected(self):
  b=FloorplanBatch(self.cfg,self.path/'r',dry=True);self.assertRaises(RunError,FloorplanBatch,self.cfg,self.path/'r',dry=False,api=object())
 def test_sunday_continues_after_partial(self):
  calls=[]
  def runner(cmd,**kw):calls.append(cmd);return subprocess.CompletedProcess(cmd,2 if len(calls)==1 else 0)
  self.assertEqual(scheduled(None,runner),2);self.assertEqual(len(calls),2);self.assertIn('floorplans.py',calls[-1][1])
 def test_sunday_continues_after_failure(self):
  calls=[]
  def runner(cmd,**kw):calls.append(cmd);return subprocess.CompletedProcess(cmd,1 if len(calls)==1 else 0)
  self.assertEqual(scheduled(None,runner),1);self.assertEqual(len(calls),2)
 def test_schema_discovery(self):
  import jsonschema
  jsonschema.validate(json.loads((FIX/'discovery.json').read_text()),json.loads((ROOT/'schemas/floorplan-discovery.schema.json').read_text()))
 def test_html_hint_is_not_fabricated_as_interactive_map(self):
  event={'name':'행사','occurrences':[{'startDate':'2026-10-10','endDate':'2026-10-11'}],'discoveryLinks':[{'kind':'FLOOR_PLAN','url':'https://example.com/event/map'}]}
  value=merge_interactive_candidates({'status':'NOT_FOUND','availableOn':None,'plans':[],'checkedUrls':['https://example.com/event'],'warnings':[]},event)
  self.assertEqual(value['status'],'NOT_FOUND');self.assertEqual(value['plans'],[])
 def test_verified_interactive_map_is_preserved(self):
  url='https://example.com/event/map';event={'name':'행사','occurrences':[{'startDate':'2026-10-10','endDate':'2026-10-11'}]}
  plan={'imageUrl':url,'pageUrl':url,'scope':{'hall':None,'zone':None,'dates':['2026-10-10','2026-10-11'],'title':'클릭형 배치도'},'evidence':'접근성 부스 컨트롤을 확인함'}
  value=merge_interactive_candidates({'status':'FOUND','availableOn':None,'plans':[plan],'checkedUrls':[url],'warnings':[]},event)
  self.assertEqual(value['plans'],[plan]);self.assertTrue(any('클릭형 HTML' in warning for warning in value['warnings']))
 def test_known_floorplan_image_does_not_require_rediscovery(self):
  url='https://official.example/floorplans/2026-map.jpg'
  event={'name':'행사','occurrences':[{'startDate':'2026-10-10','endDate':'2026-10-11'}],'discoveryLinks':[{'kind':'FLOOR_PLAN','url':url}]}
  value=merge_interactive_candidates({'status':'NOT_FOUND','availableOn':None,'plans':[],'checkedUrls':[],'warnings':[]},event)
  self.assertEqual(value['status'],'FOUND');self.assertEqual(value['plans'][0]['imageUrl'],url);self.assertEqual(value['plans'][0]['pageUrl'],url);self.assertNotIn('클릭형 HTML',value['warnings'])
 def test_participant_floorplan_hint_promotes_direct_image_with_scope(self):
  url='https://official.example/floorplans/hall-a.png';event={'name':'행사','occurrences':[{'startDate':'2026-10-10','endDate':'2026-10-11'}]}
  hints=[{'url':url,'hall':'A홀','zone':None,'dates':['2026-10-11'],'title':'A홀 배치도','evidence':'참가부스 위치 데이터'}]
  value=merge_interactive_candidates({'status':'NOT_FOUND','availableOn':None,'plans':[],'checkedUrls':[],'warnings':[]},event,hints)
  self.assertEqual(value['status'],'FOUND');self.assertEqual(value['plans'][0]['scope']['hall'],'A홀');self.assertEqual(value['plans'][0]['scope']['dates'],['2026-10-11'])
 def test_discovery_prompt_receives_participant_floorplan_hints(self):
  target=json.loads((FIX/'targets.json').read_text(encoding='utf-8'))[0]
  target['floorplanHints']=[{'url':'https://official.example/map-page','hall':None,'zone':None,'dates':[],'title':'배치도','evidence':'부스 위치 링크'}]
  batch=FloorplanBatch(self.cfg,self.path/'hint-run',dry=True,event_file=self.path/'unused.json')
  observed={}
  def fake(path,prompt,schema,**kwargs):
   observed['prompt']=prompt
   return {'status':'NOT_FOUND','availableOn':None,'plans':[],'checkedUrls':['https://official.example/map-page'],'warnings':[]}
  with patch.object(batch,'job',side_effect=fake):batch.discover(target)
  self.assertIn('floorplanHints',observed['prompt']);self.assertIn('official.example/map-page',observed['prompt'])
 def test_accessible_html_becomes_complete_schematic(self):
  html=(FIX/'interactive.html').read_text(encoding='utf-8');booths=parse_accessible_booths(html)
  self.assertEqual([(b['hall'],b['code']) for b in booths],[('제1전시실','A-16'),('제1전시실','A-17'),('제1전시실','A-13A'),('제2전시실','B-01'),('제2전시실','B-02')])
  _,facilities=parse_accessible_layout(html);self.assertEqual([(f['hall'],f['kind'],f['label']) for f in facilities],[('제1전시실','ENTRANCE','입구/재입장'),('제1전시실','EXIT','출구'),('제2전시실','RESTROOM','화장실')])
  data,mime,digest,width,height,geometry=build_schematic(html)
  self.assertEqual(mime,'image/png');self.assertEqual(digest,hashlib.sha256(data).hexdigest());self.assertGreaterEqual(width,720);self.assertGreaterEqual(height,480);self.assertTrue(geometry['complete']);self.assertEqual(len(geometry['shapes']),8);self.assertEqual(sum(s['kind']!='BOOTH' for s in geometry['shapes']),3)
  changed=html.replace('B-02 참가자','B-03 참가자')
  self.assertNotEqual(digest,build_schematic(changed)[2])
 def test_interactive_source_skips_vision_and_uses_existing_analysis_api(self):
  html=(FIX/'interactive.html').read_text(encoding='utf-8')
  class API:
   def __init__(self):self.analysis=None
   def request(self,m,p,data=None,**kw):
    if p.endswith('/versions'):return {'id':'11111111-1111-1111-1111-111111111111','revision':1,'geometry':None,'state':'AWAITING_IMAGE'}
    if p.endswith('/content'):return {'revision':1,'geometry':None,'state':'AWAITING_ANALYSIS'}
    if p.endswith('/analysis'):self.analysis=data;return {'state':'DRAFT','mapping':{'matched':1,'unresolved':4}}
    return {}
  api=API();b=FloorplanBatch(self.cfg,self.path/'interactive-run',api=api)
  source={'asset':{'id':1,'rightsState':'APPROVED','imageUrl':'https://example.com/event/map','pageUrl':'https://example.com/event/map'},'canTransform':True,'sourceRevision':1}
  with patch('floorplans.fetch_html',return_value=(html,'0'*64)),patch('floorplans.fetch_image') as image,patch.object(b,'vision') as vision:
   value=b.process_source(1,source)
  image.assert_not_called();vision.assert_not_called();self.assertEqual(len(api.analysis['geometry']['shapes']),8);self.assertEqual(value['mapped'],1)
 def test_comicworld_map_rejects_prior_event_image(self):
  asset={'pageUrl':'https://comicw.net/map/338/','imageUrl':'https://comicw.net/data/booth_map/fare_337_1789693061.jpg'}
  with self.assertRaisesRegex(ValueError,'requested 338, image is 337'):
   validate_comicw_map_edition(asset)
  asset['imageUrl']='https://comicw.net/map/338/'
  html='const MAP_IMG_URL = "https:\\/\\/comicw.net\\/data\\/booth_map\\/fare_337_1789693061.jpg";'
  with self.assertRaisesRegex(ValueError,'requested 338, image is 337'):
   validate_comicw_map_edition(asset,html)
  validate_comicw_map_edition(asset,html.replace('fare_337','fare_338'))
  validate_comicw_map_edition({'pageUrl':'https://example.com/map/338/','imageUrl':'https://example.com/fare_337_map.jpg'})
 def test_comicworld_mismatch_stops_before_download(self):
  b=FloorplanBatch(self.cfg,self.path/'comicworld-guard',dry=True)
  source={'asset':{'id':1,'rightsState':'APPROVED','pageUrl':'https://comicw.net/map/338/',
                   'imageUrl':'https://comicw.net/data/booth_map/fare_337_1789693061.jpg'},
          'canTransform':True,'sourceRevision':1}
  with patch('floorplans.fetch_image') as fetch:
   with self.assertRaisesRegex(ValueError,'requested 338, image is 337'):
    b.process_source(6,source)
  fetch.assert_not_called()
if __name__=='__main__':unittest.main()
