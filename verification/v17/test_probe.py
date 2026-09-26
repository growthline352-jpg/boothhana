import importlib.util, unittest
from pathlib import Path
p=Path(__file__).with_name('library_probe.py');s=importlib.util.spec_from_file_location('probe',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ProbeTests(unittest.TestCase):
 def targets(self):return [{'type':'EVENT','eventId':i,'id':i,'participantId':None} for i in range(1,201)]
 def test_local_and_explicit_staging_only(self):
  self.assertEqual(m.base_url('http://localhost:8080'),'http://localhost:8080')
  for value in ['https://prod.example','http://staging.example','https://user:password@example.test','https://example.test/api']:
   with self.assertRaises(ValueError):m.base_url(value)
  self.assertEqual(m.base_url('https://staging.example',True),'https://staging.example')
 def test_targets_distinct_no_private_fields(self):
  self.assertEqual(len(m.validate_targets(self.targets())),200)
  for rows in [self.targets()[:199],[self.targets()[0]]*200,[dict(x,note='private') for x in self.targets()]]:
   with self.assertRaises(ValueError):m.validate_targets(rows)
 def test_identity_shape_and_bool_rejected(self):
  for field,value in [('eventId',True),('participantId',123),('id',-1),('type','BAD')]:
   rows=self.targets();rows[0][field]=value
   with self.assertRaises(ValueError):m.validate_targets(rows)
 def test_empty_percentiles_not_fabricated(self):
  result=m.summarize([{'ms':2,'status':503,'bytes':20,'ok':False}]);self.assertIsNone(result['p95_ms']);self.assertEqual(result['errors'],1)
 def test_percentiles(self):
  result=m.summarize([{'ms':x,'status':200,'bytes':10,'ok':True} for x in range(1,21)])
  self.assertEqual(result['p50_ms'],10.5);self.assertEqual(result['p95_ms'],19)
if __name__=='__main__':unittest.main(verbosity=2)
