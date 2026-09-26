#!/usr/bin/env python3
"""New collection checks on actual source with clearly identified fake boundaries. No production access."""
from pathlib import Path
import subprocess,sys,tempfile,ast
ROOT=Path(__file__).resolve().parents[2]
def run(*args):
 print('RUN',' '.join(map(str,args)),flush=True);subprocess.run(list(map(str,args)),cwd=ROOT,check=True)
def main():
 run(sys.executable,'verification/v15/check_java.py')
 for name in ['test_memory.cjs','test_ui.cjs','check_types.cjs']:run('node','verification/v15/'+name)
 run(sys.executable,'-m','unittest','discover','-s','verification/v15','-p','test_gate.py','-v')
 run('node','verification/v4/check_ts.cjs')
 with tempfile.TemporaryDirectory(prefix='v15-parse-') as temp:
  run('javac','-d',temp,'verification/v4/JavaSyntaxCheck.java')
  run('java','-cp',temp,'JavaSyntaxCheck',*sorted((ROOT/'backend/src').rglob('*.java')))
 for p in (ROOT/'verification/v15').glob('*.py'):ast.parse(p.read_text(),filename=str(p))
 print('v15 independent checks passed; real Spring/Postgres/React/CI and external services still require release acceptance.')
if __name__=='__main__':main()
