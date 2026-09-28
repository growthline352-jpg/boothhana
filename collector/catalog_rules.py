"""v4 structural/source rules. They do not independently verify AI research findings."""
from __future__ import annotations
from pathlib import Path
import json,re
from urllib.parse import urlsplit
from jsonschema import Draft202012Validator
from rules import public_url,check_event,parse_date,MAX_JSON_BYTES,InvalidResult
ROOT=Path(__file__).resolve().parent
SCOPES={'EVENT_LISTED','EVENT_SALE_CONFIRMED','PROFILE','GENERAL_CATALOG','PAST_REFERENCE','UNKNOWN'}

def parse_schema(raw: bytes, name: str) -> dict:
    if len(raw)>MAX_JSON_BYTES: raise InvalidResult('2MiB result limit')
    def pairs(entries):
        value={}
        for key,item in entries:
            if key in value: raise InvalidResult('Duplicate JSON key')
            value[key]=item
        return value
    value=json.loads(raw.decode('utf-8-sig'),object_pairs_hook=pairs,parse_constant=lambda x:(_ for _ in ()).throw(InvalidResult('Non-finite number')))
    schema=json.loads((ROOT/'schemas'/name).read_text(encoding='utf-8'))
    errors=list(Draft202012Validator(schema).iter_errors(value))
    if errors: raise InvalidResult('Schema mismatch: '+str(list(errors[0].path))+': '+errors[0].message[:180])
    return value

def allowed_source(url: str, blocked: list[str]):
    public_url(url);host=urlsplit(url).hostname.lower().rstrip('.')
    if any(host==b or host.endswith('.'+b) for b in blocked): raise InvalidResult('Source excluded by collection policy')

def sources(values: list,blocked: list[str]):
    if not values or not any(x['access']!='INACCESSIBLE' and x['evidence'].strip() for x in values): raise InvalidResult('No usable source evidence')
    for item in values: allowed_source(item['url'],blocked)

def images(values,blocked):
    for image in values: allowed_source(image['imageUrl'],blocked);allowed_source(image['pageUrl'],blocked)

def check_participant(p: dict,event: dict,blocked: list[str]):
    if not p['registrationName'].strip(): raise InvalidResult('No registration name')
    sources(p['sources'],blocked);images(p['images'],blocked);check_identity(p,blocked)
    for m in p['members']:
        if not m['name'].strip(): raise InvalidResult('Empty member name')
        if m['profileUrl']: allowed_source(m['profileUrl'],blocked)
    for url in p['officialLinks']: allowed_source(url,blocked)
    for loc in p['locations']:
        if (loc['status']=='ASSIGNED') != bool(loc['code'] and loc['code'].strip()): raise InvalidResult('Booth assignment status/code mismatch')
        if loc['status']!='ASSIGNED' and loc['code'] is not None: raise InvalidResult('Unknown booth number must be null')
        if bool(loc['startDate'])!=bool(loc['endDate']): raise InvalidResult('Location date pair required')
        if loc['startDate']:
            a,b=parse_date(loc['startDate']),parse_date(loc['endDate'])
            if a>b or not any(parse_date(o['startDate'])<=a<=b<=parse_date(o['endDate']) for o in event['occurrences']): raise InvalidResult('Location outside actual event dates')
        if loc['floorPlanUrl']: allowed_source(loc['floorPlanUrl'],blocked)

def check_sales(s: dict,blocked: list[str]):
    if not s['summary'].strip(): raise InvalidResult('No sales summary')
    sources(s['sources'],blocked);images(s['images'],blocked)
    for p in s['products']:
        if not p['name'].strip(): raise InvalidResult('Unnamed product')
        sources(p['sources'],blocked);images(p['images'],blocked);check_identity(p,blocked)
        if p['productUrl']: allowed_source(p['productUrl'],blocked)
        if p['price']:
            price=p['price']
            if not re.fullmatch(r'[0-9]{1,12}(\.[0-9]{1,2})?',price['amount']) or not re.fullmatch('[A-Z]{3}',price['currency']): raise InvalidResult('Invalid base price/currency')
            parse_date(price['checkedOn'])

def validate_stage(result: dict,stage: str,event: dict,blocked: list[str]):
    if result['searchStatus']=='FAILED':
        if result['participants'] or result['sales']: raise InvalidResult('Failed research has data')
        return
    if not result['queries']: raise InvalidResult('No research queries')
    c=result['coverage']
    for url in c['visitedPages']: allowed_source(url,blocked)
    if c['nextPageUrl']: allowed_source(c['nextPageUrl'],blocked)
    if c['completeness']=='COMPLETE' and c['nextPageUrl']: raise InvalidResult('Incomplete pagination marked complete')
    if stage=='PARTICIPANTS':
        if result['sales'] is not None: raise InvalidResult('Stage payload mixed')
        for p in result['participants']: check_participant(p,event,blocked)
    elif stage=='SALES':
        if result['participants']: raise InvalidResult('Stage payload mixed')
        if result['sales'] is not None: check_sales(result['sales'],blocked)
    else: raise InvalidResult('Unknown stage')

def validate_discovery(result: dict,start,end,blocked):
    if result['searchStatus']=='FAILED' and result['events']: raise InvalidResult('Failed discovery has events')
    for coverage in result.get('sourceCoverage',[]):
        for url in coverage['checkedUrls']: allowed_source(url,blocked)
    accepted=[];rejected=[]
    for e in result['events']:
        errors,warnings=check_event(e,start,end)
        try:
            sources(e['sources'],blocked)
            for b in e['banners']: allowed_source(b['imageUrl'],blocked);allowed_source(b['pageUrl'],blocked)
            for link in e['discoveryLinks']:
                if link['url']: allowed_source(link['url'],blocked)
        except ValueError as exc: errors.append(str(exc))
        if errors: rejected.append({'name':e['name'],'reasons':errors})
        else: accepted.append(e)
    return accepted,rejected


def check_identity(item: dict,blocked: list[str]):
    identity=item.get('identity')
    if identity is None:return
    origin=identity.get('sourceSystem');allowed_source(origin,blocked)
    def system(url):
        u=urlsplit(url);port=u.port
        return u.scheme.lower()+"://"+u.hostname.lower()+(":"+str(port) if port and not(port==443 and u.scheme=='https' or port==80 and u.scheme=='http') else "")
    if origin!=system(origin):raise InvalidResult('Identity sourceSystem must be an origin')
    entry=identity.get('entryId');detail=identity.get('detailUrl')
    if not entry and not detail:raise InvalidResult('Identity requires stable entry ID or per-entry URL')
    if item.get('sourceEntryId') and entry and item['sourceEntryId']!=entry:raise InvalidResult('External identity IDs disagree')
    if not any(system(s['url'])==origin and s['access']!='INACCESSIBLE' for s in item['sources']):raise InvalidResult('Identity namespace has no usable source')
    if detail:
        allowed_source(detail,blocked)
        if system(detail)!=origin or not any(s['url'].split('#')[0]==detail.split('#')[0] for s in item['sources']):raise InvalidResult('Per-entry URL needs same-system source evidence')
