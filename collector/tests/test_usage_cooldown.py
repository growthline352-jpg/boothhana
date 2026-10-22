import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from run import CliUnavailable, execute_search, terminal_cli_failure
from usage_cooldown import RETRY_SECONDS, active_cooldown, start_cooldown


class UsageCooldownTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.auth = self.root / 'auth'
        self.auth.mkdir()
        (self.auth / 'auth.json').write_text(json.dumps({'tokens': {'account_id': 'account-a'}}))
        self.cfg = {'codexHome': str(self.auth), 'codexExecutable': 'codex', 'model': 'gpt-6.1-sol', 'timeoutSeconds': 30}
        self.env = patch.dict('os.environ', {'CODEX_API_KEY': ''})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_five_hour_boundary_and_cross_job_restart(self):
        state = start_cooldown(self.cfg, now=1000)
        self.assertEqual(RETRY_SECONDS, 18000)
        self.assertEqual(state['retryAtUnix'], 19000)
        other_job = {**self.cfg, 'stateDirectory': str(self.root / 'another-job')}
        self.assertEqual(1, active_cooldown(other_job, now=18999)['remainingSeconds'])
        self.assertIsNone(active_cooldown(other_job, now=19000))

    def test_skipped_cron_or_second_worker_does_not_extend_the_wait(self):
        start_cooldown(self.cfg, now=1000)
        self.assertEqual(start_cooldown(self.cfg, now=4600)['retryAtUnix'], 19000)
        self.assertEqual(start_cooldown(self.cfg, now=19000)['retryAtUnix'], 37000)

    def test_login_change_does_not_inherit_another_accounts_pause(self):
        start_cooldown(self.cfg, now=1000)
        (self.auth / 'auth.json').write_text(json.dumps({'tokens': {'account_id': 'account-b'}}))
        self.assertIsNone(active_cooldown(self.cfg, now=1001))

    def test_provider_limit_stops_next_cli_spawn_but_expiry_allows_retry(self):
        class LimitedProcess:
            def __init__(self, args, **kwargs):
                kwargs['stdout'].write(json.dumps({'type': 'error', 'message': "You've hit your usage limit."}).encode() + b'\n')
                self.stdin = io.BytesIO()
                self.returncode = 1
            def poll(self):
                return self.returncode
        first = self.root / 'first'; first.mkdir()
        second = self.root / 'second'; second.mkdir()
        with patch('run.shutil.which', return_value='/bin/codex'), patch('run.subprocess.Popen', side_effect=LimitedProcess) as cli:
            with patch('usage_cooldown.time.time', return_value=1000):
                with self.assertRaises(CliUnavailable) as failure:
                    execute_search(self.cfg, first, 'test')
                self.assertEqual('USAGE_LIMIT', failure.exception.reason)
            with patch('usage_cooldown.time.time', return_value=4600):
                with self.assertRaises(CliUnavailable):
                    execute_search(self.cfg, second, 'test')
            self.assertEqual(cli.call_count, 1)
            cached = json.loads((second / 'cli-failure.json').read_text())
            self.assertTrue(cached['skipped'])
            self.assertEqual(cached['remainingSeconds'], 14400)
            with patch('usage_cooldown.time.time', return_value=19000):
                with self.assertRaises(CliUnavailable):
                    execute_search(self.cfg, second, 'test')
            self.assertEqual(cli.call_count, 2)

    def test_source_text_is_not_interpreted_as_a_provider_usage_error(self):
        log = self.root / 'source.jsonl'
        log.write_text(json.dumps({'type': 'item.completed', 'item': {'text': "You've hit your usage limit."}}))
        self.assertIsNone(terminal_cli_failure(log))
        log.write_text(json.dumps({'type': 'turn.failed', 'error': {'code': 'usage_limit_reached'}}))
        self.assertEqual('USAGE_LIMIT', terminal_cli_failure(log))

    def test_authentication_failure_does_not_start_a_usage_pause(self):
        from run import RunError
        job = self.root / 'job'; job.mkdir()
        (self.auth / 'auth.json').unlink()
        with patch('run.shutil.which', return_value='/bin/codex'), patch('run.subprocess.Popen') as cli:
            with self.assertRaises(RunError):
                execute_search(self.cfg, job, 'test')
        cli.assert_not_called()
        self.assertIsNone(active_cooldown(self.cfg))

    def test_graph_does_not_refresh_or_claim_jobs_during_a_shared_pause(self):
        from graph_worker import Worker, configuration
        from unittest.mock import Mock
        cfg = {**configuration(), **self.cfg, 'stateDirectory': str(self.root / 'graph')}
        api = Mock()
        with patch('usage_cooldown.time.time', return_value=1000):
            start_cooldown(cfg)
            Worker(cfg, api).run()
        api.request.assert_not_called()


if __name__ == '__main__':
    unittest.main()
