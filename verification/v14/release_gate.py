#!/usr/bin/env python3
"""Clean install + real builds + actual full-schema/app and support transaction tests.
Never deploys; missing/old/skipped reports fail. External service/browser acceptance remains separate.
"""
from pathlib import Path
import os,re,shutil,subprocess,sys,time,xml.etree.ElementTree as ET,json
ROOT=Path(__file__).resolve().parents[2]
def execute(args,cwd):
 print('RUN',' '.join(map(str,args)),flush=True)
 if os.name=='nt' and str(args[0]).lower().endswith(('.cmd','.bat')):args=['cmd.exe','/d','/s','/c',subprocess.list2cmdline(list(map(str,args)))]
 subprocess.run(list(map(str,args)),cwd=cwd,check=True)
def validate_environment():
 for prefix,name in [('BOOTH_FULL_TEST','boothhana_release_test'),('BOOTH_SUPPORT_TEST','boothhana_support_test')]:
  if not re.fullmatch(r'jdbc:postgresql://(?:localhost|127\.0\.0\.1):[0-9]{1,5}/'+name,os.getenv(prefix+'_URL','')):raise ValueError(prefix+'_URL must be isolated localhost '+name+', never production forwarding')
  if not os.getenv(prefix+'_USER') or not os.getenv(prefix+'_PASSWORD'):raise ValueError('Explicit test credentials required: '+prefix)
 for key in ['BOOTH_TEST_DATABASE_URL','BOOTH_COLLECTION_TEST_URL','BOOTH_CATALOG_TEST_URL','BOOTH_FLOORPLAN_TEST_URL','BOOTH_GOODS_TEST_URL']:
  if os.getenv(key):raise ValueError('Unset unrelated potentially destructive test variable: '+key)
def check_report(path,minimum,started):
 if not path.exists() or path.stat().st_mtime<started-2:raise ValueError('Fresh required test report missing: '+path.name)
 node=ET.parse(path).getroot();tests=int(node.get('tests','0'));bad=sum(int(node.get(k,'0')) for k in ('failures','errors','skipped'))
 if tests<minimum or len(node.findall('testcase'))<minimum or bad:raise ValueError('Required suite missing/failed/skipped: '+path.name)
 return {'suite':path.name,'tests':tests,'failures':0,'errors':0,'skipped':0}
def main():
 validate_environment()
 pnpm=shutil.which('pnpm');cp=shutil.which('corepack')
 if not pnpm and not cp:raise ValueError('pnpm/corepack required')
 manager=[pnpm] if pnpm else [cp,'pnpm']
 execute([*manager,'install','--frozen-lockfile'],ROOT/'frontend')
 execute([*manager,'lint'],ROOT/'frontend');execute([*manager,'build'],ROOT/'frontend')
 execute([sys.executable,'-m','unittest','discover','-s','tests','-v'],ROOT/'collector')
 gradle=[str(ROOT/'backend/gradlew.bat')] if os.name=='nt' else ['sh',str(ROOT/'backend/gradlew')]
 started=time.time();execute([*gradle,'clean','test','--no-daemon','--rerun-tasks'],ROOT/'backend')
 reports=ROOT/'backend/build/test-results/test'
 summary=[check_report(reports/'TEST-com.boothhana.release.ReleaseIntegrationTests.xml',14,started),check_report(reports/'TEST-com.boothhana.support.SupportReliabilityPostgresTests.xml',8,started)]
 execute([*gradle,'bootJar','--no-daemon'],ROOT/'backend')
 out=ROOT/'verification/v14/results/release-gate.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps({'state':'AUTOMATED_CHECKS_PASSED','suites':summary,'productionApproval':False,'remaining':['Kakao','R2 privacy and upload','Codex live','actual browser/mobile','load','backup restore','protected deployment configuration']},indent=2)+'\n')
 print('AUTOMATED CHECKS PASSED. Not production approval; complete separately documented external/browser/operations acceptance.')
 return 0
if __name__=='__main__':
 try:sys.exit(main())
 except (ValueError,OSError,subprocess.CalledProcessError,ET.ParseError) as e:
  print('NOT READY:',str(e) if isinstance(e,ValueError) else type(e).__name__,file=sys.stderr);sys.exit(2)
