#!/usr/bin/env python3
"""Small popup discovery pilot, independent of participant/product/image budgets."""
import argparse,json,time,sys
from pathlib import Path
from datetime import datetime,timedelta
from weekly import Pipeline,load_config
from run import SEOUL,run_lock,write_json,RunError
from lotte_popup_sources import collect as collect_lotte
from import_manual_events import build_batch

def collect_lotte_popups(run):
 """Direct official inventory has its own trace and does not claim CLI web search."""
 key='lotte-worldmall-official';folder=run.job_dir(key)
 def heartbeat():
  run.check_budget();run.heartbeat();run.progress(key,'READING_OFFICIAL_SOURCE')
 result=collect_lotte(run.scope,folder,heartbeat=heartbeat)
 if result['searchStatus']!='COMPLETE':run.issue(key,RunError(result['summary']+' / '+result['sourceCoverage'][0]['notes']))
 body=build_batch(result,None,run.cfg['blockedSourceHosts'],run.scope['startDate'],run.scope['endDate'])
 run.deliver(key,body,legacy=True)
 return len(result['events'])

def select_source_jobs(queue,limit):
 """Reserve one daily slot for future openings; retain each source's retry order."""
 due=queue.due('POPUP_SOURCE',len(queue.jobs))
 future=[r for r in due if r.get('payload',{}).get('openingFocus')=='UPCOMING']
 general=[r for r in due if r.get('payload',{}).get('openingFocus')!='UPCOMING']
 if limit<2 or not future or not general:return due[:limit]
 chosen=[future[0],general[0]]
 return (chosen+[r for r in due if r['key'] not in {v['key'] for v in chosen}])[:limit]
def main(argv=None):
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path);p.add_argument('--dry-run',action='store_true');args=p.parse_args(argv)
 cfg=load_config(args.config);cfg.update(maxPopupDiscoveryJobs=2,maxCliCalls=min(cfg['maxCliCalls'],7),maxRuntimeMinutes=min(cfg['maxRuntimeMinutes'],45))
 now=datetime.now(SEOUL);scope={'region':'SEOUL_GYEONGGI','timezone':'Asia/Seoul','startDate':now.date().isoformat(),'endDate':(now.date()+timedelta(days=30)).isoformat()}
 state=Path(cfg['stateDirectory']).expanduser().resolve();folder=state/'daily-popups'/now.strftime('%Y%m%d-%H%M%S');began=time.monotonic()
 with run_lock(state):
  run=Pipeline(cfg,folder,scope,args.dry_run)
  if run.api:run.request('POST','/pipelines',{k:run.meta[k] for k in ('runId','weekKey','scope')})
  jobs=[];official_events=0
  try:
   try:official_events=collect_lotte_popups(run)
   except Exception as exc:run.issue('lotte-worldmall-official',exc)
   jobs=select_source_jobs(run.discovery_work_queue,min(2,cfg['maxPopupDiscoveryJobs']))
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
   summary={'counts':{**run.stats,'cliCalls':run.calls,'sourceJobs':len(jobs),'officialLotteEvents':official_events,'elapsedSeconds':round(time.monotonic()-began)},'issues':run.issues[:30],'schedule':'Daily popup discovery + Lotte World Mall official inventory; publication requires source review','receipts':run.receipts}
   if run.cli_blocked_reason:summary['cliBlockedReason']=run.cli_blocked_reason
   write_json(folder/'summary.json',summary)
   if run.api:run.request('POST',f'/pipelines/{run.id}/finish',{'state':'PARTIAL' if run.issues else 'SUCCESS','summary':summary})
   print(json.dumps(summary,ensure_ascii=False))
 return 2 if run.issues else 0
if __name__=='__main__':
 try:sys.exit(main())
 except Exception as exc:print(type(exc).__name__+': '+str(exc)[:200]);sys.exit(1)
