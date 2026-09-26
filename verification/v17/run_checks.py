#!/usr/bin/env python3
"""Offline regression checks. External libraries are stubs in inherited checks, not real builds."""
from pathlib import Path
import ast, subprocess, sys
ROOT=Path(__file__).resolve().parents[2]
def run(*args):
    print('RUN', ' '.join(map(str,args)), flush=True)
    subprocess.run(list(map(str,args)), cwd=ROOT, check=True)
def main():
    run(sys.executable,'verification/v16/run_checks.py')
    run('node','--test','verification/v17/test_drafts.cjs','verification/v17/test_metadata.mjs')
    run(sys.executable,'-m','unittest','discover','-s','verification/v17','-p','test_*.py','-v')
    for path in (ROOT/'verification/v17').glob('*.py'):
        ast.parse(path.read_text(),filename=str(path))
    print('PASS v17 independent checks. Real build/DB/browser/external services require release_gate and acceptance.')
if __name__=='__main__':main()
