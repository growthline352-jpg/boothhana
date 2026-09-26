#!/usr/bin/env python3
"""Opt-in read-only latency sampler. No seeding, content writes, redirects or secret logging.
Measures HTTP end-to-end, NOT SQL execution cost. Staging needs explicit authorization.
"""
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from http.cookies import SimpleCookie
from concurrent.futures import ThreadPoolExecutor
import argparse, json, math, os, statistics, time
MAX_BYTES = 16 * 1024 * 1024
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args): return None

def base_url(raw, allow_staging=False):
    u = urlsplit(raw)
    if u.username or u.password or u.query or u.fragment or u.path not in ['', '/']:
        raise ValueError('Provide an origin, not a path or credentials')
    local = u.hostname in ['localhost','127.0.0.1','::1']
    if (not local and (not allow_staging or u.scheme != 'https')) or u.scheme not in ['http','https']:
        raise ValueError('Only localhost is allowed unless --allow-staging is explicitly supplied for HTTPS staging')
    if not u.hostname: raise ValueError('Missing hostname')
    return raw.rstrip('/')

def validate_targets(values):
    if not isinstance(values, list) or len(values) < 200: raise ValueError('Provide at least 200 distinct real test targets')
    result, seen = [], set()
    for row in values:
        if not isinstance(row,dict) or set(row) != {'type','eventId','id','participantId'}: raise ValueError('Target IDs only; extra fields are not accepted')
        kind, event, identifier, parent = (row[k] for k in ['type','eventId','id','participantId'])
        positive = lambda n: type(n) is int and 0 < n <= 9007199254740991
        if kind not in ['EVENT','PARTICIPANT','PRODUCT'] or not positive(event) or not positive(identifier): raise ValueError('Invalid target')
        if kind == 'EVENT' and (identifier != event or parent is not None): raise ValueError('Invalid event target')
        if kind == 'PARTICIPANT' and (not positive(parent) or parent != identifier): raise ValueError('Invalid participant target')
        if kind == 'PRODUCT' and not positive(parent): raise ValueError('Invalid product parent')
        key = (kind,event,identifier,parent)
        if key in seen: raise ValueError('Targets must be distinct to measure the full batch')
        result.append(row);seen.add(key)
    return result[:200]

