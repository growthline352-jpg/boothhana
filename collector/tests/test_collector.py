from __future__ import annotations
from copy import deepcopy
from datetime import date
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rules import *
from run import persist_refreshed_auth, child_environment, codex_command, date_window, audit_search, audit_opened_urls, main, RunError, config
from transport import endpoint, DeliveryError
ROOT=Path(__file__).resolve().parents[1]
SAMPLE=json.loads((ROOT/'examples/sample.json').read_text(encoding='utf-8'))

class RuleTests(unittest.TestCase):
    def event(self): return deepcopy(SAMPLE['events'][0])
    def check(self,e): return check_event(e,date(2026,10,1),date(2026,10,31))
    def test_valid_schema(self): self.assertEqual(parse_result(json.dumps(SAMPLE).encode()),SAMPLE)
    def test_unknown_property(self):
        d=deepcopy(SAMPLE);d['injected']='ignore';self.assertRaises(InvalidResult,parse_result,json.dumps(d).encode())
    def test_duplicate_json_key(self): self.assertRaises(InvalidResult,parse_result,b'{"x":1,"x":2}')
    def test_markdown_not_json(self): self.assertRaises(InvalidResult,parse_result,b'```json\n{}\n```')
    def test_missing_property(self):
        d=deepcopy(SAMPLE);del d['events'][0]['sources'];self.assertRaises(InvalidResult,parse_result,json.dumps(d).encode())
    def test_size_limit(self): self.assertRaises(InvalidResult,parse_result,b' '* (MAX_JSON_BYTES+1))
    def test_outside_seoul(self):
        e=self.event();e['region']='OTHER';self.assertTrue(self.check(e)[0])
    def test_kintex_even_seoul_label(self):
        e=self.event();e['venueName']='KINTEX 제1전시장';self.assertTrue(self.check(e)[0])
    def test_gyeonggi_address(self):
        e=self.event();e['address']='경기도 수원시';self.assertTrue(self.check(e)[0])
    def test_unknown_region(self):
        e=self.event();e['region']='UNKNOWN';self.assertTrue(self.check(e)[0])
    def test_noncontiguous_dates_preserved(self):
        e=self.event();self.assertFalse(self.check(e)[0]);self.assertEqual(len(e['occurrences']),2)
        self.assertNotIn('2026-10-12',[o['startDate'] for o in e['occurrences']])
    def test_unknown_time_allowed_with_warning(self):
        errors,warnings=self.check(self.event());self.assertFalse(errors);self.assertIn('운영시간 확인 필요',warnings)
    def test_inverted_range(self):
        e=self.event();e['occurrences'][0]['endDate']='2026-10-01';self.assertTrue(self.check(e)[0])
    def test_invalid_calendar(self):
        e=self.event();e['occurrences'][0]['startDate']='2026-02-30';self.assertTrue(self.check(e)[0])
    def test_outside_window(self):
        e=self.event();e['occurrences']=[{'startDate':'2027-01-01','endDate':'2027-01-02','startTime':None,'endTime':None}];self.assertTrue(self.check(e)[0])
    def test_ongoing_overlap_accepted(self):
        e=self.event();e['occurrences']=[{'startDate':'2026-09-30','endDate':'2026-10-01','startTime':None,'endTime':None}];self.assertFalse(self.check(e)[0])
    def test_repeated_day_rejected(self):
        e=self.event();e['occurrences'][1]['startDate']='2026-10-11';self.assertTrue(self.check(e)[0])
    def test_bad_time(self):
        e=self.event();e['occurrences'][0]['startTime']='25:00';self.assertTrue(self.check(e)[0])
    def test_missing_evidence(self):
        e=self.event();e['sources'][0]['access']='INACCESSIBLE';self.assertTrue(self.check(e)[0])
    def test_missing_sources(self):
        e=self.event();e['sources']=[];self.assertTrue(self.check(e)[0])
    def test_snippet_not_claimed_verified(self):
        _,warnings=self.check(self.event());self.assertTrue(any('원문 직접 확인' in w for w in warnings))
    def test_bad_urls(self):
        for u in ['javascript:alert(1)','data:image/png;base64,x','http://localhost/a','https://127.0.0.1/a','http://169.254.169.254/latest','https://u:p@example.com','https://example.com:9000/a','https://[::1]/','https://2130706433/a','https://a.local/a','https://example.com/\n']:
            with self.subTest(u=u): self.assertRaises(ValueError,public_url,u)
    def test_url_no_auto_fetch(self): self.assertEqual(public_url('https://example.com/post?id=123'),'https://example.com/post?id=123')
    def test_bad_banner_does_not_reach_database(self):
        e=self.event();e['banners'][0]['imageUrl']='file:///etc/passwd';self.assertTrue(self.check(e)[0])
    def test_no_banner_still_accepted(self):
        e=self.event();e['banners']=[];errors,warnings=self.check(e);self.assertFalse(errors);self.assertIn('배너 없음',warnings)
    def test_duplicate_within_batch(self):
        d=deepcopy(SAMPLE);d['events']*=2;r=inspect_result(d,date(2026,10,1),date(2026,10,31));self.assertEqual(r['count'],1);self.assertEqual(len(r['rejected']),1)
    def test_distinct_organizers_not_merged(self):
        a=self.event();b=self.event();b['organizer']='다른 주최';self.assertNotEqual(identity(a),identity(b))
    def test_distinct_dates_not_auto_merged(self):
        a=self.event();b=self.event();b['occurrences'][0]['startDate']='2026-10-09';self.assertNotEqual(identity(a),identity(b))
    def test_normalized_title(self):
        a=self.event();b=self.event();b['name']='  [TEST] 샘플   온리전 ';self.assertEqual(identity(a),identity(b))
    def test_time_change_same_candidate(self):
        a=self.event();b=self.event();b['occurrences'][0]['startTime']='10:00';self.assertEqual(identity(a),identity(b))
    def test_empty_complete_result(self):
        d=deepcopy(SAMPLE);d['events']=[];self.assertEqual(inspect_result(d,date(2026,10,1),date(2026,10,31))['count'],0)

