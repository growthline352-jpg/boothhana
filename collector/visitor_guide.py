"""Edition-scoped public visitor facts. Schema checks do not verify the source itself."""
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
import json
from jsonschema import Draft202012Validator

SCHEMA=json.loads((Path(__file__).parent/'schemas/visitor-guide.schema.json').read_text(encoding='utf-8'))
VALIDATOR=Draft202012Validator(SCHEMA)

def validate_guide(guide, occurrences, check_url):
    if guide is None:return
    error=next(iter(VALIDATOR.iter_errors(guide)),None)
    if error:raise ValueError('관람 안내 형식 오류: '+error.message[:100])
    def day(value):
        if value is None:return
        d=date.fromisoformat(value)
        if not any(date.fromisoformat(o['startDate'])<=d<=date.fromisoformat(o['endDate']) for o in occurrences):raise ValueError('행사 기간 밖 관람 일정')
    def provenance(row, confirmed):
        if row['sourceUrl'] is not None:check_url(row['sourceUrl'])
        if row['checkedOn'] is not None:date.fromisoformat(row['checkedOn'])
        if confirmed and not(row['sourceUrl'] and row['checkedOn']):raise ValueError('확정 안내 출처/확인일 필요')
    def timestamp(value):
        if value is None:return None
        if len(value)==10:return date.fromisoformat(value)
        parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
        if parsed.tzinfo is None:raise ValueError('판매 시각 시간대 필요')
        return parsed
    def period(row):
        a,b=timestamp(row['salesStartsAt']),timestamp(row['salesEndsAt'])
        if a is None or b is None:return
        if isinstance(a,datetime) and isinstance(b,datetime):bad=a>b
        else:
            def local(x):return x.astimezone(timezone(timedelta(hours=9))).date() if isinstance(x,datetime) else x
            bad=local(a)>local(b)
        if bad:raise ValueError('판매 기간 역전')
    def ids(rows, field='id'):
        values=[r[field] for r in rows]
        if len(set(values))!=len(values):raise ValueError('관람 안내 ID 중복')
        return set(values)
    ticket_ids=ids(guide['tickets'])
    for t in guide['tickets']:
        day(t['visitDate']);period(t);provenance(t,t['status'] not in ('UNKNOWN','UNPUBLISHED'))
        if not t['name'].strip():raise ValueError('예매권 이름 필요')
        if t['priceAmount'] is not None and not t['currency']:raise ValueError('예매권 통화 필요')
        if t['reservationUrl']:check_url(t['reservationUrl'])
        if t['status'] in ('UNKNOWN','UNPUBLISHED') and any(t[k] is not None for k in ('priceAmount','entryTime','reservationUrl')):raise ValueError('미확정 예매권 확정값 금지')
    ids(guide['programs']);ids(guide['faq']);ids(guide['sales']);ids(guide['coverage'],'kind')
    for p in guide['programs']:
        day(p['day']);provenance(p,p['status'] in ('PUBLISHED','SOLD_OUT'))
        if not p['name'].strip():raise ValueError('프로그램 이름 필요')
        if not p['day'] and (p['startTime'] or p['endTime']):raise ValueError('프로그램 날짜 필요')
        if p['startTime'] and p['endTime'] and p['startTime']>=p['endTime']:raise ValueError('프로그램 시간 역전')
        if p['ticketId'] and p['ticketId'] not in ticket_ids:raise ValueError('연결 예매권 없음')
    for f in guide['faq']:
        provenance(f,f['status']=='CONFIRMED')
        if f['status']=='UNKNOWN' and f['answer'] is not None or f['status']=='CONFIRMED' and not(f['answer'] and f['answer'].strip()):raise ValueError('FAQ 확정 상태/답변 불일치')
    for s in guide['sales']:day(s['pickupDay']);period(s);provenance(s,True)
    for c in guide['coverage']:provenance(c,c['status']!='UNKNOWN')
