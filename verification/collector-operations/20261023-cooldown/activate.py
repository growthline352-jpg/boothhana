"""Activate only the collector cooldown patch; preserve all other image pins."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone

ROOT = Path('/home/bpdeploy/boothhana/shared')
OLD = 'boothhana-collector:064faba6'
NEW = 'boothhana-collector:usage-cooldown-20261023'
CONTAINER = 'boothhana-production-boothhana-graph-1'

def run(args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs)

def replace_file(path, data):
    fd, name = tempfile.mkstemp(prefix='.usage-cooldown-env-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(name, 0o600)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)

meta = json.loads(run(['docker', 'inspect', CONTAINER]))[0]
assert meta['Config']['Image'] == OLD, 'Unexpected live image; review before activating'
top = run(['docker', 'top', CONTAINER, '-eo', 'pid,args'])
assert 'codex exec' not in top, 'An AI task is still running; allow its checkpoint to finish'
changes = run(['docker', 'diff', CONTAINER]).splitlines()
assert not [line for line in changes if '/app/collector/' in line and '__pycache__' not in line and '.pyc' not in line], 'Unbaked source changes exist'
env = ROOT / '.env'
assert env.is_file() and not env.is_symlink()
before = env.read_bytes()
needle = ('BOOTHHANA_COLLECTOR_IMAGE=' + OLD).encode()
assert before.count(needle) == 1, 'Collector image pin changed'
backup = ROOT / ('.env.before-usage-cooldown-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
with backup.open('xb') as output:
    output.write(before)
os.chmod(backup, 0o600)

# Confirmed USAGE_LIMIT via account metadata. Initialize the first five-hour pause
# without making another AI request. The login volume and credentials stay intact.
code = "from usage_cooldown import start_cooldown; import json; s=start_cooldown({'codexHome':'/var/lib/boothhana-collector/codex'}); print(json.dumps({k:s[k] for k in ['reason','retryAt','remainingSeconds']}))"
initial = json.loads(run(['docker', 'run', '--rm', '--network', 'none', '--volumes-from', CONTAINER, NEW, 'python', '-c', code]))
replace_file(env, before.replace(needle, ('BOOTHHANA_COLLECTOR_IMAGE=' + NEW).encode(), 1))
try:
    subprocess.run(['docker', 'compose', 'up', '-d', '--no-deps', '--force-recreate', '--pull', 'never', 'boothhana-graph'], cwd=ROOT, check=True)
    current = json.loads(run(['docker', 'inspect', CONTAINER]))[0]
    assert current['Config']['Image'] == NEW and current['State']['Running']
except BaseException:
    replace_file(env, before)
    subprocess.run(['docker', 'compose', 'up', '-d', '--no-deps', '--force-recreate', '--pull', 'never', 'boothhana-graph'], cwd=ROOT, check=False)
    raise
config = json.loads(run(['docker', 'compose', '--profile', 'jobs', 'config', '--format', 'json'], cwd=ROOT))
result = {'activatedAt': datetime.now(timezone.utc).isoformat(), 'oldImage': OLD, 'newImage': NEW,
          'containerId': current['Id'], 'envBackup': str(backup), 'firstCooldown': initial,
          'imagePins': {name: config['services'][name]['image'] for name in ['boothhana-collector', 'boothhana-graph']},
          'scope': 'Graph worker replaced; scheduled collector jobs use same patched image. No API deployment, database, credentials, or model changes.'}
print(json.dumps(result))
