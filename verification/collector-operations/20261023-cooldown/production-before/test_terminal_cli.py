"""Terminal CLI failures must preserve work and stop repeated provider calls."""
from copy import deepcopy
from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import jsonschema
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import run
import weekly
import floorplans
import recheck
import daily_popups
from test_review_v5 import MemoryServer, SCOPE


class TerminalCliTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.cfg = weekly.load_config(None)
        self.cfg.update(stateDirectory=str(self.root / 'state'), maxEventEnrichments=0,
                        maxFestivalDiscoveryJobs=0, maxSubcultureDiscoveryJobs=0,
                        maxPopupDiscoveryJobs=0)
        self.env = patch.dict(os.environ, {'BOOTH_COLLECTOR_TOKEN': 'test-' * 8})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_cli_schema_removes_unsupported_unique_items_without_weakening_ingestion(self):
        def contains(node):
            if isinstance(node, dict):
                return 'uniqueItems' in node or any(contains(v) for v in node.values())
            return isinstance(node, list) and any(contains(v) for v in node)
        for name in ['event-result-v4.schema.json', 'search-result.schema.json', 'floorplan-discovery.schema.json']:
            schema = json.loads((run.ROOT / 'schemas' / name).read_text(encoding='utf-8'))
            before = deepcopy(schema)
            with self.subTest(name=name):
                self.assertFalse(contains(run.output_schema_for_cli(schema)))
                self.assertEqual(schema, before)
                self.assertTrue(contains(schema))
        original = {'type': 'array', 'items': {'type': 'string'}, 'uniqueItems': True}
        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate(['SEOUL', 'SEOUL'], original)

    def failed_search(self, event):
        folder = self.root / 'cli'
        folder.mkdir(exist_ok=True)
        def process(*args, **kwargs):
            kwargs['stdout'].write((json.dumps(event) + '\n').encode())
            return type('FailedProcess', (), {'stdin': io.BytesIO(), 'returncode': 1,
                                              'poll': lambda self: 1})()
        with patch.dict(os.environ, {'CODEX_API_KEY': 'test-only'}), \
                patch('run.shutil.which', return_value='fake-codex'), \
                patch('run.subprocess.Popen', side_effect=process):
            return run.execute_search({**self.cfg, 'codexHome': str(self.root / 'no-auth')}, folder, 'test')

    def test_structured_cli_failures_are_classified_without_copying_response_bodies(self):
        cases = [
            ({'type': 'error', 'message': 'HTTP 400 ' + json.dumps({'error': {'code': 'invalid_json_schema', 'message': 'sensitive upstream body'}})}, 'INVALID_SCHEMA'),
            ({'type': 'turn.failed', 'error': {'message': "You've hit your usage limit. Secret details"}}, 'USAGE_LIMIT'),
            ({'type': 'error', 'code': 'usage_limit', 'message': 'private account details'}, 'USAGE_LIMIT'),
            ({'type': 'error', 'error': {'code': 'invalid_api_key', 'message': 'secret key'}}, 'AUTH_REQUIRED'),
        ]
        for event, reason in cases:
            with self.subTest(reason=reason):
                with self.assertRaises(run.CliUnavailable) as caught:
                    self.failed_search(event)
                self.assertEqual(caught.exception.reason, reason)
                self.assertNotIn('secret', str(caught.exception).lower())
                self.assertNotIn('sensitive', str(caught.exception))

    def test_non_terminal_and_source_text_errors_are_not_classified_as_provider_block(self):
        for event in [
            {'type': 'error', 'message': 'HTTP 429 temporarily rate limited'},
            {'type': 'item.completed', 'item': {'text': "You've hit your usage limit"}},
            {'type': 'error', 'message': 'No event called usage_limit found'},
        ]:
            with self.subTest(event=event), self.assertRaises(run.RunError) as caught:
                self.failed_search(event)
            self.assertNotIsInstance(caught.exception, run.CliUnavailable)

    def test_weekly_terminal_failure_stops_research_but_stores_approved_images(self):
        server = MemoryServer()
        server.assets = [{'id': 2, 'revision': 1, 'imageUrl': 'https://example.com/a.png'}]
        pipeline = weekly.Pipeline(self.cfg, self.root / 'weekly', SCOPE)
        pipeline.api = server
        with patch.object(weekly, 'execute_search', side_effect=run.CliUnavailable('USAGE_LIMIT')) as cli, \
                patch.object(weekly, 'fetch_image', return_value=(b'png', 'image/png', '0' * 64)), \
                redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(pipeline.run(), 2)
        self.assertEqual(cli.call_count, 1)
        self.assertEqual(pipeline.stats['images'], 1)
        self.assertEqual(pipeline.meta['summary']['cliBlockedReason'], 'USAGE_LIMIT')
        with self.assertRaises(weekly.CliBudgetExceeded):
            pipeline.job('another', 'test', 'event-result-v4.schema.json')
        cached = pipeline.job_dir('cached')
        run.write_json(cached / 'validated-result.json', {'searchStatus': 'COMPLETE', 'events': []})
        run.write_json(cached / 'audit.json', {'webSearchObserved': True})
        self.assertEqual(pipeline.job('cached', 'test', 'event-result-v4.schema.json')[0]['events'], [])

    def test_candidate_block_does_not_consume_candidate_retry_budget(self):
        self.cfg['discoveryEventNames'] = ['Test event A', 'Test event B', 'Test event C']
        pipeline = weekly.Pipeline(self.cfg, self.root / 'candidates', SCOPE)
        pipeline.api = MemoryServer()
        with patch.object(weekly, 'execute_search', side_effect=run.CliUnavailable('AUTH_REQUIRED')) as cli, \
                redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(pipeline.run(only_event_names=True), 2)
        self.assertEqual(cli.call_count, 1)
        self.assertTrue(all(row['attempts'] == 0 for row in pipeline.event_queue.candidates.values()))
        self.assertEqual(len(pipeline.event_queue.due(SCOPE, 10, 6)), 3)

    def test_enrichment_block_keeps_selected_targets_due(self):
        self.cfg['maxEventEnrichments'] = 2
        pipeline = weekly.Pipeline(self.cfg, self.root / 'enrich', SCOPE)
        pipeline.heartbeat = lambda: None
        event = json.loads((run.ROOT / 'examples/v5/events.json').read_text(encoding='utf-8'))['events'][0]
        targets = [{'id': n, 'revision': 1, 'event': deepcopy(event)} for n in [11, 12]]
        with patch.object(weekly, 'collect_detail_sources', return_value=([], [])), \
                patch.object(weekly, 'execute_search', side_effect=run.CliUnavailable('USAGE_LIMIT')) as cli, \
                redirect_stdout(io.StringIO()), self.assertRaises(weekly.CliBudgetExceeded):
            pipeline.enrich_events(targets)
        self.assertEqual(cli.call_count, 1)
        self.assertEqual(pipeline.enrichment_attempts, {})
        self.assertEqual(pipeline.stats['enrichmentQueued'], 2)

    def test_floorplan_block_stops_cli_but_keeps_known_source_processing(self):
        targets = [{'eventId': n, 'event': {}, 'floorplanHints': []} for n in [1, 2, 3]]
        source = {'asset': {'id': 5, 'rightsState': 'APPROVED'}, 'canTransform': True}
        class Api:
            def request(self, method, path, *args, **kwargs):
                if '/targets?' in path: return targets
                if path.endswith('/sources'): return [source]
                return {}
        batch = floorplans.FloorplanBatch(self.cfg, self.root / 'floorplans', api=Api())
        def discover(target):
            return batch.job(batch.folder / str(target['eventId']), 'test', 'floorplan-discovery.schema.json')
        with patch.object(batch, 'discover', side_effect=discover), \
                patch.object(batch, 'process_source', return_value={'state': 'APPROVED'}) as known, \
                patch.object(floorplans, 'execute_search', side_effect=run.CliUnavailable('INVALID_SCHEMA')) as cli, \
                redirect_stdout(io.StringIO()):
            self.assertEqual(batch.run(), 2)
        self.assertEqual(cli.call_count, 1)
        self.assertEqual(known.call_count, 3)
        self.assertEqual(batch.meta['cliBlockedReason'], 'INVALID_SCHEMA')
        self.assertTrue(all(e['discovery'] == 'DEFERRED' for e in batch.events))

    def test_floorplan_provider_block_does_not_mark_permitted_image_as_failed(self):
        source = {'asset': {'id': 5, 'rightsState': 'APPROVED'}, 'canTransform': True}
        class Api:
            def __init__(self): self.paths = []
            def request(self, method, path, *args, **kwargs):
                self.paths.append(path)
                if '/targets?' in path: return [{'eventId': 1, 'event': {}}]
                if path.endswith('/sources'): return [source]
                return {}
        api = Api()
        batch = floorplans.FloorplanBatch(self.cfg, self.root / 'floorplan-image', api=api)
        with patch.object(batch, 'discover', return_value={'status': 'NOT_FOUND'}), \
                patch.object(batch, 'process_source', side_effect=run.CliUnavailable('USAGE_LIMIT')), \
                redirect_stdout(io.StringIO()):
            self.assertEqual(batch.run(), 2)
        self.assertFalse(any(path.endswith('/failure') for path in api.paths))

    def test_recheck_block_does_not_record_false_field_failure_or_consume_other_targets(self):
        event = {'sources': [{'kind': 'OFFICIAL', 'access': 'ORIGINAL', 'url': 'https://example.com/event'}]}
        targets = [{'id': n, 'revision': 1, 'event': event} for n in [1, 2, 3]]
        class Api:
            def __init__(self): self.posts = []
            def request(self, method, path, data=None, **kwargs):
                if method == 'POST': self.posts.append(path)
                if path.endswith('/recheck-workload'): return {'due': 3}
                return targets
        api = Api()
        with patch('recheck.Api', return_value=api), patch('recheck.load_config', return_value=self.cfg), \
                patch('recheck.read_sources', return_value=([{'url': 'https://example.com/event', 'text': 'official evidence'}], {}, [])) as fetched, \
                patch('recheck.execute_search', side_effect=run.CliUnavailable('USAGE_LIMIT')) as cli, \
                redirect_stdout(io.StringIO()):
            self.assertEqual(recheck.main([]), 2)
        summary = json.loads(next((self.root / 'state/daily-rechecks').glob('*/summary.json')).read_text(encoding='utf-8'))
        self.assertEqual(cli.call_count, 1)
        self.assertEqual(fetched.call_count, 1)
        self.assertEqual(api.posts, [])
        self.assertEqual(summary['extractionFailed'], 0)
        self.assertEqual(summary['remaining'], 3)
        self.assertEqual(summary['cliBlockedReason'], 'USAGE_LIMIT')

    def test_popup_block_does_not_repeat_cli_or_count_provider_failure_as_source_attempt(self):
        with patch('daily_popups.load_config', return_value=self.cfg), \
                patch('daily_popups.OfficialInventory') as official, \
                patch.object(weekly, 'execute_search', side_effect=run.CliUnavailable('USAGE_LIMIT')) as cli, \
                redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            official.return_value.collect.return_value={'unfinishedBranches':0,'issues':[],'counts':{}}
            self.assertEqual(daily_popups.main(['--dry-run']), 2)
        folder = next((self.root / 'state/daily-popups').iterdir())
        summary = json.loads((folder / 'summary.json').read_text(encoding='utf-8'))
        queue = json.loads((folder / 'discovery-work-queue-v1.json').read_text(encoding='utf-8'))
        self.assertEqual(cli.call_count, 1)
        self.assertEqual(summary['cliBlockedReason'], 'USAGE_LIMIT')
        self.assertTrue(all(row['attempts'] == 0 for row in queue['jobs'].values()))


if __name__ == '__main__':
    unittest.main()
