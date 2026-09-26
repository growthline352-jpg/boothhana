"""v9 operation-state input contract. No live search or external mutation."""
from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rules import check_event, parse_result, identity, InvalidResult
from run import output_schema_for_cli
ROOT=Path(__file__).resolve().parents[1]
SAMPLE=json.loads((ROOT/'examples/sample.json').read_text(encoding='utf-8'))
class VisitStatusTests(unittest.TestCase):
    def event(self):return deepcopy(SAMPLE['events'][0])
    def check(self,e):return check_event(e,date(2026,10,1),date(2026,10,31))[0]
    def state(self,state='CANCELED'):
        return {'state':state,'note':'[TEST] 공식 상태 공지','sourceUrl':'https://example.com/notice','checkedOn':'2026-09-17'}
    def test_legacy_event_without_status_remains_readable(self):
        result=parse_result(json.dumps(SAMPLE).encode());self.assertFalse(self.check(result['events'][0]))
    def test_all_explicit_states_with_evidence(self):
        for state in ['SCHEDULED','CANCELED','POSTPONED','RESCHEDULED']:
            e=self.event();e['operationStatus']=self.state(state)
            with self.subTest(state=state):self.assertFalse(self.check(e))
    def test_unknown_does_not_require_invented_evidence(self):
        e=self.event();e['operationStatus']={'state':'UNKNOWN','note':None,'sourceUrl':None,'checkedOn':None};self.assertFalse(self.check(e))
    def test_warning_text_does_not_change_raw_state(self):
        e=self.event();e['warnings']=['[TEST] 취소된 것으로 추측하지 않는다'];before=deepcopy(e);self.assertFalse(self.check(e));self.assertEqual(e,before)
    def test_missing_note_rejected(self):
        e=self.event();e['operationStatus']={**self.state(),'note':None};self.assertTrue(self.check(e))
    def test_blank_note_rejected(self):
        e=self.event();e['operationStatus']={**self.state(),'note':'   '};self.assertTrue(self.check(e))
    def test_missing_source_rejected(self):
        e=self.event();e['operationStatus']={**self.state(),'sourceUrl':None};self.assertTrue(self.check(e))
    def test_missing_confirmation_day_rejected(self):
        e=self.event();e['operationStatus']={**self.state(),'checkedOn':None};self.assertTrue(self.check(e))
    def test_internal_or_script_source_rejected(self):
        for url in ['http://localhost/','javascript:alert(1)','http://169.254.169.254/','https://u:p@example.com/']:
            e=self.event();e['operationStatus']={**self.state(),'sourceUrl':url}
            with self.subTest(url=url):self.assertTrue(self.check(e))
    def test_invalid_calendar_rejected(self):
        e=self.event();e['operationStatus']={**self.state(),'checkedOn':'2026-02-30'};self.assertTrue(self.check(e))
    def test_bad_state_rejected(self):
        e=self.event();e['operationStatus']=self.state('OPEN_PROBABLY');self.assertTrue(self.check(e))
    def test_status_change_not_new_event_identity(self):
        e=self.event();key=identity(e);e['operationStatus']=self.state();self.assertEqual(identity(e),key)
    def test_schema_accepts_new_status_but_not_code(self):
        obj=deepcopy(SAMPLE);obj['events'][0]['operationStatus']=self.state();self.assertEqual(parse_result(json.dumps(obj).encode()),obj)
        obj['events'][0]['operationStatus']['javascript']='bad';self.assertRaises(InvalidResult,parse_result,json.dumps(obj).encode())
    def test_live_schema_requires_status_without_mutating_compat_schema(self):
        for name in ['event-result-v4.schema.json','search-result.schema.json']:
            schema=json.loads((ROOT/'schemas'/name).read_text());before=deepcopy(schema);out=output_schema_for_cli(schema)
            with self.subTest(name=name):
                self.assertIn('operationStatus',out['properties']['events']['items']['required']);self.assertEqual(schema,before)
    def test_participant_and_floorplan_cli_schemas_unchanged(self):
        for name in ['participants.schema.json','floorplan-analysis.schema.json']:
            path=ROOT/'schemas'/name
            if path.exists():
                source=json.loads(path.read_text());self.assertEqual(output_schema_for_cli(source),source)
if __name__=='__main__':unittest.main()
