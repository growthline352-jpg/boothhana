#!/usr/bin/env python3
"""v21 gate. Actual migrations+builds+browser required. Never deploys or sets production approval."""
from pathlib import Path
import subprocess,sys,json,time,hashlib,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'verification/v21/results/release-gate.json'
def state(value,**extra):
 OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps({'state':value,'productionApproval':False,'attemptedAt':time.time(),**extra},ensure_ascii=False,indent=2))
def main():
 state('NOT_READY',reason='Current attempt not yet complete')
 report=ROOT/'verification/v18/results/test-db-preparation.json'
 if not report.exists():raise ValueError('Fresh isolated SQL001..016 test preparation required; production DB is not permitted')
 data=json.loads(report.read_text());actual=sorted((ROOT/'database').glob('[0-9][0-9][0-9]_*.sql'))
 expected=[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in actual]
 if data.get('state')!='SCHEMA_APPLIED_TEST_ONLY' or data.get('migrations')!=expected or report.stat().st_mtime<time.time()-7200:raise ValueError('Migration report missing, stale or mismatched')
 for cmd in [[sys.executable,'verification/v21/run_checks.py'],[sys.executable,'verification/v17/release_gate.py'],[sys.executable,'verification/v21/browser_offline.py']]:subprocess.run(cmd,cwd=ROOT,check=True)
 report=ROOT/'backend/build/test-results/test/TEST-com.boothhana.release.LibraryIntegrationTests.xml'
 if not report.exists():raise ValueError('Current LibraryIntegrationTests report required')
 suite=ET.parse(report).getroot()
 cases=[case for case in suite.findall('testcase') if case.get('name','').split('(')[0]=='v21HiddenSalesRedactsSavedBoothHistoryAndSearch']
 if len(cases)!=1 or any(cases[0].find(tag) is not None for tag in ('skipped','failure','error')):raise ValueError('v21 saved-sales withdrawal SQL test missing, failed or skipped')
 state('AUTOMATED_CHECKS_PASSED',remaining=['real hosting /offline routes and cache MIME','actual mobile Safari/Chrome and storage eviction','real public API/image CORS','live Codex + reviewed event data for all categories','rights and privacy acceptance','load and backup restore'])
 return 0
if __name__=='__main__':
 try:sys.exit(main())
 except (ValueError,OSError,subprocess.CalledProcessError,ET.ParseError) as e:
  state('NOT_READY',reason=str(e) if isinstance(e,ValueError) else type(e).__name__);print('NOT READY:',str(e) if isinstance(e,ValueError) else type(e).__name__);sys.exit(2)
