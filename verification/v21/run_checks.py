#!/usr/bin/env python3
"""v21 actual module/service regression checks with explicit external test doubles."""
from pathlib import Path
import subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
def main():
 commands=[
  [sys.executable,'verification/v20/run_checks.py'],
  ['node','verification/v13/test_submission.cjs'],
  ['node','verification/v14/trade_ui.cjs'],
  ['node','--test','verification/v21/test_public_cache.cjs','verification/v21/test_attempt_storage.cjs'],
  [sys.executable,'verification/v21/check_java.py'],
 ]
 for command in commands:
  print('RUN',' '.join(command),flush=True);subprocess.run(command,cwd=ROOT,check=True)
 print('PASS v21 independent checks. Real dependencies, browser, SQL and production acceptance remain separately gated.')
if __name__=='__main__':main()
