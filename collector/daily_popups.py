#!/usr/bin/env python3
"""Small popup discovery pilot, independent of participant/product/image budgets."""
import argparse,json,time,sys
from pathlib import Path
from datetime import datetime,timedelta
from weekly import Pipeline,load_config
from run import SEOUL,run_lock,write_json,RunError
def main(argv=None):
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path);p.add_argument('--dry-run',action='store_true');args=p.parse_args(argv)
 cfg=load_config(args.config);cfg.update(maxPopupDiscoveryJobs=2,maxCliCalls=min(cfg['maxCliCalls'],7),maxRuntimeMinutes=min(cfg['maxRuntimeMinutes'],45))
 now=datetime.now(SEOUL);scope={'region':'SEOUL_GYEONGGI','timezone':'Asia/Seoul','startDate':now.date().isoformat(),'endDate':(now.date()+timedelta(days=30)).isoformat()}
 state=Path(cfg['stateDirectory']).expanduser().resolve();folder=state/'daily-popups'/now.strftime('%Y%m%d-%H%M%S');began=time.monotonic()
 with run_lock(state):
  run=Pipeline(cfg,folder,scope,args.dry_run)
  if run.api:run.request('POST','/pipelines',{k:run.meta[k] for k in ('runId','weekKey','scope')})
  jobs=[]
  try:
   jobs=run.discovery_work_queue.due('POPUP_SOURCE',min(2,cfg['maxPopupDiscoveryJobs']))
   names=set()
   for item in jobs:
    run.discovery_work_item(item);names.update(item.get('foundEventNames') or [])
   for item in run.event_queue.candidates.values():
    if item['name'] in names and 'POPUP_DAILY' not in item['origins']:item['origins'].append('POPUP_DAILY')
   run.event_queue.save()
   due=run.event_queue.due(scope,max(1,len(run.event_queue.candidates)),cfg['eventNameMaxAttempts'])
   for item in [r for r in due if 'POPUP_DAILY' in r.get('origins',[])][:5]:run.research_event_name(item)
  except Exception as exc:run.issue('popup-pilot',exc)
  finally:
   summary={'counts':{**run.stats,'cliCalls':run.calls,'sourceJobs':len(jobs),'elapsedSeconds':round(time.monotonic()-began)},'issues':run.issues[:30],'schedule':'Daily popup pilot; activation pending','receipts':{}}
   if run.cli_blocked_reason:summary['cliBlockedReason']=run.cli_blocked_reason
   write_json(folder/'summary.json',summary)
   if run.api:run.request('POST',f'/pipelines/{run.id}/finish',{'state':'PARTIAL' if run.issues else 'SUCCESS','summary':summary})
   print(json.dumps(summary,ensure_ascii=False))
 return 2 if run.issues else 0
if __name__=='__main__':
 try:sys.exit(main())
 except Exception as exc:print(type(exc).__name__+': '+str(exc)[:200]);sys.exit(1)
