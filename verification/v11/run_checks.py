"""v11 independent verification; no live DB, Codex, R2 or actual React service."""
from pathlib import Path
import subprocess,sys
R=Path(__file__).resolve().parents[2]
for command in ([sys.executable,'verification/v11/check_java.py'],[sys.executable,'verification/v11/check_handler.py'],['node','verification/v11/test_ui.cjs'],['node','verification/v11/check_types.cjs']):
    print('RUN',*command,flush=True);subprocess.run(command,cwd=R,check=True)
print('PASS v11 offline checks. PostgreSQL/JUnit/real framework/browser service tests remain separate.')
