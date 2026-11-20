import subprocess,json,sys
CODE=r"""
import os,subprocess,json,selectors,time,tempfile
from pathlib import Path
from datetime import datetime,timezone
from usage_cooldown import active_cooldown
cfg=json.load(open('/etc/boothhana/graph.json'))
env=os.environ.copy();env['CODEX_HOME']=cfg.get('codexHome','/var/lib/boothhana-collector/codex')
p=subprocess.Popen(['codex','app-server','--stdio'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,env=env)
s=selectors.DefaultSelector();s.register(p.stdout,selectors.EVENT_READ)
def send(v):p.stdin.write(json.dumps(v)+'\n');p.stdin.flush()
def response(i):
 deadline=time.monotonic()+20
 while time.monotonic()<deadline:
  if not s.select(max(0,deadline-time.monotonic())):break
  line=p.stdout.readline()
  if not line:break
  try:r=json.loads(line)
  except ValueError:continue
  if r.get('id')==i:return r
 raise RuntimeError('Rate-limit status request timed out')
try:
 send({'id':1,'method':'initialize','params':{'clientInfo':{'name':'boothhana-usage-status','version':'1.0.0'}}});response(1)
 send({'method':'initialized','params':{}})
 send({'id':2,'method':'account/rateLimits/read','params':{}});r=response(2)
 limits=r.get('result',{});buckets=limits.get('rateLimitsByLimitId') or {'codex':limits.get('rateLimits')}
 out={}
 for k,b in buckets.items():
  if not b:continue
  row={n:b.get(n) for n in ['planType','rateLimitReachedType'] if n in b}
  for window in ['primary','secondary']:
   if b.get(window):row[window]={n:b[window].get(n) for n in ['usedPercent','windowDurationMins','resetsAt']}
  out[k]=row
 cooldown=active_cooldown(cfg);resumed=False
 if RESUME:
  bucket=out.get('codex') or {};windows=[bucket.get(k) for k in ['primary','secondary']]
  assert r.get('error') is None and all(w and isinstance(w.get('usedPercent'),(int,float)) and 0<=w['usedPercent']<100 for w in windows),'Available quota was not confirmed'
  if cooldown:
   path=Path(env['CODEX_HOME'])/'collector-usage-cooldown.json';old=path.read_text();value=json.loads(old)
   assert value['accountKey']==cooldown['accountKey'] and value['retryAtUnix']==cooldown['retryAtUnix']
   backup=path.with_name('collector-usage-cooldown.before-confirmed-resume-'+str(int(time.time()))+'.json');fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
   with os.fdopen(fd,'w') as f:f.write(old)
   stamp=time.time();value.update(retryAtUnix=stamp,retryAt=datetime.fromtimestamp(stamp,timezone.utc).isoformat(),resumeReason='VERIFIED_QUOTA_AVAILABLE')
   fd,name=tempfile.mkstemp(prefix='.collector-verified-resume-',dir=path.parent)
   with os.fdopen(fd,'w') as f:json.dump(value,f);f.flush();os.fsync(f.fileno())
   assert path.read_text()==old,'Cooldown changed while checking quota'
   os.replace(name,path);assert active_cooldown(cfg) is None;resumed=True
 safeCooldown={k:cooldown[k] for k in ['reason','retryAt','remainingSeconds']} if cooldown else None
 print(json.dumps({'buckets':out,'error':r.get('error'),'previousCooldown':safeCooldown,'resumed':resumed,'cooldownActive':active_cooldown(cfg) is not None,'madeAiRequests':False}))
finally:p.terminate();p.wait(timeout=5)
"""
r=subprocess.run(['docker','exec','-i','boothhana-production-boothhana-graph-1','python','-'],input=CODE.replace('RESUME',str('--resume' in sys.argv)),text=True,capture_output=True,timeout=50)
if r.returncode:raise RuntimeError('Collector usage read failed: '+r.stderr[-800:])
print(r.stdout.strip())