class RunnerTests(unittest.TestCase):
    def test_month_leap_year(self): self.assertEqual(date_window('2028-02'),(date(2028,2,1),date(2028,2,29)))
    def test_exclusive_window_args(self): self.assertRaises(RunError,date_window,'2026-10','2026-10-01',None)
    def test_reverse_window(self): self.assertRaises(RunError,date_window,None,'2026-10-31','2026-10-01')
    def test_missing_end(self): self.assertRaises(RunError,date_window,None,'2026-10-01',None)
    def test_child_secrets_not_inherited(self):
        home=Path('/tmp/fake');env=child_environment(home,{'PATH':'/bin','DATABASE_URL':'secret','GOOGLE_APPLICATION_CREDENTIALS':'secret','BOOTH_COLLECTOR_TOKEN':'secret','CODEX_API_KEY':'provider','HOME':'/private','CUSTOM_VAR':'secret'})
        self.assertEqual(env['CODEX_API_KEY'],'provider')
        for key in ['DATABASE_URL','GOOGLE_APPLICATION_CREDENTIALS','BOOTH_COLLECTOR_TOKEN','CUSTOM_VAR']: self.assertNotIn(key,env)
        self.assertEqual(env['HOME'],str(home))
    def test_safe_codex_args(self):
        cmd=codex_command('/codex',Path('/s.json'),Path('/o.json'))
        self.assertIn('web_search="live"',cmd);self.assertIn('features.shell_tool=false',cmd);self.assertEqual(cmd[-1],'-');self.assertNotIn('--yolo',cmd)
    def test_unsafe_api_origin(self):
        for u in ['http://example.com','https://u:p@example.com','https://example.com?token=x','https://example.com/api']:
            self.assertRaises(DeliveryError,endpoint,u)
    def test_localhost_api_origin(self): self.assertEqual(endpoint('http://localhost:8080/'),'http://localhost:8080/api/internal/subculture/batches')
    def test_isolated_docker_api_origin(self): self.assertEqual(endpoint('http://boothhana-api:8080'),'http://boothhana-api:8080/api/internal/subculture/batches')
    def test_docker_api_origin_requires_exact_port(self):
        with self.assertRaises(DeliveryError):endpoint('http://boothhana-api:8081')
    def test_audit_requires_completed_search(self):
        with tempfile.TemporaryDirectory() as temp:
            f=Path(temp)/'a';f.write_text('{"type":"item.started","item":{"type":"web_search"}}\n');self.assertFalse(audit_search(f)[0])
            f.write_text('{"type":"item.completed","item":{"type":"web_search"}}\n');self.assertTrue(audit_search(f)[0])
    def test_audit_distinguishes_search_from_opened_page(self):
        with tempfile.TemporaryDirectory() as temp:
            f=Path(temp)/'a';f.write_text('\n'.join([
                json.dumps({'type':'item.completed','item':{'type':'web_search','query':'event search','action':{'type':'search'}}}),
                json.dumps({'type':'item.completed','item':{'type':'web_search','query':'https://Official.Example/event/#top','action':{'type':'other'},'results':[{'url':'https://Official.Example/event/#top','ref_id':'turn0view0','snippet':'Total lines: 30'}]}}),
            ]))
            self.assertEqual(audit_opened_urls(f),['https://official.example/event'])
    def test_auth_refresh_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            a=Path(temp)/'auth.json';b=Path(temp)/'refreshed.json'
            original=b'{"test":"old"}';a.write_bytes(original);b.write_bytes(b'{"test":"new"}')
            persist_refreshed_auth(a,original,b);self.assertEqual(a.read_bytes(),b.read_bytes())
    def test_auth_refresh_does_not_clobber_concurrent_login(self):
        with tempfile.TemporaryDirectory() as temp:
            a=Path(temp)/'auth.json';b=Path(temp)/'refreshed.json'
            a.write_bytes(b'{"test":"other_login"}');b.write_bytes(b'{"test":"new"}')
            self.assertRaises(RunError,persist_refreshed_auth,a,b'{"test":"old"}',b)
            self.assertEqual(a.read_bytes(),b'{"test":"other_login"}')
    def test_manual_dry_run_no_cli_no_db(self):
        with tempfile.TemporaryDirectory() as temp:
            cfg=Path(temp)/'config.json';cfg.write_text(json.dumps({'stateDirectory':temp}))
            with patch('run.execute_search',side_effect=AssertionError('CLI must not run')),patch('run.send_batch',side_effect=AssertionError('DB must not run')):
                self.assertEqual(main(['--config',str(cfg),'--input',str(ROOT/'examples/sample.json'),'--month','2026-10','--dry-run']),0)
            batch=json.loads(next((Path(temp)/'runs').glob('*/batch.json')).read_text());self.assertEqual(batch['executionMode'],'MANUAL_IMPORT');self.assertFalse(batch['webSearchObserved'])

if __name__=='__main__': unittest.main(verbosity=2)
