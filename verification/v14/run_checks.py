#!/usr/bin/env python3
"""Focused OFFLINE v14 regression. No real DB/HTTP/OAuth/R2/CLI integration."""
from pathlib import Path
import subprocess,sys,tempfile
ROOT=Path(__file__).resolve().parents[2]
def run(*args):
 print('RUN',' '.join(map(str,args)),flush=True);subprocess.run(list(map(str,args)),cwd=ROOT,check=True)
def main():
 run(sys.executable,'verification/v14/run_java.py')
 run(sys.executable,'verification/v14/run_trade_bodies.py')
 run('node','verification/v14/trade_ui.cjs')
 run(sys.executable,'verification/v14/test_gate.py')
 run('node','verification/v13/test_submission.cjs')
 run('node','verification/v12/test_support_ui.cjs')
 run('node','verification/v12/check_types.cjs')
 run('node','verification/v4/check_ts.cjs')
 with tempfile.TemporaryDirectory(prefix='v14-syntax-') as t:
  run('javac','-encoding','UTF-8','-d',t,'verification/v4/JavaSyntaxCheck.java')
  run('java','-cp',t,'JavaSyntaxCheck',*sorted((ROOT/'backend/src').rglob('*.java')))
 print('PASS v14 focused independent checks. External dependency build and real transactions are NOT validated by this result.')
if __name__=='__main__':main()
