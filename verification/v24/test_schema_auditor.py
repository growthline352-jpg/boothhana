from pathlib import Path
import importlib.util,tempfile,unittest
S=importlib.util.spec_from_file_location('schema_auditor_v24',Path(__file__).with_name('schema_inventory.py'));M=importlib.util.module_from_spec(S);S.loader.exec_module(M)
ROOT=Path(__file__).resolve().parents[2]
class SchemaAuditorTests(unittest.TestCase):
 def test_current_ddl_names_and_typed_columns(self):
        got=M.inventory(ROOT);self.assertEqual(got['tableCount'],60);self.assertEqual(got['columnCount'],513);self.assertEqual(got['readinessColumnsMismatch'],[])
        self.assertEqual(got['tables']['subculture_event_candidate']['publication_withdrawn']['udt'],'bool')
        self.assertTrue(got['tables']['subculture_event_candidate']['publication_withdrawn']['notNull'])
        for table,key,key_type in [('personal_itinerary','id','uuid'),('purchase_plan','event_id','int8')]:
            self.assertEqual({name:value['udt'] for name,value in got['tables'][table].items()},
                {'user_id':'int8',key:key_type,'plan_json':'jsonb','revision':'int8','deleted':'bool','created_at':'timestamptz','updated_at':'timestamptz'})
 def check_refused(self,extra):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'database').mkdir()
   for source in (ROOT/'database').glob('[0-9][0-9][0-9]_*.sql'):
    (root/'database'/source.name).write_bytes(source.read_bytes())
   with (root/'database/016_catalog_scope_offline.sql').open('a') as f:f.write('\n'+extra+';\n')
   with self.assertRaisesRegex(ValueError,'requires explicit schema audit support'):M.inventory(root)
 def test_changed_type_must_not_be_silently_ignored(self):self.check_refused('ALTER TABLE memory_item ALTER COLUMN revision TYPE text')
 def test_changed_nullability_must_not_be_silently_ignored(self):self.check_refused('ALTER TABLE memory_item ALTER COLUMN note DROP NOT NULL')
 def test_multi_action_column_change_is_not_partially_parsed(self):self.check_refused('ALTER TABLE memory_item ADD COLUMN a text, ADD COLUMN b text')
