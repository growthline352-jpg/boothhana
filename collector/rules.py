"""Deterministic checks, not a claim that AI-extracted facts are verified."""
from __future__ import annotations
from areas import district_errors
from datetime import date, datetime
import hashlib
import ipaddress
import json
import re
import unicodedata
from urllib.parse import urlsplit, urlunsplit
from pathlib import Path
from jsonschema import Draft202012Validator
from visitor_guide import validate_guide

MAX_JSON_BYTES = 2 * 1024 * 1024
from taxonomy import CATEGORIES, region_errors, topic_review_reasons, TOPIC_REVIEW_LABELS
SCHEMA = json.loads((Path(__file__).parent / 'schemas/search-result.schema.json').read_text(encoding='utf-8'))
VALIDATOR = Draft202012Validator(SCHEMA)

class InvalidResult(ValueError): pass

def parse_date(value: str) -> date:
    if not isinstance(value,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',value):
        raise InvalidResult('날짜 형식은 YYYY-MM-DD여야 합니다.')
    return date.fromisoformat(value)

def public_url(value: str) -> str:
    """Syntax-only. Does not resolve DNS or fetch a URL. We store links, never auto-download."""
    if not isinstance(value,str) or len(value)>2048 or any(ord(c)<33 or c=='\\' for c in value):
        raise InvalidResult('안전하지 않은 URL 형식입니다.')
    u=urlsplit(value)
    if u.scheme not in ('http','https') or not u.hostname or u.username is not None or u.password is not None:
        raise InvalidResult('공개 HTTP(S) URL이 필요합니다.')
    host=u.hostname.rstrip('.').lower()
    if host=='localhost' or '.' not in host or host.endswith(('.local','.internal','.localhost','.test','.invalid')):
        raise InvalidResult('로컬/내부 URL은 저장할 수 없습니다.')
    try:
        ip=ipaddress.ip_address(host)
    except ValueError:
        if not re.fullmatch(r'[a-zA-Z0-9.-]+',host): raise InvalidResult('URL 호스트는 ASCII 도메인을 사용하세요.')
        if all(c.isdigit() or c=='.' for c in host): raise InvalidResult('모호한 숫자 호스트는 허용하지 않습니다.')
    else:
        raise InvalidResult('IP 주소 대신 공개 도메인을 사용하세요.')
    try:
        if u.port not in (None,80,443): raise InvalidResult('표준 HTTP(S) 포트만 허용합니다.')
    except ValueError as e: raise InvalidResult('잘못된 URL 포트입니다.') from e
    return value

def normalized(value: str | None) -> str:
    return re.sub(r'\s+','',unicodedata.normalize('NFKC',value or '').lower())

def identity(event: dict) -> str:
    # Deliberately conservative: exact normalized title + venue + edition + actual dates.
    # Date/venue/title changes are NOT silently merged. The server flags likely matches.
    dates=','.join(sorted(f"{x['startDate']}:{x['endDate']}" for x in event['occurrences']))
    parts=[normalized(event['name']),normalized(event['venueName']),normalized(event['organizer']),normalized(event['edition']),dates]
    return hashlib.sha256('\x1f'.join(parts).encode()).hexdigest()

def parse_result(data: bytes) -> dict:
    if len(data)>MAX_JSON_BYTES: raise InvalidResult('검색 결과가 2MiB를 초과했습니다.')
    def pairs(items):
        d={}
        for k,v in items:
            if k in d: raise InvalidResult('JSON에 중복 키가 있습니다: '+k)
            d[k]=v
        return d
    try: value=json.loads(data.decode('utf-8-sig'),object_pairs_hook=pairs)
    except (ValueError,UnicodeError) as e: raise InvalidResult('올바른 JSON이 아닙니다: '+str(e)) from e
    errors=sorted(VALIDATOR.iter_errors(value),key=lambda x:str(x.path))
    if errors:
        raise InvalidResult('JSON 스키마 불일치: '+'; '.join(str(list(e.path))+': '+e.message[:180] for e in errors[:5]))
    return value

def check_event(e: dict, start: date, end: date) -> tuple[list[str], list[str]]:
    rejected=[]; warnings=list(e['warnings'])
    warnings.extend(TOPIC_REVIEW_LABELS[r] for r in topic_review_reasons(e.get('subcategory'),e.get('subjects')))
    if not e['name'].strip(): rejected.append('행사명 없음')
    if e.get('subcategory') not in CATEGORIES: rejected.append('지원하지 않는 행사 분류')
    rejected.extend(region_errors(e.get('region'),e.get('address'),e.get('venueName')))
    rejected.extend(district_errors(e))
    address=(e['address'] or '').strip()
    if not e['venueName'] or '비공개' in e['venueName']: warnings.append('장소 미확정/비공개')
    if not address: warnings.append('상세 주소 확인 필요')
    spans=[]
    for occurrence in e['occurrences']:
        try:
            a=parse_date(occurrence['startDate']); b=parse_date(occurrence['endDate'])
            if a>b or (b-a).days>366: raise ValueError('역전/과도한 기간')
            for k in ('startTime','endTime'):
                t=occurrence[k]
                if t is not None and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',t): raise ValueError('시간 형식 오류')
            s,t=occurrence['startTime'],occurrence['endTime']
            if a==b and s is not None and t is not None and s>=t: raise ValueError('시간 역전')
            if s is None or t is None: warnings.append('운영시간 확인 필요')
            spans.append((a,b))
        except (ValueError,TypeError): rejected.append('잘못된 운영 날짜/시간')
    if not spans: rejected.append('확인된 개최일 없음')
    elif not any(a<=end and b>=start for a,b in spans): rejected.append('검색 기간과 겹치지 않음')
    spans.sort()
    if any(spans[i][0]<=spans[i-1][1] for i in range(1,len(spans))): rejected.append('중복/겹치는 운영일 구간')
    if not e['sources']: rejected.append('원문 출처 없음')
    has_read=False
    for s in e['sources']:
        try: public_url(s['url'])
        except ValueError: rejected.append('안전하지 않은 출처 URL')
        if s['access']!='INACCESSIBLE' and s['evidence'].strip(): has_read=True
    if not has_read: rejected.append('확인 가능한 출처 근거 없음')
    if not any(s['access']=='ORIGINAL' for s in e['sources']): warnings.append('원문 직접 확인 필요(검색 요약만 확인)')
    status=e.get('operationStatus')
    if status is not None:
        try:
            if not isinstance(status,dict): raise ValueError('개최 상태 형식 오류')
            if status.get('state') not in {'UNKNOWN','SCHEDULED','CANCELED','POSTPONED','RESCHEDULED'}: raise ValueError('개최 상태 오류')
            if status.get('sourceUrl') is not None: public_url(status['sourceUrl'])
            if status.get('checkedOn') is not None: parse_date(status['checkedOn'])
            if status['state']!='UNKNOWN' and not (isinstance(status.get('note'),str) and status['note'].strip() and status.get('sourceUrl') and status.get('checkedOn')): raise ValueError('개최 상태 근거 누락')
        except (ValueError,TypeError,KeyError): rejected.append('개최 상태·원문·확인일을 확인하세요.')
    try:validate_guide(e.get('visitorGuide'),e['occurrences'],public_url)
    except (ValueError,TypeError,KeyError):rejected.append('관람 안내 출처·날짜·확정 상태를 확인하세요.')
    for b in e['banners']:
        try: public_url(b['imageUrl']); public_url(b['pageUrl'])
        except ValueError: rejected.append('안전하지 않은 배너 URL')
    if not e['banners']: warnings.append('배너 없음')
    else: warnings.append('배너 사용허락·해당 회차 확인 필요(자동 사용하지 않음)')
    return sorted(set(rejected)), sorted(set(warnings))

def inspect_result(result: dict, start: date, end: date) -> dict:
    accepted=[]; rejected=[]; seen=set()
    for index,e in enumerate(result['events']):
        errors,warnings=check_event(e,start,end)
        if errors: rejected.append({'index':index,'name':e['name'],'reasons':errors}); continue
        key=identity(e)
        if key in seen: rejected.append({'index':index,'name':e['name'],'reasons':['배치 내 동일 행사 중복']}); continue
        seen.add(key); accepted.append({'index':index,'name':e['name'],'identityKey':key,'warnings':warnings})
    return {'accepted':accepted,'rejected':rejected,'count':len(accepted)}
