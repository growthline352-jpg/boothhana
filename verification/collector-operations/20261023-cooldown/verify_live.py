"""Read the deployed image and cooldown from a fresh scheduled-job container."""
import json
import subprocess

root = '/home/bpdeploy/boothhana/shared'
name = 'boothhana-production-boothhana-graph-1'
meta = json.loads(subprocess.check_output(['docker', 'inspect', name], text=True))[0]
assert meta['State']['Running']
assert meta['Config']['Image'] == 'boothhana-collector:usage-cooldown-20261023'
code = "from usage_cooldown import active_cooldown; import json; s=active_cooldown({}); assert s; print(json.dumps({k:s[k] for k in ['reason','retryAt','remainingSeconds']}))"
check = subprocess.check_output(['docker', 'compose', 'run', '--rm', '--no-deps', '-T', 'boothhana-collector', 'python', '-c', code], cwd=root, text=True)
state = json.loads(check)
assert 0 < state['remainingSeconds'] <= 18000
logs = subprocess.check_output(['docker', 'logs', '--tail', '6', name], text=True)
assert state['retryAt'] in logs
print(json.dumps({'image': meta['Config']['Image'], 'running': True,
                  'startedAt': meta['State']['StartedAt'], 'sharedCooldown': state,
                  'freshScheduledContainerSharesDaemonDeadline': True,
                  'graphLog': logs.strip(), 'verificationMadeNoAIRequests': True}))
