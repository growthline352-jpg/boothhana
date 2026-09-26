#!/usr/bin/env python3
"""v22 actual frontend module regressions; external boundaries remain test doubles."""
from pathlib import Path
import subprocess, sys
ROOT = Path(__file__).resolve().parents[2]
def main():
    commands = [
        [sys.executable, '-m', 'unittest', 'discover', '-s', 'verification/v22', '-p', 'test_gate.py', '-v'],
        [sys.executable, 'verification/v21/run_checks.py'],
        ['node', '--test', 'verification/v22/test_remote.cjs',
         'verification/v22/test_guest_session.cjs', 'verification/v22/test_public_views.cjs'],
    ]
    for command in commands:
        print('RUN', ' '.join(command), flush=True)
        subprocess.run(command, cwd=ROOT, check=True)
    print('PASS v22 independent checks. Real framework/DB/mobile acceptance remains separate.')
if __name__ == '__main__':
    main()
