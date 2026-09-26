"""Deterministic region/category + real schema/pipeline fixtures. No live research/DB."""
import sys,json,unittest,tempfile
from pathlib import Path
from copy import deepcopy
from datetime import date
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'collector'))
from rules import check_event,parse_result
from taxonomy import GROUPS,REGIONS,category_for,region_errors
from catalog_rules import parse_schema,validate_discovery
import weekly
SAMPLE=json.loads((ROOT/'collector/examples/v5/events.json').read_text())
class ScopeTests(unittest.TestCase):
 def event(self):return deepcopy(SAMPLE['events'][0])
 def check(self,e):return check_event(e,date(2026,10,1),date(2026,10,31))[0]
 def test_all_fifteen_types_in_both_regions(self):
  for category,types in GROUPS.items():
   for type_ in types:
    for region in REGIONS:
     with self.subTest(category=category,type=type_,region=region):
      e=self.event();e.update(subcategory=type_,region=region,venueName='킨텍스' if region=='GYEONGGI' else '코엑스',address='경기도 고양시' if region=='GYEONGGI' else '서울특별시 강남구')
      self.assertFalse(self.check(e));self.assertEqual(category_for(type_),category)
      result={**SAMPLE,'events':[e]};parse_schema(json.dumps(result).encode(),'event-result-v4.schema.json')
      accepted,rejected=validate_discovery(result,date(2026,10,1),date(2026,10,31),[]);self.assertEqual(len(accepted),1);self.assertFalse(rejected)
 def test_incheon_never_becomes_gyeonggi(self):
  for region in ['SEOUL','GYEONGGI','OTHER','UNKNOWN','INCHEON']:
   with self.subTest(region=region):
    e=self.event();e.update(region=region,venueName='송도컨벤시아',address='인천광역시 연수구');self.assertTrue(self.check(e))
 def test_address_region_mismatch_and_known_venues(self):
  for region,address,place in [('SEOUL','경기도 수원시','수원메쎄'),('GYEONGGI','서울특별시 강남구','코엑스'),('SEOUL',None,'KINTEX'),('GYEONGGI','부산광역시','벡스코')]:
   self.assertTrue(region_errors(region,address,place))
 def test_no_region_inference_from_title(self):
  e=self.event();e.update(name='서울 테스트전',region='GYEONGGI',address='경기도 수원시',venueName='수원메쎄');self.assertFalse(self.check(e))
 def test_unknown_type_rejected(self):
  e=self.event();e['subcategory']='UNKNOWN';self.assertTrue(self.check(e))
 def test_shared_region_schema_legacy_shape_preserved(self):
  result=json.loads((ROOT/'collector/examples/sample.json').read_text());result['events'][0].update(region='GYEONGGI',address='경기도 고양시',venueName='킨텍스',subcategory='DESIGN');parse_result(json.dumps(result).encode())
 def test_prompt_format_all_fields(self):
  text=(ROOT/'collector/prompts/events-v4.md').read_text().format(today='2026-09-18',start_date='2026-10-01',end_date='2026-10-31')
  for word in ['인천','GYEONGGI','WEDDING','MUSIC','PARTIAL']:self.assertIn(word,text)
 def test_old_scope_resume_refused_before_network(self):
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp);(p/'pipeline.json').write_text(json.dumps({'scope':{'region':'SEOUL'}}))
   with self.assertRaises(weekly.RunError):weekly.main(['--resume',str(p),'--dry-run'])
 def test_actual_dry_pipeline_combined_scope(self):
  with tempfile.TemporaryDirectory() as temp:
   cfg=weekly.load_config(None);scope={'region':'SEOUL_GYEONGGI','timezone':'Asia/Seoul','startDate':'2026-10-01','endDate':'2026-10-31'}
   with patch.object(weekly,'execute_search',side_effect=AssertionError('No live CLI')):
    pipeline=weekly.Pipeline(cfg,Path(temp),scope,True,ROOT/'collector/examples/v5');self.assertEqual(pipeline.run(),0)
   self.assertEqual(pipeline.scope['region'],'SEOUL_GYEONGGI')
 def test_sql_is_additive_and_permission_defaults_false(self):
  sql=(ROOT/'database/016_catalog_scope_offline.sql').read_text()
  self.assertIn('offline_allowed boolean not null default false',sql)
  for types in GROUPS.values():
   for type_ in types:self.assertIn("'"+type_+"'",sql)
  self.assertNotIn('delete from',sql.lower());self.assertNotIn('update subculture',sql.lower())
if __name__=='__main__':unittest.main()
