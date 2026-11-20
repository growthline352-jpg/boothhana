"""Run the unmodified production Worker.process with an in-memory API only."""
import argparse,json,sys,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'collector'))
from graph_worker import Worker,configuration

class LocalCapture:
    def __init__(self,folder):self.folder=folder;self.decision=None
    def request(self,method,path,body=None):
        if path.endswith('/heartbeat'):return {}
        if path.endswith('/extract'):
            (self.folder/'extraction.json').write_text(json.dumps(body,ensure_ascii=False,indent=2),encoding='utf-8')
            return {'id':body['extractionId'],'resultHash':'local-evaluation-only'}
        if path.endswith('/decide'):
            self.decision=body
            (self.folder/'decision.json').write_text(json.dumps(body,ensure_ascii=False,indent=2),encoding='utf-8')
            return {'verdict':body['verdict'],'publication':False}
        raise RuntimeError('No real API or database is available to this evaluation')

def main():
    p=argparse.ArgumentParser();p.add_argument('case',type=Path);p.add_argument('--executable',required=True);a=p.parse_args()
    case=json.loads(a.case.read_text(encoding='utf-8'));folder=a.case.parent/case['id'];folder.mkdir(exist_ok=True)
    cfg=configuration();cfg.update(stateDirectory=str(folder/'state'),codexExecutable=a.executable)
    api=LocalCapture(folder);worker=Worker(cfg,api)
    job={'id':str(uuid.uuid4()),'leaseToken':str(uuid.uuid4()),'contextHash':'local-evaluation-only','kind':case['kind'],'context':case['context']}
    if case.get('previousReview'):job['previousReview']=case['previousReview']
    summary={'id':case['id'],'requestedModel':cfg['model'],'productionWrites':False,'harness':'Worker.process unchanged','jobId':job['id'],'leaseToken':job['leaseToken']};start=time.monotonic()
    try:
        result=worker.process(job);summary.update(state='REVIEWED',result=result)
    except Exception as exc:summary.update(state='FAILED',errorType=type(exc).__name__,error=str(exc)[:1500])
    summary['seconds']=round(time.monotonic()-start,1)
    (folder/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False),flush=True)
    return 0 if summary['state']=='REVIEWED' else 1
if __name__=='__main__':sys.exit(main())
