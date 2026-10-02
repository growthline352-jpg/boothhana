#!/usr/bin/env python3
"""Apply the ACTUAL SQL001..024 to an EMPTY, ISOLATED localhost test database.
Never modifies/clears a nonempty DB. No production or forwarded databases allowed.
Requires PostgreSQL16+ client, test admin and a fresh dedicated test cluster.
"""
from pathlib import Path
import argparse,os,re,shutil,subprocess,sys,json,hashlib
ROOT=Path(__file__).resolve().parents[2]
def run(sql,env):
 return subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1','-At'],input=sql,text=True,capture_output=True,env=env,check=True).stdout.strip()
def main():
 p=argparse.ArgumentParser();p.add_argument('--confirm-isolated-empty-test-cluster',action='store_true');a=p.parse_args()
 if not a.confirm_isolated_empty_test_cluster:raise ValueError('Explicit isolated-test-cluster confirmation required')
 if os.getenv('PGHOST') not in ('localhost','127.0.0.1') or os.getenv('PGDATABASE')!='boothhana_release_test':raise ValueError('Only explicit localhost/127.0.0.1 boothhana_release_test accepted; never production forwarding')
 if not os.getenv('PGPORT','').isdigit() or not 0<int(os.environ['PGPORT'])<65536:raise ValueError('Explicit PGPORT required')
 if not os.getenv('PGUSER') or not os.getenv('BOOTH_FULL_TEST_PASSWORD'):raise ValueError('Test admin and runtime credentials required')
 if not shutil.which('psql'):raise ValueError('psql client is required')
 env=os.environ.copy();env['PGCONNECT_TIMEOUT']='5'
 if run("select current_database();",env)!='boothhana_release_test':raise ValueError('Wrong database')
 if run("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S');",env)!='0':raise ValueError('Nonempty public schema; refusing destructive reset')
 # Existing cluster-level roles indicate this is not a disposable isolated cluster.
 if run("select count(*) from pg_roles where rolname in ('boothhana_release_runtime','anon','authenticated');",env)!='0':raise ValueError('Test roles already exist; use a fresh dedicated cluster, do not alter shared roles')
 files=sorted((ROOT/'database').glob('[0-9][0-9][0-9]_*.sql'))
 if [x.name[:3] for x in files]!=[f'{i:03d}' for i in range(1,25)]:raise ValueError('Expected exact migration sequence 001..024')
 setup=r"""\getenv runtime_password BOOTH_FULL_TEST_PASSWORD
select format('create role boothhana_release_runtime login nosuperuser nocreatedb nocreaterole nobypassrls password %L', :'runtime_password') \gexec
create role anon nologin;
create role authenticated nologin;
select set_config('boothhana.backend_role','boothhana_release_runtime',false);
"""
 # Same psql session preserves backend_role across all migrations. SQL files retain own transaction boundaries.
 commands=setup+'\n'+'\n'.join(x.read_text() for x in files)
 run(commands,env)
 result={'state':'SCHEMA_APPLIED_TEST_ONLY','database':'boothhana_release_test','migrations':[{'file':x.name,'sha256':hashlib.sha256(x.read_bytes()).hexdigest()} for x in files]}
 out=ROOT/'verification/v18/results/test-db-preparation.json';out.parent.mkdir(exist_ok=True,parents=True);out.write_text(json.dumps(result,indent=2)+'\n');print('Applied actual SQL001..024 to isolated test DB. No runtime/test success implied.')
 return 0
if __name__=='__main__':
 try:sys.exit(main())
 except (ValueError,OSError,subprocess.CalledProcessError) as e:
  # Do NOT print psql input, environment, credentials or raw driver stderr.
  print('TEST DB PREPARATION FAILED:',str(e) if isinstance(e,ValueError) else type(e).__name__,file=sys.stderr);sys.exit(2)
