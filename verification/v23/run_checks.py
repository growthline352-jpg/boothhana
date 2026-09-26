#!/usr/bin/env python3
"""Current regression suite. Real framework and deployment checks are separate."""
from pathlib import Path
import subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
def main():
 for cmd in [
  [sys.executable,'verification/v22/run_checks.py'],
  ['node','--test','verification/v23/test_dialogs.cjs','verification/v23/test_public_usability.cjs','verification/v23/test_library_download.cjs'],
  [sys.executable,'-m','unittest','discover','-s','verification/v23','-p','test_gate.py','-v'],
 ]:
  print('RUN', ' '.join(cmd),flush=True)
  subprocess.run(cmd,cwd=ROOT,check=True)
 print('PASS v23 independent checks; real app/build/DB acceptance remains separate.')
if __name__=='__main__':main()
