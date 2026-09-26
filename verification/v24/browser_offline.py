#!/usr/bin/env python3
"""Existing actual offline-reader scenarios against v24; NOT new React E2E coverage."""
from pathlib import Path
import importlib.util, json, sys, time
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'verification/v24/results'
OUT.mkdir(parents=True, exist_ok=True)
if __name__ == '__main__':
    report = OUT / 'browser-offline.json'
    report.write_text(json.dumps({'state': 'NOT_READY', 'attemptedAt': time.time(),
        'passed': [], 'reason': 'Current attempt not complete', 'productionApproval': False}, indent=2))
    spec = importlib.util.spec_from_file_location('offline_browser_v24', ROOT / 'verification/v21/browser_offline.py')
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
        module.OUT = OUT
        sys.exit(module.main())
    except Exception as error:
        report.write_text(json.dumps({'state': 'NOT_READY', 'attemptedAt': time.time(),
            'passed': [], 'reason': str(error), 'productionApproval': False}, ensure_ascii=False, indent=2))
        print('NOT READY:', type(error).__name__, str(error))
        sys.exit(2)
