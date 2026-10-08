import json,tempfile,unittest,os
from pathlib import Path
from unittest.mock import patch
from run import write_json

class CheckpointWriteTests(unittest.TestCase):
    @unittest.skipUnless(os.name=='nt','Windows replacement sharing violation')
    def test_transient_destination_lock_retries_without_losing_checkpoint(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'progress.json';write_json(path,{'version':1});replace=os.replace;calls=[]
            def transient(source,target):
                calls.append(target)
                if len(calls)==1:
                    self.assertEqual(1,json.loads(path.read_text())['version'])
                    raise PermissionError('Temporary indexer lock')
                replace(source,target)
            with patch('run.os.replace',side_effect=transient),patch('run.time.sleep') as sleep:
                write_json(path,{'version':2})
            self.assertEqual(2,len(calls));sleep.assert_called_once();self.assertEqual(2,json.loads(path.read_text())['version'])
