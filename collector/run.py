#!/usr/bin/env python3
"""One prompt -> Codex live search -> JSON validation -> private collection inbox.
Python 3.11+. Does not deploy, publish, scrape authenticated pages, or download banners.
"""
from __future__ import annotations
import argparse
import calendar
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from rules import parse_result, inspect_result, parse_date, MAX_JSON_BYTES, InvalidResult
from transport import send_batch, endpoint, DeliveryError

ROOT=Path(__file__).resolve().parent
try: SEOUL=ZoneInfo('Asia/Seoul')
except ZoneInfoNotFoundError: SEOUL=timezone(timedelta(hours=9),name='Asia/Seoul')

class RunError(RuntimeError): pass

def utcnow(): return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')

def write_json(path: Path, value: dict):
    data=(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
    temporary=path.with_name(path.name+'.tmp')
    with temporary.open('wb') as file: file.write(data)
    try: temporary.chmod(0o600)
    except OSError: pass
    os.replace(temporary,path)

def config(path: Path | None):
    result={'apiBaseUrl':os.getenv('COLLECTOR_API_BASE_URL','http://localhost:8080'),
        'tokenEnv':'BOOTH_COLLECTOR_TOKEN','stateDirectory':'~/.boothhana-collector',
        'codexExecutable':'codex','codexHome':None,'model':None,'timeoutSeconds':900,'httpTimeoutSeconds':45}
    if path:
        extra=json.loads(path.read_text(encoding='utf-8-sig'))
        if not isinstance(extra,dict) or set(extra)-set(result): raise RunError('알 수 없는 설정 키가 있습니다.')
        result.update(extra)
    if not isinstance(result['tokenEnv'],str) or not re.fullmatch('[A-Z][A-Z0-9_]*',result['tokenEnv']): raise RunError('tokenEnv 형식 오류')
    for key,low,high in [('timeoutSeconds',30,3600),('httpTimeoutSeconds',5,120)]:
        if type(result[key]) is not int or not low<=result[key]<=high: raise RunError(key+' 범위 오류')
    endpoint(result['apiBaseUrl'])
    return result

def date_window(month=None,start=None,end=None):
    if month:
        if start or end or not re.fullmatch(r'\d{4}-\d{2}',month): raise RunError('--month 또는 --start/--end 중 하나만 쓰세요.')
        y,m=map(int,month.split('-')); a=date(y,m,1); b=date(y,m,calendar.monthrange(y,m)[1])
    elif start or end:
        if not start or not end: raise RunError('--start와 --end를 함께 지정하세요.')
        a,b=parse_date(start),parse_date(end)
    else:
        a=datetime.now(SEOUL).date(); b=a+timedelta(days=89)
    if b<a or (b-a).days>365: raise RunError('검색 기간은 1~366일이어야 합니다.')
    return a,b

@contextmanager
def run_lock(state: Path):
    """OS lock auto-releases after crash. No stale PID-file lock."""
    state.mkdir(parents=True,exist_ok=True)
    try: state.chmod(0o700)
    except OSError: pass
    f=(state/'runner.lock').open('a+b')
    try:
        f.seek(0); f.write(b'0'); f.flush(); f.seek(0)
        if os.name=='nt':
            import msvcrt
            try: msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
            except OSError: raise RunError('다른 수집 작업이 실행 중입니다.') from None
        else:
            import fcntl
            try: fcntl.flock(f.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError: raise RunError('다른 수집 작업이 실행 중입니다.') from None
        yield
    finally: f.close()

def child_environment(home: Path, source: dict[str,str] | None=None) -> dict[str,str]:
    source=os.environ if source is None else source
    allow={'PATH','SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','LANG','LC_ALL'}
    env={k:v for k,v in source.items() if k in allow}
    env.update({'HOME':str(home),'USERPROFILE':str(home),'CODEX_HOME':str(home/'codex'),
        'TMPDIR':str(home),'TEMP':str(home),'TMP':str(home),'NO_COLOR':'1'})
    if source.get('CODEX_API_KEY'): env['CODEX_API_KEY']=source['CODEX_API_KEY']
    # DB, R2, BOOTH_COLLECTOR_TOKEN, plugin/MCP configuration are never inherited.
    return env

def codex_command(executable: str, schema: Path, output: Path, model: str | None=None, images: list[Path] | None=None, web_search: bool=True) -> list[str]:
    command=[executable,'exec','--skip-git-repo-check','--sandbox','read-only','--ephemeral','--json',
        '-c','web_search="live"' if web_search else 'web_search="disabled"','-c','approval_policy="never"','-c','features.shell_tool=false',
        '-c','features.unified_exec=false','-c','allow_login_shell=false',
        '--output-schema',str(schema),'--output-last-message',str(output)]
    if model:
        if not isinstance(model,str) or not re.fullmatch(r'[A-Za-z0-9_.:/-]{1,100}',model): raise RunError('model 이름 형식 오류')
        command+=['--model',model]
    for image in images or []:
        command += ['--image',str(image)]
    return command+['-']

def audit_search(path: Path) -> tuple[bool,dict]:
    observed=False; usage={}
    if path.stat().st_size>20*1024*1024: raise RunError('CLI 로그가 제한 크기를 초과했습니다.')
    for line in path.read_text(encoding='utf-8',errors='replace').splitlines():
        try: e=json.loads(line)
        except ValueError: continue
        item=e.get('item',{})
        if e.get('type')=='item.completed' and item.get('type') in ('web_search','web_search_call'):
            observed=True
        if e.get('type')=='turn.completed': usage=e.get('usage',{})
    return observed,usage

def stop_process(p: subprocess.Popen):
    if p.poll() is not None: return
    if os.name=='nt':
        subprocess.run(['taskkill','/PID',str(p.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
    else:
        try: os.killpg(p.pid,signal.SIGKILL)
        except ProcessLookupError: pass
    p.kill();p.wait()

def persist_refreshed_auth(source: Path, initial: bytes | None, refreshed: Path):
    if initial is None or not refreshed.is_file() or source.is_symlink(): return
    updated=refreshed.read_bytes()
    if updated==initial: return
    value=json.loads(updated)
    if not isinstance(value,dict): raise RunError('Codex 인증 갱신 파일 형식 오류')
    if not source.is_file() or source.read_bytes()!=initial:
        raise RunError('다른 프로세스가 Codex 인증을 변경했습니다. 전용 codexHome에서 다시 로그인하세요.')
    fd, name=tempfile.mkstemp(prefix='.collector-auth-',dir=source.parent)
    try:
        with os.fdopen(fd,'wb') as output: output.write(updated)
        if source.read_bytes()!=initial: raise RunError('동시 Codex 로그인 변경 감지')
        os.replace(name,source)
    finally:
        if Path(name).exists(): Path(name).unlink()

def output_schema_for_cli(value: dict) -> dict:
    """Live results must state UNKNOWN explicitly; archived input schemas remain optional."""
    result=json.loads(json.dumps(value))
    event_schema=result.get('properties',{}).get('events',{}).get('items',{})
    if 'operationStatus' in event_schema.get('properties',{}):
        event_schema['required']=list(dict.fromkeys([*event_schema.get('required',[]),'operationStatus']))
    return result

def execute_search(cfg: dict, run_dir: Path, prompt: str, schema_path: Path | None = None, *, images: list[Path] | None = None, web_search: bool = True) -> tuple[bytes,bool,dict]:
    executable=shutil.which(cfg['codexExecutable'])
    if not executable: raise RunError('Codex CLI를 찾지 못했습니다. 설치 후 codex login을 실행하세요.')
    auth_root=Path(cfg['codexHome']).expanduser() if cfg['codexHome'] else Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex'))).expanduser()
    auth_file=auth_root/'auth.json'
    initial_auth=auth_file.read_bytes() if auth_file.is_file() else None
    if not os.getenv('CODEX_API_KEY') and not auth_file.is_file():
        raise RunError('Codex 인증 파일 또는 CODEX_API_KEY가 필요합니다. 별도 CODEX_HOME에 파일 방식으로 로그인하세요.')
    with tempfile.TemporaryDirectory(prefix='boothhana-search-') as temporary:
        home=Path(temporary); (home/'codex').mkdir(mode=0o700); (home/'work').mkdir(mode=0o700)
        # Copy only auth, never user's config.toml/hooks/MCP/skills/repository instructions.
        if auth_file.is_file():
            target=home/'codex/auth.json';shutil.copyfile(auth_file,target);target.chmod(0o600)
        (home/'codex/config.toml').write_text('web_search = '+ ('"live"' if web_search else '"disabled"') +'\ncli_auth_credentials_store = "file"\n',encoding='utf-8')
        schema=home/'work/schema.json'
        schema_data=output_schema_for_cli(json.loads((schema_path or ROOT/'schemas/search-result.schema.json').read_text(encoding='utf-8')))
        schema.write_text(json.dumps(schema_data,ensure_ascii=False),encoding='utf-8')
        output=home/'work/result.json'
        copied=[]
        if images and len(images)>4: raise RunError('한 번에 첨부할 이미지 수 초과')
        for index,image in enumerate(images or []):
            if image.is_symlink() or not image.is_file() or image.stat().st_size>10*1024*1024: raise RunError('잘못된 분석 이미지')
            target=home/'work'/f'image-{index}{image.suffix.lower()}'
            shutil.copyfile(image,target);copied.append(target)
        command=codex_command(executable,schema,output,cfg['model'],copied,web_search)
        stdout=run_dir/'codex.jsonl'; stderr=run_dir/'codex.stderr.log'
        with stdout.open('wb') as out,stderr.open('wb') as err:
            flags={'start_new_session':True} if os.name!='nt' else {'creationflags':subprocess.CREATE_NEW_PROCESS_GROUP}
            p=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=out,stderr=err,cwd=home/'work',env=child_environment(home),**flags)
            try:
                assert p.stdin is not None
                p.stdin.write(prompt.encode('utf-8')); p.stdin.close()
                deadline=time.monotonic()+cfg['timeoutSeconds']
                while p.poll() is None:
                    if time.monotonic()>deadline: raise RunError('Codex 실행 제한시간을 초과했습니다.')
                    if stdout.stat().st_size>20*1024*1024 or stderr.stat().st_size>5*1024*1024:
                        raise RunError('CLI 로그가 제한 크기를 초과했습니다.')
                    if output.exists() and output.stat().st_size>MAX_JSON_BYTES:
                        raise RunError('CLI 결과 파일 크기 초과')
                    time.sleep(0.1)
            except BaseException:
                stop_process(p);raise
        persist_refreshed_auth(auth_file,initial_auth,home/'codex/auth.json')
        if p.returncode: raise RunError(f'Codex 실행 실패(exit {p.returncode}). 로컬 stderr 로그를 확인하세요.')
        if not output.is_file() or output.stat().st_size>MAX_JSON_BYTES: raise RunError('CLI 결과 파일 누락/크기 초과')
        observed,usage=audit_search(stdout)
        raw=output.read_bytes()
        (run_dir/'search-result.json').write_bytes(raw)
        return raw,observed,usage

def failure_result(reason):
    return {'schemaVersion':'1','searchStatus':'FAILED','summary':reason[:1000],'queries':[],'events':[]}

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path)
    parser.add_argument('--month',help='예: 2026-10')
    parser.add_argument('--start');parser.add_argument('--end')
    parser.add_argument('--dry-run',action='store_true',help='검색/검증만. DB 저장 없음')
    parser.add_argument('--input',type=Path,help='기존 검색 JSON 검증·수동 가져오기. CLI 실행 안 함')
    parser.add_argument('--retry-batch',type=Path,help='기존 batch.json의 runId를 유지하여 재전송')
    parser.add_argument('--doctor',action='store_true')
    args=parser.parse_args(argv)
    cfg=config(args.config);token=os.getenv(cfg['tokenEnv'],'').strip()
    state=Path(cfg['stateDirectory']).expanduser().resolve()
    if args.doctor:
        print(json.dumps({'python':sys.version.split()[0],'codexFound':bool(shutil.which(cfg['codexExecutable'])),
            'tokenConfigured':len(token)>=32,'apiBaseUrl':cfg['apiBaseUrl'],'stateDirectory':str(state)},ensure_ascii=False,indent=2))
        return 0
    if args.retry_batch:
        if args.month or args.start or args.end or args.input: raise RunError('--retry-batch는 기간/--input과 함께 쓸 수 없습니다.')
        if args.retry_batch.stat().st_size>MAX_JSON_BYTES: raise RunError('배치 크기 초과')
        batch=json.loads(args.retry_batch.read_text(encoding='utf-8'))
        uuid.UUID(batch['runId']);parse_result(json.dumps(batch['result'],ensure_ascii=False).encode())
        if args.dry_run:
            print('재전송 검사 완료. DB 변경 없음. runId='+batch['runId']);return 0
        response=send_batch(cfg['apiBaseUrl'],token,batch,cfg['httpTimeoutSeconds'])
        write_json(args.retry_batch.with_name('receipt.json'),response);print(json.dumps(response,ensure_ascii=False));return 0
    start,end=date_window(args.month,args.start,args.end)
    if not args.dry_run and len(token)<32: raise RunError(cfg['tokenEnv']+' 환경변수에 최소 32자 수집 토큰을 설정하세요.')
    with run_lock(state):
        run_id=str(uuid.uuid4());run_dir=state/'runs'/run_id;run_dir.mkdir(parents=True,mode=0o700)
        started=utcnow();observed=False;usage={};failure=None
        mode='MANUAL_IMPORT' if args.input else 'CLI'
        prompt=(ROOT/'prompts/subculture.md').read_text(encoding='utf-8').format(today=datetime.now(SEOUL).date(),start_date=start,end_date=end)
        (run_dir/'prompt.txt').write_text(prompt,encoding='utf-8')
        try:
            if args.input:
                if args.input.stat().st_size>MAX_JSON_BYTES: raise RunError('입력 파일 크기 초과')
                raw=args.input.read_bytes();(run_dir/'search-result.json').write_bytes(raw)
            else: raw,observed,usage=execute_search(cfg,run_dir,prompt)
            result=parse_result(raw)
            if mode=='CLI' and not observed and result['searchStatus']!='FAILED':
                raise RunError('CLI의 완료된 웹 검색 기록이 없어 결과를 행사 후보로 저장하지 않습니다.')
            if result['searchStatus']!='FAILED' and not result['queries']: raise RunError('실행한 검색어가 없습니다.')
            if result['searchStatus']=='FAILED':
                failure=result['summary'] or '검색 실패';result=failure_result(failure)
        except (RunError,InvalidResult,subprocess.TimeoutExpired,OSError,ValueError) as error:
            failure=str(error)[:1000];result=failure_result(failure)
        inspection=inspect_result(result,start,end)
        batch={'schemaVersion':'1','runId':run_id,'startedAt':started,'finishedAt':utcnow(),
            'executionMode':mode,'webSearchObserved':observed,
            'scope':{'region':'SEOUL_GYEONGGI','timezone':'Asia/Seoul','startDate':str(start),'endDate':str(end)},'result':result}
        write_json(run_dir/'batch.json',batch);write_json(run_dir/'validation.json',inspection);write_json(run_dir/'usage.json',usage)
        print(f"runId={run_id}\n검증 통과 {inspection['count']}건 / 제외 {len(inspection['rejected'])}건\n결과 폴더: {run_dir}")
        if not args.dry_run:
            receipt=send_batch(cfg['apiBaseUrl'],token,batch,cfg['httpTimeoutSeconds'])
            write_json(run_dir/'receipt.json',receipt);print('DB 수집함 저장: '+json.dumps(receipt,ensure_ascii=False))
        else: print('DRY RUN: DB에 저장하지 않았습니다.')
        if failure: print('검색 실패: '+failure,file=sys.stderr);return 2
        return 0

if __name__=='__main__':
    try: raise SystemExit(main())
    except (RunError,DeliveryError,ValueError,OSError,KeyError) as error:
        print('ERROR: '+str(error),file=sys.stderr);raise SystemExit(1)
