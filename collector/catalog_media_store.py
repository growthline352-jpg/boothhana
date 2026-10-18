"""Store already approved catalog images through existing revision/hash checks.

No rights changes and no direct database writes. Kept separate from LLM calls so
an unavailable image does not lose an approved collection receipt.
"""
import argparse,json,os
from pathlib import Path
from urllib.parse import urlsplit
from catalog_transport import Api
from media_fetch import fetch_image,MediaError

PREFIX='/api/internal/subculture/v4'
def store_approved(api,participant_ids=None,blocked_hosts=('witchform.com',),asset_ids=None):
 result={'stored':[],'failed':[],'deferred':[]}
 assets=(api.request('GET',PREFIX+'/assets/'+str(asset_id)) for asset_id in asset_ids) if asset_ids is not None else api.request('GET',PREFIX+'/assets?limit=200')
 for asset in assets:
  if participant_ids is not None and asset.get('participantId') not in participant_ids:continue
  if asset.get('rightsState')!='APPROVED' or asset.get('storageState')=='STORED':continue
  try:
   # Re-read approval/revision immediately before fetching and uploading.
   asset=api.request('GET',PREFIX+'/assets/'+str(asset['id']))
   if asset.get('rightsState')!='APPROVED' or asset.get('storageState')=='STORED':continue
   host=urlsplit(asset['imageUrl']).hostname
   if not host:raise MediaError('Image host missing')
   if any(host==entry or host.endswith('.'+entry) for entry in blocked_hosts):raise MediaError('Blocked image source')
   raw,mime,digest=fetch_image(asset['imageUrl'],[host])
   stored=api.request('POST',PREFIX+'/assets/'+str(asset['id'])+'/content',raw=raw,headers={
    'Content-Type':mime,'X-Image-Size':str(len(raw)),'X-Image-SHA256':digest,'X-Asset-Revision':str(asset['revision'])})
   if stored.get('rightsState')!='APPROVED' or stored.get('storageState')!='STORED':raise MediaError('Image storage not confirmed')
   result['stored'].append({'id':asset['id'],'participantId':asset.get('participantId'),'storedUrl':stored.get('storedUrl'),'sha256':digest})
  except Exception as exc:
   result['failed'].append({'id':asset['id'],'reason':type(exc).__name__})
   try:api.request('POST',PREFIX+'/assets/'+str(asset['id'])+'/failure',{'revision':asset['revision'],'reason':'CATALOG_IMAGE_STORE:'+type(exc).__name__})
   except Exception:pass
 return result

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--config',type=Path,required=True);parser.add_argument('--participant',type=int,action='append');parser.add_argument('--asset',type=int,action='append')
 args=parser.parse_args();cfg=json.loads(args.config.read_text(encoding='utf-8'))
 api=Api(cfg['apiBaseUrl'],os.environ[cfg['tokenEnv']],cfg.get('httpTimeoutSeconds',45))
 print(json.dumps(store_approved(api,set(args.participant) if args.participant else None,cfg.get('blockedSourceHosts',['witchform.com']),args.asset),ensure_ascii=False))
if __name__=='__main__':main()
