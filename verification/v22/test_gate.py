"""Gate reporting tests only: no external process, SQL, build, or browser is executed."""
from pathlib import Path
import importlib.util
import json
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent

def load_gate():
    spec = importlib.util.spec_from_file_location('v22_gate_under_test', HERE / 'release_gate.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class GateReportingTests(unittest.TestCase):
    def run_gate(self, inherited, new_checks):
        gate = load_gate()
        with tempfile.TemporaryDirectory() as temp:
            gate.OUT = Path(temp) / 'result.json'
            gate.OUT.write_text('{"state":"AUTOMATED_CHECKS_PASSED"}')
            parent = SimpleNamespace()
            parent.main = lambda: inherited(parent, gate.OUT)
            with patch.object(gate.importlib.util, 'spec_from_file_location') as spec, \
                 patch.object(gate.importlib.util, 'module_from_spec', return_value=parent), \
                 patch.object(gate.subprocess, 'run', side_effect=lambda *a, **k: new_checks(gate.OUT)):
                spec.return_value.loader.exec_module.return_value = None
                result = gate.main()
            return result, json.loads(gate.OUT.read_text())

    def test_prior_success_is_reset_before_inherited_failure(self):
        def inherited(parent, out):
            self.assertEqual(json.loads(out.read_text())['state'], 'NOT_READY')
            raise ValueError('isolated test DB required')
        code, report = self.run_gate(inherited, lambda _: self.fail('new checks must not start'))
        self.assertEqual(code, 2)
        self.assertEqual(report['state'], 'NOT_READY')
        self.assertFalse(report['productionApproval'])

    def test_inherited_success_is_never_final_before_new_checks(self):
        def inherited(parent, out):
            parent.state('AUTOMATED_CHECKS_PASSED', remaining=['real device'])
            self.assertEqual(json.loads(out.read_text())['state'], 'NOT_READY')
        def new_checks(out):
            self.assertEqual(json.loads(out.read_text())['state'], 'NOT_READY')
            raise subprocess.CalledProcessError(1, 'v22-test')
        code, report = self.run_gate(inherited, new_checks)
        self.assertEqual(code, 2)
        self.assertEqual(report['state'], 'NOT_READY')

    def test_only_all_checks_may_mark_automated_pass_not_production(self):
        def inherited(parent, out):
            parent.state('AUTOMATED_CHECKS_PASSED')
        def new_checks(out):
            self.assertEqual(json.loads(out.read_text())['state'], 'NOT_READY')
        code, report = self.run_gate(inherited, new_checks)
        self.assertEqual(code, 0)
        self.assertEqual(report['state'], 'AUTOMATED_CHECKS_PASSED')
        self.assertFalse(report['productionApproval'])
        self.assertTrue(report['remaining'])

if __name__ == '__main__':
    unittest.main()
