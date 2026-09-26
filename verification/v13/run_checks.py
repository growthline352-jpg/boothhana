#!/usr/bin/env python3
"""Offline checks only; real builds and local DB tests use release_gate.py separately."""
from pathlib import Path
import sys,subprocess,tempfile
R=Path(__file__).resolve().parents[2]
def run(*args):subprocess.run(list(map(str,args)),cwd=R,check=True)
def main():
 run(sys.executable,R/'verification/v13/run_services.py')
 run('node',R/'verification/v13/test_submission.cjs')
 run('node',R/'verification/v12/test_support_ui.cjs')
 run('node',R/'verification/v12/check_types.cjs')
 run('node',R/'verification/v4/check_ts.cjs')
 with tempfile.TemporaryDirectory(prefix='v13-syntax-') as tmp:
  run('javac','-encoding','UTF-8','-d',tmp,R/'verification/v4/JavaSyntaxCheck.java')
  run('java','-cp',tmp,'JavaSyntaxCheck',*sorted((R/'backend/src').rglob('*.java')))
 print('PASS v13 OFFLINE checks. Actual Spring/PostgreSQL/React app builds have NOT been substituted by this result.')
if __name__=='__main__':main()
