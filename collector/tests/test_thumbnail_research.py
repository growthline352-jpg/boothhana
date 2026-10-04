import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run import CliUnavailable
from thumbnail_research import ThumbnailResearch
from weekly import load_config

PAGE = 'https://organizer.example/2026/poster'
IMAGE = 'https://cdn.example/2026.png'

def target(id=7):
    return dict(id=id, event=dict(name='2026 테스트 행사', organizer='주최자', edition='제3회',
                venueName='행사장', occurrences=[dict(startDate='2026-10-10', endDate='2026-10-11')],
                sources=[], discoveryLinks=[]))

def result():
    return dict(eventId=7, eventName='2026 테스트 행사', searchStatus='FOUND',
                queries=['2026 테스트 행사 포스터'], summary='이번 회차 공식 안내',
                sources=[dict(url=PAGE, kind='OFFICIAL', evidence='공식 주최자 행사 소개', imageUrls=[IMAGE])])

class ThumbnailResearchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cfg = dict(blockedSourceHosts=[], timeoutSeconds=900, thumbnailSearchTimeoutSeconds=180,
                        apiBaseUrl='https://private-api.example', tokenEnv='PRIVATE_TOKEN',
                        unrelatedSecret='never-send-this')

    def executor(self, value=None, observed=True, opened=True):
        value = value if value is not None else result()
        def execute(cfg, folder, prompt, schema):
            self.assertNotIn('never-send-this', prompt)
            self.assertNotIn('private-api.example', prompt)
            self.assertIn('2026-10-10', prompt)
            self.assertLessEqual(cfg['timeoutSeconds'], 180)
            self.assertEqual(schema.name, 'event-thumbnail.schema.json')
            if opened:
                event = dict(type='item.completed', item=dict(type='web_search', action=dict(type='open', url=PAGE)))
                (folder / 'codex.jsonl').write_text(json.dumps(event) + '\n', encoding='utf-8')
            return json.dumps(value, ensure_ascii=False).encode(), observed, {}
        return Mock(side_effect=execute)

    def test_each_event_has_separate_search_and_audited_result(self):
        executor = self.executor()
        job = ThumbnailResearch(self.cfg, self.root, 3, executor)
        value = job.search(target(), [], 100)
        self.assertEqual(value['state'], 'RESEARCH_FOUND')
        self.assertEqual(value['sources'][0]['imageUrls'], [IMAGE])
        self.assertTrue((self.root / '7' / '1' / 'validated-result.json').is_file())
        self.assertEqual(job.calls, 1)
        self.assertEqual(executor.call_args.args[0]['timeoutSeconds'], 100)

    def test_wrong_event_and_unopened_or_unsearched_sources_are_failures(self):
        wrong = {**result(), 'eventId': 8}
        for index,executor in enumerate((self.executor(wrong), self.executor(observed=False), self.executor(opened=False))):
            with self.subTest(executor=executor):
                job = ThumbnailResearch(self.cfg, self.root / str(index), 3, executor)
                self.assertEqual(job.search(target(), [], 100)['state'], 'RESEARCH_FAILED')

    def test_no_result_does_not_mean_search_error_or_inaccessible(self):
        for status, expected in [('NO_RESULT', 'NO_RESULT'), ('INACCESSIBLE', 'INACCESSIBLE'), ('FAILED', 'RESEARCH_FAILED')]:
            value = {**result(), 'searchStatus': status, 'sources': []}
            job = ThumbnailResearch(self.cfg, self.root, 3, self.executor(value))
            self.assertEqual(job.search(target(), [], 100)['state'], expected)

    def test_budget_defers_next_event_and_never_runs_unbounded_calls(self):
        executor = self.executor()
        job = ThumbnailResearch(self.cfg, self.root, 1, executor)
        self.assertEqual(job.search(target(), [], 29)['state'], 'RESEARCH_DEFERRED')
        self.assertEqual(job.calls, 0)
        self.assertEqual(job.search(target(), [], 100)['state'], 'RESEARCH_FOUND')
        self.assertEqual(job.search(target(8), [], 100)['state'], 'RESEARCH_DEFERRED')
        executor.assert_called_once()

    def test_auth_or_quota_block_stops_repeated_provider_calls(self):
        for reason in ('AUTH_REQUIRED', 'USAGE_LIMIT', 'INVALID_SCHEMA'):
            executor = Mock(side_effect=CliUnavailable(reason))
            job = ThumbnailResearch(self.cfg, self.root, 30, executor)
            self.assertEqual(job.search(target(), [], 100)['reason'], reason)
            self.assertEqual(job.search(target(8), [], 100)['state'], 'RESEARCH_BLOCKED')
            executor.assert_called_once()

    def test_blocked_or_private_source_url_never_leaves_search_validation(self):
        self.cfg['blockedSourceHosts'] = ['organizer.example']
        job = ThumbnailResearch(self.cfg, self.root, 3, self.executor())
        self.assertEqual(job.search(target(), [], 100)['state'], 'RESEARCH_FAILED')
        value = result()
        value['sources'][0]['url'] = 'https://127.0.0.1/private'
        job = ThumbnailResearch(self.cfg, self.root, 3, self.executor(value))
        self.assertEqual(job.search(target(), [], 100)['state'], 'RESEARCH_FAILED')

    def test_disabled_research_never_launches_cli(self):
        executor = Mock(side_effect=AssertionError('disabled'))
        job = ThumbnailResearch(self.cfg, self.root, 0, executor)
        self.assertEqual(job.search(target(), [], 100)['state'], 'DISABLED')
        executor.assert_not_called()

    def test_config_defaults_and_limits_allow_an_independent_thumbnail_budget(self):
        cfg = load_config(None)
        self.assertEqual(cfg['maxThumbnailSearches'], 30)
        self.assertEqual(cfg['thumbnailSearchTimeoutSeconds'], 180)
        path = self.root / 'config.json'
        for changes in ({'maxThumbnailSearches': -1}, {'maxThumbnailSearches': True},
                        {'maxThumbnailSearches': 101}, {'thumbnailSearchTimeoutSeconds': 601}):
            path.write_text(json.dumps(changes), encoding='utf-8')
            with self.assertRaises(Exception): load_config(path)

if __name__ == '__main__':
    unittest.main()
