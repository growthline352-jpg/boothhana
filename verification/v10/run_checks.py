#!/usr/bin/env python3
"""Additional v10 design contracts. No actual service/API/DB/Codex is invoked."""
import subprocess
from pathlib import Path
R=Path(__file__).resolve().parents[2]
for script in ['test_design.cjs','check_types.cjs']:
    subprocess.run(['node',str(R/'verification/v10'/script)],cwd=R,check=True)
print('v10 isolated visual contracts passed; production build and real integration remain separate.')