def summarize(samples):
    latencies = sorted(x['ms'] for x in samples if x['ok'])
    return {'requests':len(samples),'errors':sum(not x['ok'] for x in samples),
        'p50_ms':round(statistics.median(latencies),3) if latencies else None,
        'p95_ms':round(latencies[max(0,math.ceil(len(latencies)*0.95)-1)],3) if latencies else None,
        'max_bytes':max((x['bytes'] for x in samples),default=0),
        'status_counts':{str(n):sum(x['status']==n for x in samples) for n in sorted({x['status'] for x in samples})}}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base',required=True);parser.add_argument('--targets',required=True,type=Path)
    parser.add_argument('--allow-staging',action='store_true');parser.add_argument('--confirm-read-only',action='store_true')
    parser.add_argument('--runs',type=int,default=10);parser.add_argument('--concurrency',type=int,default=4)
    parser.add_argument('--member500',action='store_true');parser.add_argument('--out',type=Path,default=Path('library-probe.json'))
    args=parser.parse_args()
    report={'state':'NOT_READY','productionApproval':False,'scope':'HTTP latency; no SQL cost certification',
            'member500':'NOT_REQUESTED','samples':{},'runs':args.runs,'concurrency':args.concurrency}
    args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n')
    if not args.confirm_read_only: parser.error('Pass --confirm-read-only only for your authorized local/staging server')
    if not 1 <= args.runs <= 50 or not 1 <= args.concurrency <= 8: parser.error('runs 1..50; concurrency 1..8')
    base=base_url(args.base,args.allow_staging);targets=validate_targets(json.loads(args.targets.read_text()))
    cookie=os.environ.get('BOOTH_BENCH_COOKIE','')
    if '\n' in cookie or '\r' in cookie: raise ValueError('Invalid cookie')
    # CSRF preflight creates an anonymous session as necessary, but no saved records.
    headers={'Accept':'application/json'}
    if cookie: headers['Cookie']=cookie
    with build_opener(NoRedirect()).open(Request(base+'/api/auth/csrf',headers=headers),timeout=15) as response:
        raw=response.read(MAX_BYTES+1)
        if len(raw)>MAX_BYTES: raise ValueError('Oversized CSRF response')
        token=json.loads(raw).get('token')
        cookies=SimpleCookie();cookies.load(cookie)
        for line in response.headers.get_all('Set-Cookie',[]): cookies.load(line)
    if not isinstance(token,str) or not token or any(c in token for c in '\r\n'): raise ValueError('CSRF token missing')
    headers.update({'Cookie':'; '.join(f'{k}={m.coded_value}' for k,m in cookies.items()),'X-XSRF-TOKEN':token,'Content-Type':'application/json'})
    def request(path,payload=None,validator=lambda body:True,keep=False):
        started=time.perf_counter();status=0;length=0;body=None;okay=False
        try:
            data=json.dumps(payload).encode() if payload is not None else None
            req=Request(base+path,data=data,headers=headers,method='POST' if data is not None else 'GET')
            with build_opener(NoRedirect()).open(req,timeout=20) as response:
                status=response.status;raw=response.read(MAX_BYTES+1);length=len(raw)
                if length<=MAX_BYTES:body=json.loads(raw);okay=200<=status<300 and validator(body)
        except HTTPError as error: status=error.code;error.close()
        except Exception: pass # Do not print payloads, cookies, private notes or remote error pages.
        sample={'ms':(time.perf_counter()-started)*1000,'status':status,'bytes':length,'ok':okay}
        return (sample,body) if keep else sample
    for size in [1,24,200]:
        payload={'targets':targets[:size]}
        valid=lambda body,n=size:isinstance(body,list) and len(body)==n and all(x.get('available') is True for x in body if isinstance(x,dict)) and all(isinstance(x,dict) for x in body)
        warmup=request('/api/public/library/resolve',payload,valid)
        if not warmup['ok']: raise RuntimeError('Public preflight failed: validate test IDs, publication, CSRF and rate limits; no useful latency claim is possible')
        for concurrent in [1,args.concurrency] if args.concurrency>1 else [1]:
            with ThreadPoolExecutor(max_workers=concurrent) as pool:
                samples=list(pool.map(lambda _:request('/api/public/library/resolve',payload,valid),range(args.runs)))
            report['samples'][f'public-{size}-workers-{concurrent}']=summarize(samples)
    if args.member500:
        sample,index=request('/api/me/library/index',validator=lambda body:isinstance(body,list) and len(body)==500,keep=True)
        if not sample['ok']: raise RuntimeError('Use an isolated authenticated test account with exactly 500 saved records; the probe never seeds data')
        report['member500']='VERIFIED_INDEX_500'
        for page,count in [(0,24),(20,20)]:
            valid=lambda body,n=count:isinstance(body,dict) and body.get('total')==500 and len(body.get('items',[]))==n
            with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
                samples=list(pool.map(lambda _:request(f'/api/me/library/items?page={page}&size=24',validator=valid),range(args.runs)))
            report['samples'][f'member500-page-{page}']=summarize(samples)
    report['state']='MEASURED_WITH_ERRORS' if any(x['errors'] for x in report['samples'].values()) else 'MEASURED'
    args.out.write_text(json.dumps(report,indent=2)+'\n');print(report['state'],args.out)
    return 0 if report['state']=='MEASURED' else 2
if __name__=='__main__':
    import sys
    try:sys.exit(main())
    except Exception as error:
        # Keep the freshly written NOT_READY file. Exception type only: secrets may appear in network messages.
        print('NOT_READY:',type(error).__name__,file=sys.stderr);sys.exit(2)
