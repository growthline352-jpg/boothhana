#!/usr/bin/env python3
"""Local source-contract and regression checks; not release approval."""
from pathlib import Path
import subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
def main():
 for cmd in [
  [sys.executable,'verification/v23/run_checks.py'],
  ['node','--test','verification/v24/test_api_contracts.cjs','verification/v24/test_write_dtos.cjs','verification/v24/test_offline_hash.mjs','verification/v24/test_frontend_contracts.cjs'],
  [sys.executable,'-m','unittest','discover','-s','verification/v24','-p','test_*.py','-v'],
  [sys.executable,'verification/v24/check_java.py'],
  [sys.executable,'verification/v24/audit_contracts.py'],
 ]:
  print('RUN',' '.join(cmd),flush=True);subprocess.run(cmd,cwd=ROOT,check=True)
 print('PASS v24 local contracts. Real build/HTTP/PostgreSQL/mobile release gate is separate.')
if __name__=='__main__':main()
