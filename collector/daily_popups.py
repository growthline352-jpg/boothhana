#!/usr/bin/env python3
"""Regional discovery and official popup reconciliation with persistent coverage."""
import argparse,json,time,sys
from pathlib import Path
from datetime import datetime,timedelta
from weekly import Pipeline,load_config,BudgetExceeded
from run import SEOUL,run_lock,write_json,RunError
from lotte_popup_sources import collect as collect_lotte
from import_manual_events import build_batch
from popup_inventory import OfficialInventory
from regional_discovery import run_regional_jobs

def research_due(run,limit,*,popup_only=True):
 due=run.event_queue.due(run.scope,max(1,len(run.event_queue.candidates)),run.cfg['eventNameMaxAttempts'])
 targets=[r for r in due if not popup_only or 'POPUP_DAILY' in r.get('origins',[])][:limit]
 attempted=0
 for item in targets:
  try:
   run.research_event_name(item);attempted+=1
  except BudgetExceeded as exc:
   run.issue('candidate-budget',exc);break
  except Exception as exc:
   attempted+=1;run.issue('candidate-'+item['key'][:16],exc)
 run.stats['eventNameJobs']=attempted;run.stats['eventNameOutcomes']=run.event_queue.summary(run.scope)
 return {'selected':len(targets),'attempted':attempted,'deferred':len(targets)-attempted}

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
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path);p.add_argument('--dry-run',action='store_true')
 modes=p.add_mutually_exclusive_group();modes.add_argument('--official-only',action='store_true');modes.add_argument('--regional-only',action='store_true');args=p.parse_args(argv)
 cfg=load_config(args.config);cfg.update(maxPopupDiscoveryJobs=6 if args.regional_only else 2,
   maxCliCalls=min((n for n in (cfg['maxCliCalls'],cfg['dailyDiscoveryCliCalls']) if n>0),default=0),maxRuntimeMinutes=min(cfg['maxRuntimeMinutes'],cfg['dailyDiscoveryMaxMinutes']))
 now=datetime.now(SEOUL);scope={'region':'SEOUL_GYEONGGI','timezone':'Asia/Seoul','startDate':now.date().isoformat(),'endDate':(now.date()+timedelta(days=60)).isoformat()}
 mode='regional-discovery' if args.regional_only else 'official-popups' if args.official_only else 'daily-popups'
 state=Path(cfg['stateDirectory']).expanduser().resolve();folder=state/mode/now.strftime('%Y%m%d-%H%M%S');began=time.monotonic()
 with run_lock(state):
  run=Pipeline(cfg,folder,scope,args.dry_run)
  if run.api:run.request('POST','/pipelines',{k:run.meta[k] for k in ('runId','weekKey','scope')})
  jobs=[];source_attempted=0;official_report={};regional_report={};research_report={}
  try:
   if not args.regional_only:
    try:
     official_report=OfficialInventory(run,max_branches=cfg['popupOfficialMaxBranches'],max_pages=cfg['popupOfficialMaxPages'],
       max_details=cfg['popupOfficialMaxDetails'],max_seconds=cfg['popupOfficialMaxMinutes']*60).collect()
     if official_report['unfinishedBranches'] or official_report['issues']:run.issue('official-inventory',RunError('Unfinished official branches retained; see official-popups/coverage-report.json'))
    except Exception as exc:run.issue('official-inventory',exc)
   if not args.official_only:
    if args.regional_only:
     regional_report=run_regional_jobs(run,cfg['dailyDiscoveryMaxJobs'])
     if regional_report['incomplete']:run.issue('regional-coverage',RunError('Some searched regions remain partial; source coverage retained'))
    jobs=select_source_jobs(run.discovery_work_queue,cfg['maxPopupDiscoveryJobs'])
    for item in jobs:
     try:run.discovery_work_item(item);source_attempted+=1
     except BudgetExceeded as exc:
      run.issue('source-budget',exc);break
     except Exception as exc:
      source_attempted+=1;run.issue('source-'+item['key'][:16],exc)
    if any(item.get('state') not in ('COMPLETE','NO_RESULTS') for item in jobs[:source_attempted]):run.issue('source-coverage',RunError('Some popup source searches remain partial'))
    research_report=research_due(run,cfg['dailyResearchMaxJobs'],popup_only=not args.regional_only)
   if run.api and official_report.get('counts',{}).get('staged'):run.request('POST',f'/pipelines/{run.id}/event-assets',{})
  except Exception as exc:run.issue('popup-pilot',exc)
  finally:
   freshness=run.discovery_work_queue.freshness()
   summary={'counts':{**run.stats,'cliCalls':run.calls,'sourceJobs':source_attempted,'deferredSourceJobs':len(jobs)-source_attempted,'officialInventory':official_report.get('counts',{}),
     'unfinishedOfficialBranches':official_report.get('unfinishedBranches',0),'overdueOfficialBranches':official_report.get('overdueBranches',0),
     'elapsedSeconds':round(time.monotonic()-began)},'issues':run.issues[:30],
     'mode':mode,'regionalDiscovery':regional_report,'candidateResearch':research_report,
     'overdueSourceJobs':sum(r['overdue'] for r in freshness),'schedule':'Region discovery + official branch inventory; publication requires review',
     'receipts':{key:{field:value.get(field) for field in ('status','inserted','changed','unchanged','rejected')} for key,value in run.receipts.items()}}
   if run.cli_blocked_reason:summary['cliBlockedReason']=run.cli_blocked_reason
   write_json(folder/'summary.json',summary)
   if run.api:run.request('POST',f'/pipelines/{run.id}/finish',{'state':'PARTIAL' if run.issues else 'SUCCESS','summary':summary})
   print(json.dumps(summary,ensure_ascii=False))
 return 2 if run.issues else 0
if __name__=='__main__':
 try:sys.exit(main())
 except Exception as exc:print(type(exc).__name__+': '+str(exc)[:200]);sys.exit(1)
