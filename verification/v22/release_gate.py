#!/usr/bin/env python3
"""v22 fail-closed gate; inherits full build/SQL/browser and fresh-report checks from v21."""
from pathlib import Path
import importlib.util, json, subprocess, sys, time
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'verification/v22/results/release-gate.json'
def state(value, **extra):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'state': value, 'productionApproval': False,
        'attemptedAt': time.time(), **extra}, ensure_ascii=False, indent=2))
def main():
    state('NOT_READY', reason='Current attempt not complete')
    # Point inherited output to this attempt. Its fresh isolated DB report and
    # current v21 SQL regression remain mandatory; old passing logs are insufficient.
    spec = importlib.util.spec_from_file_location('gate_v22_parent', ROOT / 'verification/v21/release_gate.py')
    parent = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(parent)
    parent.OUT = OUT
    def inherited_state(value, **extra):
        # A killed process must not leave an inherited success marker before the
        # new release's checks have passed. Only THIS wrapper writes final success.
        if value == 'AUTOMATED_CHECKS_PASSED':
            state('NOT_READY', reason='Inherited checks completed; v22 checks pending',
                  inheritedRemaining=extra.get('remaining', []))
        else:
            state(value, **extra)
    parent.state = inherited_state
    try:
        parent.main()
        # Do not label the overall gate passed until NEW v22 checks finish too.
        state('NOT_READY', reason='Inherited full checks passed; v22 checks pending')
        subprocess.run([sys.executable, 'verification/run_checks.py'], cwd=ROOT, check=True)
        state('AUTOMATED_CHECKS_PASSED', remaining=[
            'real guest lookup close/reopen and current public-memory editor UI',
            'actual mobile/hosting/OAuth/image CORS/rights acceptance',
            'actual event collection and load/backup tests'])
        return 0
    except Exception as error:
        state('NOT_READY', reason=str(error) if isinstance(error, ValueError) else type(error).__name__)
        print('NOT READY:', str(error) if isinstance(error, ValueError) else type(error).__name__)
        return 2
if __name__ == '__main__':
    sys.exit(main())
