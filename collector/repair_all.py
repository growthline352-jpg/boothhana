#!/usr/bin/env python3
"""One finite pass: existing intake approvals, all due information, all due images.

No event-count/time cap in scheduled mode. Individual network/CLI calls retain
timeouts. Provider auth/usage failures leave work deferred, never exhausted.
"""
from __future__ import annotations
import argparse
import json
import os
import uuid
from collections import Counter
from datetime import datetime,timedelta
from pathlib import Path
from catalog_transport import Api
from data_quality import select_targets
from image_repair import Repair
from run import SEOUL,RunError,run_lock,write_json
from weekly import Pipeline,load_config,BudgetExceeded

PATH='/api/internal/subculture/v4'


def approve_existing(api,enabled):
    count=0;after=0;failed=[]
    if not enabled:return dict(approved=0,failed=[])
    while True:
        page=api.request('GET',f'{PATH}/auto-approval-events?limit=200&afterId={after}')
        if not isinstance(page,list) or len(page)>200 or any(type(i) is not int or i<=after for i in page) or page!=sorted(set(page)):
            raise RunError('Non-advancing automatic approval cursor')
        for event_id in page:
            try:
                api.request('POST',f'{PATH}/events/{event_id}/auto-approve',{})
                count+=1
            except Exception as error:
                failed.append(dict(eventId=event_id,error=type(error).__name__))
        if len(page)<200:break
        after=page[-1]
    return dict(approved=count,failed=failed)


def run(cfg, *, apply=False,force=False):
    state=Path(cfg['stateDirectory']).expanduser().resolve()
    api=Api(cfg['apiBaseUrl'],os.getenv(cfg['tokenEnv'],''),cfg['httpTimeoutSeconds'])
    with run_lock(state):
        folder=state/'repair-all-v1'/uuid.uuid4().hex
        folder.mkdir(parents=True,exist_ok=True)
        if not apply:
            # Read-only mode performs image/source research without intake writes.
            job=Repair(cfg,api,state/'image-repair-v1',force=force,max_minutes=0,drain=True)
            report=job.run_batch()
            write_json(folder/'report.json',dict(mode='READ_ONLY',images=report,productionWrites=0))
            return 0 if report['dueDeferred']==0 and all(r['state'] in ('VERIFIED','EXHAUSTED') for r in report['events']) else 2
        approvals=approve_existing(api,cfg.get('autoApproveCollectedData',True))
        today=datetime.now(SEOUL).date()
        scope=dict(region='SEOUL_GYEONGGI',timezone='Asia/Seoul',startDate=today.isoformat(),endDate=(today+timedelta(days=365)).isoformat())
        pipeline=Pipeline(cfg,folder/'information',scope)
        pipeline.drain=True
        pipeline.request('POST','/pipelines',{k:pipeline.meta[k] for k in ('runId','weekKey','scope')})
        errors=[];targets=[]
        try:
            targets=pipeline.enrichment_backlog()
            by_id={t['id']:t for t in targets};after=0
            while True:
                checks=api.request('GET',f'{PATH}/recheck-events?limit=100&afterId={after}')
                ids=[t['id'] for t in checks]
                if len(checks)>100 or ids!=sorted(set(ids)) or any(i<=after for i in ids):raise RunError('Non-advancing source check cursor')
                for check in checks:
                    if check.get('status') in ('ACCESS_FAILED','EXTRACTION_FAILED'):
                        target=by_id.setdefault(check['id'],check)
                        target['repairSourceFailure']=True
                if len(checks)<100:break
                after=ids[-1]
            targets=list(by_id.values())
            if force:
                for target in targets:pipeline.enrichment_attempts.pop(str(target['id']),None)
            pipeline.enrich_events(targets)
            pipeline.request('POST',f'/pipelines/{pipeline.id}/event-assets',{})
        except BudgetExceeded as error:errors.append(dict(stage='information',error=type(error).__name__))
        except Exception as error:errors.append(dict(stage='information',error=type(error).__name__))
        counts=Counter((pipeline.enrichment_attempts.get(str(t['id'])) or {}).get('resolution','NOT_ATTEMPTED') for t in targets)
        remaining=len(select_targets(targets,pipeline.enrichment_attempts,len(targets),cfg['priorityEventKeywords']))
        info=dict(inspected=len(targets),remaining=remaining,counts=dict(counts),cliCalls=pipeline.calls,
                  providerBlockedReason=pipeline.cli_blocked_reason)
        try:
            pipeline.request('POST',f'/pipelines/{pipeline.id}/finish',dict(state='PARTIAL' if errors or remaining else 'SUCCESS',summary=dict(job='INFORMATION_REPAIR',**info,issues=errors)))
        except Exception as error:
            errors.append(dict(stage='information-finish',error=type(error).__name__))
        job=Repair(cfg,api,state/'image-repair-v1',apply=True,force=force,max_minutes=0,drain=True)
        if pipeline.cli_blocked_reason:job.research.blocked_reason=pipeline.cli_blocked_reason
        image_exit=job.run()
        image_report=json.loads((job.folder/'report.json').read_text(encoding='utf-8'))
        complete=not errors and not approvals['failed'] and not remaining and image_exit==0
        report=dict(job='FULL_REPAIR',state='SUCCESS' if complete else 'PARTIAL',
                    approvals=approvals,information=info,images={k:v for k,v in image_report.items() if k!='events'},
                    issues=errors,folder=str(folder))
        write_json(folder/'report.json',report)
        print(json.dumps(report,ensure_ascii=False))
        return 0 if complete else 2


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--force',action='store_true',help='Reopen completed/exhausted unchanged versions')
    args=parser.parse_args(argv)
    return run(load_config(args.config),apply=args.apply,force=args.force)


if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:
        print(type(error).__name__+': '+str(error)[:200]);raise SystemExit(1)
