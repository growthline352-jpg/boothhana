import os,tempfile,time,unittest,importlib.util,xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('gate',HERE/'release_gate.py');gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
class GateTests(unittest.TestCase):
 def test_environment_missing(self):
  with patch.dict(os.environ,{},clear=True):
   with self.assertRaises(ValueError):gate.validate_environment()
 def test_production_host_refused(self):
  with patch.dict(os.environ,{'BOOTH_FULL_TEST_URL':'jdbc:postgresql://prod.example:5432/boothhana_release_test'},clear=True):
   with self.assertRaises(ValueError):gate.validate_environment()
 def test_other_destructive_database_refused(self):
  env={}
  for prefix,db in [('BOOTH_FULL_TEST','boothhana_release_test'),('BOOTH_SUPPORT_TEST','boothhana_support_test')]:
   env.update({prefix+'_URL':f'jdbc:postgresql://localhost:5432/{db}',prefix+'_USER':'TEST',prefix+'_PASSWORD':'TEST'})
  with patch.dict(os.environ,env,clear=True):gate.validate_environment()
  env['BOOTH_CATALOG_TEST_URL']='do-not-run'
  with patch.dict(os.environ,env,clear=True):
   with self.assertRaises(ValueError):gate.validate_environment()
 def report(self,path,**attrs):
  root=ET.Element('testsuite',tests='14',failures='0',errors='0',skipped='0');root.attrib.update(attrs)
  for _ in range(14):ET.SubElement(root,'testcase')
  ET.ElementTree(root).write(path)
 def test_missing_report_refused(self):
  with tempfile.TemporaryDirectory() as t:
   with self.assertRaises(ValueError):gate.check_report(Path(t)/'missing.xml',14,time.time())
 def test_skip_refused(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'test.xml';self.report(p,skipped='1')
   with self.assertRaises(ValueError):gate.check_report(p,14,time.time())
 def test_failure_refused(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'test.xml';self.report(p,failures='1')
   with self.assertRaises(ValueError):gate.check_report(p,14,time.time())
 def test_stale_refused(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'test.xml';self.report(p);os.utime(p,(1,1))
   with self.assertRaises(ValueError):gate.check_report(p,14,time.time())
 def test_fresh_real_shape_accepted(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'test.xml';self.report(p);self.assertEqual(gate.check_report(p,14,time.time())['tests'],14)
 def test_no_testcase_elements_refused(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'test.xml';p.write_text('<testsuite tests="14" failures="0" errors="0" skipped="0"/>')
   with self.assertRaises(ValueError):gate.check_report(p,14,time.time())
class FreshAttemptTests(unittest.TestCase):
 def test_failed_precondition_overwrites_previous_green(self):
  with tempfile.TemporaryDirectory() as t, patch.dict(os.environ,{},clear=True):
   output=Path(t)/'gate.json';output.write_text('{\"state\":\"AUTOMATED_CHECKS_PASSED\"}')
   with patch.object(gate,'OUTPUT',output):
    with self.assertRaises(ValueError):gate.main()
   import json
   result=json.loads(output.read_text());self.assertEqual(result['state'],'NOT_READY');self.assertFalse(result['productionApproval'])

if __name__=='__main__':unittest.main(verbosity=2)
