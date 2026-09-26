#!/usr/bin/env python3
"""Real build + opt-in local PostgreSQL gate. Skipped/missing tests are NOT a pass.
Does not deploy, install a scheduler, or touch a production DB.
"""
from pathlib import Path
import os,re,shutil,subprocess,sys,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
TEST_ENV='BOOTH_SUPPORT_TEST_URL'
def execute(args,cwd):
 print('RUN', ' '.join(map(str,args)),flush=True)
 if os.name=='nt' and str(args[0]).lower().endswith(('.cmd','.bat')):
  args=['cmd.exe','/d','/s','/c',subprocess.list2cmdline(list(map(str,args)))]
 subprocess.run(list(map(str,args)),cwd=cwd,check=True)
def main():
 url=os.environ.get(TEST_ENV,'')
 if not re.fullmatch(r'jdbc:postgresql://(?:localhost|127\.0\.0\.1):[0-9]{1,5}/boothhana_support_test',url):
  print('NOT READY: set BOOTH_SUPPORT_TEST_URL to a dedicated, empty localhost boothhana_support_test DB. Do not use tunnels to production.',file=sys.stderr);return 2
 if not os.environ.get('BOOTH_SUPPORT_TEST_USER') or 'BOOTH_SUPPORT_TEST_PASSWORD' not in os.environ:
  print('NOT READY: explicit test-only credentials are required.',file=sys.stderr);return 2
 for name in ['BOOTH_TEST_DATABASE_URL','BOOTH_COLLECTION_TEST_URL','BOOTH_CATALOG_TEST_URL','BOOTH_FLOORPLAN_TEST_URL']:
  if os.environ.get(name):
   print('NOT READY: unset other destructive integration test variables before this gate: '+name,file=sys.stderr);return 2
 pnpm=shutil.which('pnpm')
 if pnpm:manager=[pnpm]
 elif shutil.which('corepack'):manager=[shutil.which('corepack'),'pnpm']
 else:
  print('NOT READY: install pnpm and locked frontend dependencies first.',file=sys.stderr);return 2
 execute([*manager,'lint'],ROOT/'frontend');execute([*manager,'build'],ROOT/'frontend')
 gradle=[str(ROOT/'backend/gradlew.bat')] if os.name=='nt' else ['sh',str(ROOT/'backend/gradlew')]
 execute([*gradle,'test','--no-daemon','--rerun-tasks'],ROOT/'backend')
 result=ROOT/'backend/build/test-results/test/TEST-com.boothhana.support.SupportReliabilityPostgresTests.xml'
 if not result.exists():print('NOT READY: actual DB test results missing.',file=sys.stderr);return 2
 suite=ET.parse(result).getroot()
 tests=int(suite.attrib.get('tests',0));failures=int(suite.attrib.get('failures',0));errors=int(suite.attrib.get('errors',0));skips=int(suite.attrib.get('skipped',0))
 if tests<8 or failures or errors or skips:
  print(f'NOT READY: PostgreSQL tests={tests}, failed={failures}, errors={errors}, skipped={skips}',file=sys.stderr);return 2
 execute([*gradle,'bootJar','--no-daemon'],ROOT/'backend')
 print('PASS: project build and eight real local PostgreSQL regression cases completed. OAuth/R2/browser acceptance remains a separate staging checklist.')
 return 0
if __name__=='__main__':
 try:sys.exit(main())
 except (subprocess.CalledProcessError,OSError):
  print('NOT READY: command failed; no deployment approval.',file=sys.stderr);sys.exit(1)
