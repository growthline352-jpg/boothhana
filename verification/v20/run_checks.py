#!/usr/bin/env python3
"""v20: actual module regressions with explicit mocks, not production approval."""
from pathlib import Path
import subprocess, sys
ROOT = Path(__file__).resolve().parents[2]
def main():
    commands = [
        [sys.executable, 'verification/v19/run_checks.py'],
        ['node', 'verification/v4/test_api_client.cjs'],
        ['node', '--test', 'verification/v20/test_api_lifecycle.cjs',
         'verification/v20/test_storage_open.mjs', 'verification/v20/test_identity_scope.cjs'],
    ]
    for command in commands:
        print('RUN', ' '.join(command), flush=True)
        subprocess.run(command, cwd=ROOT, check=True)
    print('PASS v20 independent checks. Framework builds, real browser, DB and devices remain separately gated.')
if __name__ == '__main__': main()
