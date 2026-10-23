"""Store already approved catalog images through existing revision/hash checks.

No rights changes and no direct database writes. Kept separate from LLM calls so
an unavailable image does not lose an approved collection receipt.
"""
import argparse,json,os,threading,time,tempfile,math
from pathlib import Path
from urllib.parse import urlsplit
from catalog_transport import Api
from media_fetch import fetch_image,MediaError,ImageRateLimited

PREFIX='/api/internal/subculture/v4'
class HostBackoff:
 """One image worker's host deadlines, optionally durable across restarts."""
 def __init__(self,path=None):
  self.path=Path(path) if path else None;self.hosts={}
  if self.path and self.path.exists():
   if self.path.stat().st_size>256*1024:raise ValueError('Image host backoff checkpoint is too large')
   value=json.loads(self.path.read_text(encoding='utf-8'))
   if not isinstance(value,dict) or value.get('version')!=1 or not isinstance(value.get('hosts'),dict):raise ValueError('Invalid image host backoff checkpoint')
   for host,deadline in value['hosts'].items():
    if not isinstance(host,str) or not host or len(host)>253 or type(deadline) not in (int,float) or not math.isfinite(deadline):raise ValueError('Invalid image host deadline')
    if deadline>time.time():self.hosts[host]=deadline
 def blocked(self,host):return self.hosts.get(host,0)>time.time()
 def record(self,host,seconds):
  self.hosts={key:until for key,until in self.hosts.items() if until>time.time()}
  self.hosts[host]=max(self.hosts.get(host,0),time.time()+seconds)
  if self.path:
   self.path.parent.mkdir(parents=True,exist_ok=True)
   fd,name=tempfile.mkstemp(prefix='.image-host-backoff-',dir=self.path.parent)
   try:
    with os.fdopen(fd,'w',encoding='utf-8') as output:json.dump({'version':1,'hosts':self.hosts},output);output.flush();os.fsync(output.fileno())
    os.replace(name,self.path)
   finally:Path(name).unlink(missing_ok=True)

def store_approved(api,participant_ids=None,blocked_hosts=('witchform.com',),asset_ids=None,retry_after=None,*,host_backoff=None,after_id=None):
 if after_id is not None and (type(after_id) is not int or after_id<0 or asset_ids is not None):raise ValueError('Invalid image sweep cursor')
 result={'stored':[],'failed':[],'deferred':[]}
 query=PREFIX+'/assets?limit=200'+('' if after_id is None else '&afterId='+str(after_id))
 assets=(api.request('GET',PREFIX+'/assets/'+str(asset_id)) for asset_id in asset_ids) if asset_ids is not None else api.request('GET',query)
 host_backoff=host_backoff or HostBackoff()
 if after_id is not None:
  if not isinstance(assets,list) or len(assets)>200:raise ValueError('Invalid image sweep page')
  ids=[a.get('id') for a in assets]
  if any(type(i) is not int or i<=after_id for i in ids) or ids!=sorted(set(ids)):raise ValueError('Image sweep cursor did not advance')
  result['nextAfterId']=ids[-1] if len(ids)==200 else 0
 for asset in assets:
  if participant_ids is not None and asset.get('participantId') not in participant_ids:continue
  if asset.get('rightsState')!='APPROVED' or asset.get('storageState')=='STORED':continue
  retry_key=(asset['id'],asset['revision'])
  if retry_after is not None and retry_after.get(retry_key,0)>time.monotonic():result['deferred'].append(asset['id']);continue
  host=urlsplit(asset['imageUrl']).hostname
  if host_backoff.blocked(host):result['deferred'].append(asset['id']);continue
  try:
   # Re-read approval/revision immediately before fetching and uploading.
   asset=api.request('GET',PREFIX+'/assets/'+str(asset['id']))
   if asset.get('rightsState')!='APPROVED' or asset.get('storageState')=='STORED':continue
   retry_key=(asset['id'],asset['revision'])
   host=urlsplit(asset['imageUrl']).hostname
   if not host:raise MediaError('Image host missing')
   if host_backoff.blocked(host):result['deferred'].append(asset['id']);continue
   if any(host==entry or host.endswith('.'+entry) for entry in blocked_hosts):raise MediaError('Blocked image source')
   raw,mime,digest=fetch_image(asset['imageUrl'],[host])
   stored=api.request('POST',PREFIX+'/assets/'+str(asset['id'])+'/content',raw=raw,headers={
    'Content-Type':mime,'X-Image-Size':str(len(raw)),'X-Image-SHA256':digest,'X-Asset-Revision':str(asset['revision'])})
   if stored.get('rightsState')!='APPROVED' or stored.get('storageState')!='STORED':raise MediaError('Image storage not confirmed')
   result['stored'].append({'id':asset['id'],'participantId':asset.get('participantId'),'storedUrl':stored.get('storedUrl'),'sha256':digest})
  except Exception as exc:
   if isinstance(exc,ImageRateLimited):host_backoff.record(host,exc.retry_after)
   result['failed'].append({'id':asset['id'],'reason':type(exc).__name__+(':'+str(exc)[:150] if isinstance(exc,MediaError) else '')})
   if retry_after is not None:retry_after[retry_key]=time.monotonic()+(exc.retry_after if isinstance(exc,ImageRateLimited) else 6*3600)
   reason='CATALOG_IMAGE_STORE:'+type(exc).__name__
   if isinstance(exc,ImageRateLimited):reason+=':HTTP429:retryAfterSeconds='+str(exc.retry_after)
   try:api.request('POST',PREFIX+'/assets/'+str(asset['id'])+'/failure',{'revision':asset['revision'],'reason':reason})
   except Exception:pass
 return result

def start_background(api,blocked_hosts=('witchform.com',),state_directory=None):
 stop=threading.Event();retry_after={}
 def run():
  host_backoff=None;cursor=0
  while not stop.is_set():
   try:
    if host_backoff is None:host_backoff=HostBackoff(Path(state_directory)/'catalog-image-host-cooldowns.json' if state_directory else None)
    result=store_approved(api,blocked_hosts=blocked_hosts,retry_after=retry_after,host_backoff=host_backoff,after_id=cursor)
    cursor=result['nextAfterId']
    if result['stored'] or result['failed']:print(json.dumps({'catalogImages':{'stored':len(result['stored']),'failed':len(result['failed'])}}),flush=True)
   except Exception as exc:print('Catalog image storage deferred: '+type(exc).__name__,flush=True)
   stop.wait(30)
 thread=threading.Thread(target=run,name='approved-catalog-images',daemon=True);thread.start()
 return stop,thread

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--config',type=Path,required=True);parser.add_argument('--participant',type=int,action='append');parser.add_argument('--asset',type=int,action='append')
 args=parser.parse_args();cfg=json.loads(args.config.read_text(encoding='utf-8'))
 api=Api(cfg['apiBaseUrl'],os.environ[cfg['tokenEnv']],cfg.get('httpTimeoutSeconds',45))
 print(json.dumps(store_approved(api,set(args.participant) if args.participant else None,cfg.get('blockedSourceHosts',['witchform.com']),args.asset),ensure_ascii=False))
if __name__=='__main__':main()
