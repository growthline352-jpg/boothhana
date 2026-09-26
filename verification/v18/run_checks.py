#!/usr/bin/env python3
"""Local independent tests, NOT real deployment, browser, PostgreSQL or live research."""
from pathlib import Path
import subprocess,sys,ast
ROOT=Path(__file__).resolve().parents[2]
def run(*cmd):
 print('RUN',' '.join(map(str,cmd)),flush=True);subprocess.run(list(map(str,cmd)),cwd=ROOT,check=True)
def main():
 run(sys.executable,'verification/v17/run_checks.py')
 run(sys.executable,'-m','unittest','discover','-s','verification/v18','-p','test_*.py','-v')
 run('node','--test','verification/v18/test_offline.mjs')
 run(sys.executable,'verification/v18/check_java.py')
 run(sys.executable,'verification/v7/run_banner_smoke.py')
 run('node','verification/v15/check_types.cjs')
 run('node','verification/v4/check_ts.cjs')
 for f in (ROOT/'verification/v18').glob('*.py'):ast.parse(f.read_text(),filename=str(f))
 for f in (ROOT/'frontend/public/offline').glob('*.mjs'):run('node','--check',f)
 run('node','--check','frontend/public/offline/sw.js')
 print('PASS v18 independent checks. Real browser/SQL/build/external services remain separately gated.')
if __name__=='__main__':main()
