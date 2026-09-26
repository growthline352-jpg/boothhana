#!/usr/bin/env python3
"""v19 regressions on actual modules with declared mocks; not real browser/SQL approval."""
from pathlib import Path
import subprocess, sys
ROOT=Path(__file__).resolve().parents[2]
def main():
    commands=[
        [sys.executable,'verification/v18/run_checks.py'],
        ['node','--test','verification/v19/test_offline_regressions.mjs','verification/v19/test_reader.mjs'],
    ]
    for command in commands:
        print('RUN',' '.join(command),flush=True)
        subprocess.run(command,cwd=ROOT,check=True)
    print('PASS v19. Real dependency build/IndexedDB/browser/DB/mobile remain separately gated.')
if __name__=='__main__': main()
