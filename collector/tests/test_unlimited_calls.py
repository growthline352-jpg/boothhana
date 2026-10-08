import json,tempfile,time,unittest
from pathlib import Path
from run import RunError,config
from weekly import load_config,Pipeline,CliBudgetExceeded,TimeBudgetExceeded
from floorplans import FloorplanBatch

class UnlimitedCallTests(unittest.TestCase):
    def test_zero_accepts_unlimited_but_invalid_values_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'config.json'
            for key in ('maxCliCalls','floorplanMaxCliCalls','dailyDiscoveryCliCalls'):
                path.write_text(json.dumps({key:0}))
                self.assertEqual(0,load_config(path)[key])
                for invalid in (-1,True,1.5):
                    path.write_text(json.dumps({key:invalid}))
                    with self.assertRaises(RunError):load_config(path)
        self.assertEqual('gpt-6.1-sol',config(None)['model'])

    def test_unlimited_calls_keep_timeouts_and_cli_blocking(self):
        pipeline=Pipeline.__new__(Pipeline)
        pipeline.cfg=load_config(None);pipeline.cfg['maxCliCalls']=0
        pipeline.calls=100000;pipeline.started=time.monotonic();pipeline.cli_blocked_reason=None
        pipeline.check_budget(cli=True)
        pipeline.cfg['maxCliCalls']=3
        with self.assertRaises(CliBudgetExceeded):pipeline.check_budget(cli=True)
        pipeline.cfg['maxCliCalls']=0;pipeline.cli_blocked_reason='authentication required'
        with self.assertRaises(CliBudgetExceeded):pipeline.check_budget(cli=True)
        pipeline.cli_blocked_reason=None;pipeline.started-=pipeline.cfg['maxRuntimeMinutes']*60+1
        with self.assertRaises(TimeBudgetExceeded):pipeline.check_budget(cli=True)

    def test_floorplan_unlimited_calls_keep_timeout(self):
        batch=FloorplanBatch.__new__(FloorplanBatch)
        batch.cfg=load_config(None);batch.cfg['floorplanMaxCliCalls']=0
        batch.calls=100000;batch.started=time.monotonic();batch.cli_blocked_reason=None
        batch.budget(cli=True)
        batch.cfg['floorplanMaxCliCalls']=3
        with self.assertRaises(RunError):batch.budget(cli=True)
        batch.cfg['floorplanMaxCliCalls']=0;batch.started-=batch.cfg['floorplanMaxMinutes']*60+1
        with self.assertRaises(RunError):batch.budget(cli=True)
