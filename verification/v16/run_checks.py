#!/usr/bin/env python3
"""Focused independent v16 checks. Does NOT run real Spring/React/PostgreSQL."""
from pathlib import Path
import ast,subprocess,sys,tempfile
ROOT=Path(__file__).resolve().parents[2]
def run(*cmd):
 print('RUN',' '.join(map(str,cmd)),flush=True);subprocess.run(list(map(str,cmd)),cwd=ROOT,check=True)
def main():
 run(sys.executable,'verification/v16/check_java.py')
 run('node','--test','verification/v16/test_state.cjs','verification/v16/test_provider.cjs')
 run('node','verification/v16/test_ui.cjs')
 for item in ['test_memory.cjs','test_ui.cjs','check_types.cjs']:run('node','verification/v15/'+item)
 run(sys.executable,'-m','unittest','discover','-s','verification/v16','-p','test_gate.py','-v')
 run('node','verification/v4/check_ts.cjs')
 with tempfile.TemporaryDirectory(prefix='v16-java-syntax-') as folder:
  run('javac','-d',folder,'verification/v4/JavaSyntaxCheck.java')
  run('java','-cp',folder,'JavaSyntaxCheck',*sorted((ROOT/'backend/src').rglob('*.java')))
 for p in (ROOT/'verification/v16').glob('*.py'):ast.parse(p.read_text(),filename=str(p))
 print('PASS v16 independent checks. Real dependencies, transactions, browser app and external services remain separate.')
if __name__=='__main__':main()
