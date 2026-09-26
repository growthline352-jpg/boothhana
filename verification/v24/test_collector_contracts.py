"""Real collector/schema/cache modules; local fixtures, never CLI/network or database."""
from pathlib import Path
import os,sys,json,tempfile,shutil,unittest,importlib.util
ROOT=Path(os.environ.get('BOOTHHANA_REVIEW_BASELINE',Path(__file__).resolve().parents[2]))
sys.path.insert(0,str(ROOT/'collector'))
import jsonschema
import floorplans
from floorplans import FloorplanBatch
from floorplan_geometry import merge_tiles

def geometry(label='A1'):
    return {'complete':True,'shapes':[{'label':label,'points':[{'x':0.1,'y':0.1},{'x':0.4,'y':0.1},{'x':0.4,'y':0.4}], 'recognition':'READABLE','boundaryConfirmed':True}],'warnings':[]}

def validate(value,name='floorplan-layout.schema.json'):
    path=ROOT/'collector/schemas'/name
    if hasattr(floorplans,'validate_payload'):floorplans.validate_payload(value,path)
    else:jsonschema.Draft202012Validator(json.loads(path.read_text())).validate(value)

class LayoutContractTests(unittest.TestCase):
    def bad(self,g):
        with self.assertRaises((ValueError,jsonschema.ValidationError)):validate(g)
    def test_label_limit(self):self.bad(geometry('x'*81))
    def test_java_utf16_emoji_limit(self):self.bad(geometry('😀'*41))
    def test_label_at_server_limit(self):validate(geometry('가'*80));validate(geometry('😀'*40))
    def test_coordinate_range(self):
        g=geometry();g['shapes'][0]['points'][0]['x']=1.01;self.bad(g)
    def test_minimum_points(self):
        g=geometry();g['shapes'][0]['points']=g['shapes'][0]['points'][:2];self.bad(g)
    def test_maximum_points(self):
        g=geometry();g['shapes'][0]['points']*=6;self.bad(g)
    def test_warning_limit(self):
        g=geometry();g['warnings']=['x'*1001];self.bad(g)
    def test_blank_warning(self):
        g=geometry();g['warnings']=['   '];self.bad(g)
    def test_warning_count(self):
        g=geometry();g['warnings']=['warning']*201;self.bad(g)
    def test_reducer_never_sends_overlong_label_to_java(self):
        tile={'x':0,'y':0,'width':1000,'height':1000};g=merge_tiles([(tile,geometry('😀'*41))],1000,1000)
        self.assertEqual(g['shapes'],[]);self.assertFalse(g['complete']);self.assertTrue(g['warnings'])
    def test_reducer_never_sends_overlong_warning_to_java(self):
        v=geometry();v['warnings']=['x'*1001];g=merge_tiles([({'x':0,'y':0,'width':1000,'height':1000},v)],1000,1000)
        self.assertFalse(g['complete']);self.assertTrue(all(0<len(s)<=1000 for s in g['warnings']))

class DiscoveryContractTests(unittest.TestCase):
    def value(self):
        return {'status':'FOUND','availableOn':None,'plans':[{'imageUrl':'https://example.com/map.png','pageUrl':'https://example.com/event','scope':{'hall':'A','zone':None,'dates':['2026-10-01'],'title':'Map'},'evidence':'official'}],'checkedUrls':['https://example.com/event'],'warnings':[]}
    def bad(self,x):
        with self.assertRaises((ValueError,jsonschema.ValidationError)):validate(x,'floorplan-discovery.schema.json')
    def test_hall_limit(self):
        x=self.value();x['plans'][0]['scope']['hall']='x'*201;self.bad(x)
    def test_title_limit(self):
        x=self.value();x['plans'][0]['scope']['title']='x'*301;self.bad(x)
    def test_invalid_calendar_day(self):
        x=self.value();x['plans'][0]['scope']['dates']=['2026-02-30'];self.bad(x)
    def test_duplicate_day(self):
        x=self.value();x['plans'][0]['scope']['dates']*=2;self.bad(x)
    def test_status_sources_agree(self):
        x=self.value();x['status']='NOT_FOUND';self.bad(x)
    def test_valid_discovery(self):validate(self.value(),'floorplan-discovery.schema.json')

class CacheContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.path=Path(self.tmp.name)
        self.fix=self.path/'fixtures';self.fix.mkdir();self.file=self.fix/'layout.json';self.file.write_text(json.dumps(geometry('A')))
        self.image=self.path/'tile.png';self.image.write_bytes(b'bytes-for-input-fingerprint')
        cfg={'floorplanMaxMinutes':10,'floorplanMaxCliCalls':20}
        self.batch=FloorplanBatch(cfg,self.path/'run',dry=True,fixtures=self.fix)
        self.cache=self.path/'cache'
    def job(self,prompt='P'):
        return self.batch.job(self.cache,prompt,'floorplan-layout.schema.json',images=[self.image],fixture='layout.json')
    def change_fixture(self):self.file.write_text(json.dumps(geometry('B')))
    def test_identical_input_reuses_valid_result(self):
        self.job();self.change_fixture();self.assertEqual(self.job()['shapes'][0]['label'],'A');self.assertEqual(self.batch.calls,1)
    def test_prompt_change_invalidates_result(self):
        self.job();self.change_fixture();self.assertEqual(self.job('different prompt')['shapes'][0]['label'],'B');self.assertEqual(self.batch.calls,2)
    def test_actual_image_bytes_change_invalidates_result(self):
        self.job();self.change_fixture();self.image.write_bytes(b'changed bytes');self.assertEqual(self.job()['shapes'][0]['label'],'B')
    def test_cached_payload_hash_mismatch_is_not_reused(self):
        self.job();(self.cache/'result.json').write_text(json.dumps(geometry('TAMPERED')));self.assertEqual(self.job()['shapes'][0]['label'],'A')
    def test_legacy_cache_without_verifiable_audit_is_rebuilt(self):
        self.cache.mkdir();(self.cache/'result.json').write_text(json.dumps(geometry('OLD')));self.assertEqual(self.job()['shapes'][0]['label'],'A')
    def test_cache_corruption_recovers_from_fresh_fixture(self):
        self.job();(self.cache/'result.json').write_text('{broken');self.assertEqual(self.job()['shapes'][0]['label'],'A')
    def test_cached_long_label_is_rejected_before_submission(self):
        self.job();(self.cache/'result.json').write_text(json.dumps(geometry('x'*81)));self.assertEqual(self.job()['shapes'][0]['label'],'A')

if __name__=='__main__':unittest.main()
