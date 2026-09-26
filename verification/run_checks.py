#!/usr/bin/env python3
"""Current v24 local regression entry point. Not production approval."""
from pathlib import Path
import subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
if __name__=='__main__':
 subprocess.run([sys.executable,'verification/v24/run_checks.py'],cwd=ROOT,check=True)
 subprocess.run([sys.executable,'-m','unittest','discover','-s','tests','-v'],cwd=ROOT/'collector',check=True)
