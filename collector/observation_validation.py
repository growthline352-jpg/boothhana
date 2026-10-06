"""Deterministic binding of confirmed recheck values to fetched field evidence."""
from datetime import date, datetime
from decimal import Decimal
import re
import unicodedata

from discovery_validation import normalized, normalized_address, normalized_venue
from event_identity import (date_ranges, source_date_ranges, source_datetime,
                            ISO_TIMESTAMP, IGNORED_LABEL, EVENT_LABEL, RANGE, date_matches)
from rules import public_url
from visitor_guide import validate_guide


def clock_tokens(text):
    """Published Seoul clocks with their native positions, never ISO offsets."""
    text=str(text)
    found=[]
    for match in ISO_TIMESTAMP.finditer(text):
        try:found.append((match.start(),match.end(),source_datetime(match[0]).strftime('%H:%M')))
        except ValueError:pass
    # Keep offsets unchanged when masking timestamps.
    plain=ISO_TIMESTAMP.sub(lambda m:' '*len(m[0]),text)
    for m in re.finditer(r'(?<!\d)(오전\s*|오후\s*)?(\d{1,2})(?::(\d{2})(?!\d)|\s*시(?:\s*(\d{1,2})\s*분)?)',plain):
        hour,minute=int(m[2]),int(m[3] or m[4] or 0)
        if m[1]:
            if not 1<=hour<=12:continue
            hour=hour%12+(12 if m[1].strip()=='오후' else 0)
        if 0<=hour<=23 and 0<=minute<=59:found.append((m.start(),m.end(),f'{hour:02}:{minute:02}'))
    return sorted(found)


def clocks(text):return [value for _,_,value in clock_tokens(text)]


TIME_LABEL=re.compile(r'(?:행사|운영|관람|입장|개장|공연)\s*(?:시간|시각)|opening\s*(?:time|hours)',re.I)
COMMON_TIME_LABEL=re.compile(r'(?:양일|매일|전일(?!권)|공통|동일|두\s*날|모든\s*(?:행사일|날짜|날)|각\s*(?:행사일|날짜)).{0,12}(?:'+TIME_LABEL.pattern+r')',re.I)


def event_clock_context(text,offset):
    before=text[:offset]
    ignored=list(IGNORED_LABEL.finditer(before))
    event=sorted([*EVENT_LABEL.finditer(before),*TIME_LABEL.finditer(before)],key=lambda m:m.start())
    return not ignored or bool(event and event[-1].start()>ignored[-1].start())


def event_clocks(excerpt,source):
    """A cropped booking label must not turn its clock into an event clock."""
    native,needle=normalized(source),normalized(excerpt)
    positions=[];at=native.find(needle)
    while needle and at>=0:
        positions.append(at);at=native.find(needle,at+1)
    return [value for start,_,value in clock_tokens(excerpt)
            if any(event_clock_context(native,at+len(normalized(excerpt[:start]))) for at in positions)]


def date_blocks(evidence):
    """Keep each listed date's clocks together; join actual range endpoints."""
    native=unicodedata.normalize('NFKC',evidence)
    iso={m.start():m for m in ISO_TIMESTAMP.finditer(native)}
    def date_only(match):
        try:value=source_datetime(match[0]).date().isoformat()
        except ValueError:value=' '*10
        return value.ljust(len(match[0]))
    aligned=ISO_TIMESTAMP.sub(date_only,native)
    tokens=[(m.start(),iso[m.start()].end() if m.start() in iso else m.end()) for m in date_matches(aligned)]
    groups=[];index=0
    while index<len(tokens):
        start,end=tokens[index];index+=1
        if index<len(tokens) and RANGE.fullmatch(native[end:tokens[index][0]]):
            end=tokens[index][1];index+=1
        groups.append((start,end))
    for index,(start,_) in enumerate(groups):
        # A single interval can have its common opening-time label before it.
        if len(groups)==1:start=0
        end=groups[index+1][0] if index+1<len(groups) else len(native)
        yield native[start:end]


def common_event_clocks(evidence,text):
    """Only an explicit all-days statement can supply clocks absent from a day."""
    candidates=[]
    for clause in clauses(unicodedata.normalize('NFKC',evidence)):
        label=COMMON_TIME_LABEL.search(clause)
        if not label:continue
        after=clause[label.end():]
        dates=date_matches(after)
        if dates:after=after[:dates[0].start()]
        times=tuple(event_clocks(after,text))
        if times:candidates.append(times)
    return list(candidates[0]) if candidates and len(set(candidates))==1 else []


def occurrences_supported(value, evidence, text):
    if not isinstance(value,list) or not value:return False
    supported=source_date_ranges(evidence,text)
    for row in value:
        if not isinstance(row,dict):return False
        try:
            interval=(date.fromisoformat(row['startDate']),date.fromisoformat(row['endDate']))
        except (ValueError,TypeError,KeyError):return False
        if interval not in supported:return False
        start,end=row.get('startTime'),row.get('endTime')
        if start is None and end is None:continue
        def matching(times):
            if any(t is not None and t not in times for t in (start,end)):return False
            return start is None or end is None or any(times[i]==start and end in times[i+1:] for i in range(len(times)))
        contexts=[event_clocks(block,text) for block in date_blocks(evidence)
                  if interval in source_date_ranges(block,text,evidence)]
        if any(matching(times) for times in contexts):continue
        # A named date's explicit clocks take priority over common hours.
        if any(contexts) or not matching(common_event_clocks(evidence,text)):return False
    return True


OPERATION_CUES={
    'CANCELED':r'취소|cancel(?:led|ed)',
    'POSTPONED':r'연기(?!자)|\bpostponed\b',
    'RESCHEDULED':r'(?:일정|날짜|일시|개최일)\s*(?:이|가|을|를)?\s*변경|rescheduled',
    'SCHEDULED':r'정상\s*(?:개최|진행)|예정대로|개최\s*예정|scheduled',
}

EVENT_SUBJECT=re.compile(r'행사(?!장)|축제|박람회|공연|전시|팝업|생일\s*카페|개최|\b(?:event|festival|exhibition|concert|pop[- ]?up)\b',re.I)
OTHER_SUBJECT=re.compile(r'예매|예약|티켓|입장권|환불|구매|접수|신청|모집|프로그램|부스|배우|출연자|\b(?:booking|reservation|tickets?|refund|program|application)\b',re.I)


CLAUSE_BREAK=re.compile(r'\n+|[;!?]+|(?<!\d)\.(?!\d)|\s+/\s+')


def clauses(text):return CLAUSE_BREAK.split(text)


def source_clauses(excerpt,source):
    """Extend a real quote to its native clauses, so cropping cannot hide a negation."""
    native=unicodedata.normalize('NFKC',source)
    quoted=list(literal_spans(excerpt,native))
    start=0
    for boundary in [*CLAUSE_BREAK.finditer(native),None]:
        end=boundary.start() if boundary else len(native)
        spans=[(max(a,start)-start,min(b,end)-start) for a,b in quoted if a<end and b>start]
        if spans:yield native[start:end],spans
        if boundary:start=boundary.end()


def literal_spans(value,text):
    """Whitespace-insensitive literals, with offsets in the NFKC native text."""
    offsets=[i for i,c in enumerate(text) if not c.isspace()]
    compact=normalized(text);needle=normalized(value);at=compact.find(needle)
    while needle and at>=0:
        yield offsets[at],offsets[at+len(needle)-1]+1
        at=compact.find(needle,at+1)


def negated_or_possible(clause,match):
    before,after=clause[:match.start()],clause[match.end():match.end()+24].lstrip()
    return bool(re.search(r'\b(?:not|never|no)\s*(?:\w+\s+){0,2}$',before,re.I)
        or re.search(r'^(?:(?:하지|되지|되지는|이|가|는|된\s*것[이가]?|한\s*것[이가]?)\s*)?(?:않|아니|아닌|아닙|아님|없|불가)',after)
        or re.search(r'^(?:될|할|되면|하면|시(?:에는|에|\s|$)|여부|가능|검토|논의|문의|해\s*주)',after))


def event_subject(clause,match,event):
    before=clause[:match.start()]
    subjects=[m.start() for m in EVENT_SUBJECT.finditer(before)]
    if event.get('name'):subjects.extend(start for start,_ in literal_spans(event['name'],before))
    others=[m.start() for m in OTHER_SUBJECT.finditer(before)]
    return bool(subjects and (not others or max(subjects)>max(others)))


def observed_operations(evidence,text,event):
    observed=set()
    for clause,spans in source_clauses(evidence,text):
        for candidate,cue in OPERATION_CUES.items():
            if any(any(a<=m.start() and m.end()<=b for a,b in spans)
                   and event_subject(clause,m,event) and not negated_or_possible(clause,m)
                   for m in re.finditer(cue,clause,re.I)):observed.add(candidate)
    return observed


def operation_supported(value,evidence,text,source_url,event=None):
    if not isinstance(value,dict) or value.get('sourceUrl')!=source_url:return False
    state=value.get('state');note=value.get('note')
    if note and normalized(note) not in normalized(evidence):return False
    if state not in OPERATION_CUES:return False
    observed=observed_operations(evidence,text,event or {})
    if state=='SCHEDULED' and not observed:
        # Old dates alone cannot reverse an explicit cancellation in this source.
        native=observed_operations(text,text,event or {})
        return not (native-{'SCHEDULED'}) and bool(source_date_ranges(evidence,text))
    return observed=={state}


# Metadata identifiers and check dates are not claimed source facts. All other
# guide leaves must have literal or narrowly mapped native evidence.
GUIDE_METADATA={'id','checkedOn','ticketId'}
GUIDE_ENUM_CUES={
    'PUBLISHED':r'공개|안내|예매|판매|예약|입장|행사|공연|published',
    'UNPUBLISHED':r'미공개|추후\s*(?:공개|안내)|아직.{0,8}공개.{0,5}(?:안|않)|unpublished',
    'SOLD_OUT':r'매진|품절|sold\s*out',
    'CONFIRMED':r'.',
    'UPCOMING':r'예매\s*예정|판매\s*예정|오픈\s*예정|upcoming',
    'OPEN':r'(?:예매|판매)\s*중(?!단|지)|예약\s*가능|\bopen\b',
    'CLOSED':r'(?:예매|예약|판매).{0,10}(?:종료|마감|중단|중지)|\b(?:closed|suspended|stopped)\b',
    'INCLUDED':r'포함|included', 'SEPARATE':r'별도|separate',
    'STAGE':r'무대|공연|stage', 'DANCE':r'댄스|춤|dance',
    'MEETUP':r'미팅|만남|meetup', 'WORKSHOP':r'워크숍|워크샵|체험|workshop',
    'EXHIBITION':r'전시|exhibition', 'OTHER':r'기타|other',
    'PARTIAL':r'일부|부분|partial',
    'PARTICIPANTS':r'참가|부스|participant', 'SALES':r'판매|sales',
    'PROGRAMS':r'프로그램|공연|program', 'TICKETS':r'티켓|입장권|예매|ticket',
    'FAQ':r'질문|안내|faq', 'KRW':r'원|₩|KRW', 'USD':r'달러|\$|USD',
}

GUIDE_ENUM_FIELDS={'status','bookingState','ticketRequirement','type','kind','currency'}
BOOKING_STATES={'UPCOMING','OPEN','CLOSED','SOLD_OUT'}


def booking_supported(state,evidence,source):
    observed=set()
    for clause,spans in source_clauses(evidence,source):
        for candidate in BOOKING_STATES:
            if any(any(a<=m.start() and m.end()<=b for a,b in spans) and not negated_or_possible(clause,m)
                   for m in re.finditer(GUIDE_ENUM_CUES[candidate],clause,re.I)):
                observed.add(candidate)
    return observed=={state}


GUIDE_SALES_LABEL=re.compile(r'예매|예약|판매|티켓\s*오픈|booking|reservation|sales?|ticket\s*open',re.I)
GUIDE_DAY_LABEL=re.compile(r'방문일|입장일|관람일|수령일|픽업일|프로그램\s*(?:일시|일자)|'+EVENT_LABEL.pattern,re.I)
START_LABEL=re.compile(r'시작|개시|오픈|starts?|opens?',re.I)
END_LABEL=re.compile(r'종료|마감|ends?|closes?',re.I)
NATIVE_TICKET_NAME=re.compile(r'(?:일반|VIP|VVIP|얼리버드|우선|특별|어린이|청소년|성인|오전|오후)\s*(?:입장권|티켓)',re.I)
NATIVE_PROGRAM_NAME=re.compile(r'[가-힣a-zA-Z][^\d.!?;\n]{0,50}?(?:공연|무대|워크숍|워크샵|체험|댄스|미팅|토크쇼|전시)(?=\s*(?:\d|[:：]|안내|시간|일시|공개|$))',re.I)
NATIVE_SALE_TITLE=re.compile(r'[가-힣a-zA-Z][^\d.!?;\n]{0,50}?(?:선입금|예약\s*판매|굿즈\s*판매|사전\s*구매)(?=\s*(?:\d|[:：]|안내|시작|종료|판매|$))',re.I)
NATIVE_FAQ_QUESTION=re.compile(r'[^\n.!?;]{1,120}\?')
COVERAGE_CUES={kind:re.compile(cue,re.I) for kind,cue in {
    'PARTICIPANTS':r'참가|부스|participants?', 'SALES':r'판매|sales?',
    'PROGRAMS':r'프로그램|공연|programs?', 'TICKETS':r'티켓|입장권|예매|tickets?',
    'FAQ':r'질문|FAQ'}.items()}


def guide_row_contexts(row,key,evidence,guide):
    """Return actual named source sections; never join unrelated row fragments."""
    field={'tickets':'name','programs':'name','sales':'title','faq':'question'}.get(key)
    if not field:
        if key=='coverage':
            anchors=sorted((m.start(),m.end(),kind) for kind,cue in COVERAGE_CUES.items() for m in cue.finditer(evidence))
            for i,(start,_,kind) in enumerate(anchors):
                if kind==row.get('kind'):
                    stop=next((a for a,_,other in anchors[i+1:] if other!=kind),len(evidence))
                    yield evidence[start:stop]
        else:yield evidence
        return
    name=row[field];native=unicodedata.normalize('NFKC',evidence)
    names={r[f] for k,f in [('tickets','name'),('programs','name'),('sales','title'),('faq','question')]
           for r in guide.get(k,[])}
    # An extraction can contain only one ticket even when the source lists more.
    names.update(m[0] for m in NATIVE_TICKET_NAME.finditer(native))
    for pattern in (NATIVE_PROGRAM_NAME,NATIVE_SALE_TITLE,NATIVE_FAQ_QUESTION):
        for m in pattern.finditer(native):
            inferred=m[0].strip()
            if not any(normalized(n) in normalized(inferred) for n in names):names.add(inferred)
    anchors=sorted({(a,b,n) for n in names for a,b in literal_spans(n,native)})
    anchors=[(a,b,n) for a,b,n in anchors
             if not any(x<=a and b<=y and (a,b)!=(x,y) for x,y,_ in anchors)]
    def beginning(at):
        previous=max((m.end() for m in CLAUSE_BREAK.finditer(native[:at])),default=0)
        prefix=native[previous:at]
        # Dates commonly precede the row name. Include only an actual date label,
        # not a preceding row's prices, clocks or prose.
        rest=prefix
        for m in reversed(date_matches(prefix)):rest=rest[:m.start()]+rest[m.end():]
        for start,end,_ in reversed(clock_tokens(rest)):rest=rest[:start]+rest[end:]
        rest=GUIDE_DAY_LABEL.sub('',rest)
        rest=re.sub(r'\([월화수목금토일](?:요일)?\)|[\s:：,~∼～–—-]','',rest)
        return previous if date_matches(prefix) and not rest else at
    for index,(a,_,n) in enumerate(anchors):
        if normalized(n)!=normalized(name):continue
        stop=beginning(anchors[index+1][0]) if index+1<len(anchors) else len(native)
        yield native[beginning(a):stop]


def guide_day_ranges(context,heading):
    # A ticket name can contain a booking cue; the nearest actual date-field
    # label distinguishes a visit/program/pickup date from a sales period.
    def mask(match):return ' '*len(match[0])
    native=GUIDE_DAY_LABEL.sub(lambda m:'행사일'.ljust(len(m[0])),context)
    native=NATIVE_TICKET_NAME.sub(mask,native)
    return date_ranges(native,heading)


def temporal_tokens(context,heading):
    """Native date/time pairs, preserving positions and Seoul instants."""
    native=unicodedata.normalize('NFKC',context)
    found=[]
    for m in ISO_TIMESTAMP.finditer(native):
        try:found.append((m.start(),m.end(),source_datetime(m[0])))
        except ValueError:pass
    plain=ISO_TIMESTAMP.sub(lambda m:' '*len(m[0]),native)
    matches=date_matches(plain)
    for i,m in enumerate(matches):
        intervals=date_ranges(m[0],heading)
        if len(intervals)!=1:continue
        d=next(iter(intervals))[0]
        stop=matches[i+1].start() if i+1<len(matches) else len(native)
        after=native[m.end():stop]
        # Only a clock immediately following this date can form its timestamp.
        clocks_here=clock_tokens(after)
        first=clocks_here[0] if clocks_here else None
        if first and re.fullmatch(r'\s*(?:\([월화수목금토일](?:요일)?\))?\s*(?:오전|오후)?\s*',after[:first[0]]):
            found.append((m.start(),m.end()+first[1],source_datetime(d.isoformat()+'T'+first[2]+':00+09:00')))
        else:found.append((m.start(),m.end(),d))
    return sorted(found,key=lambda item:item[0])


def sales_timestamp_supported(key,item,context,heading):
    wanted=source_datetime(item) if len(item)>10 else date.fromisoformat(item)
    tokens=temporal_tokens(context,heading)
    for i,(start,end,value) in enumerate(tokens):
        if isinstance(wanted,datetime):same=isinstance(value,datetime) and value==wanted
        else:same=(value.date() if isinstance(value,datetime) else value)==wanted
        if not same:continue
        before=context[:start]
        # Do not assign event/program clocks to ticket sales timestamps.
        sales=list(GUIDE_SALES_LABEL.finditer(before));days=list(GUIDE_DAY_LABEL.finditer(before))
        if not sales or days and days[-1].start()>sales[-1].start():continue
        starts=list(START_LABEL.finditer(before));ends=list(END_LABEL.finditer(before))
        role='start' if starts and (not ends or starts[-1].start()>ends[-1].start()) else 'end' if ends else None
        # A published sales range binds both endpoints without explicit labels.
        if i+1<len(tokens) and RANGE.fullmatch(context[end:tokens[i+1][0]]):role='start'
        elif i and RANGE.fullmatch(context[tokens[i-1][1]:start]):role='end'
        if role==('start' if key=='salesStartsAt' else 'end'):return True
    return False


def price_supported(item,context):
    # Decimal normalization permits legitimate "8000.00" and zero prices, but
    # unrelated dates, row IDs and clocks are not price evidence.
    amount=Decimal(item)
    for m in re.finditer(r'(?<![\d.])\d[\d,]*(?:\.\d{1,2})?(?![\d.])',context):
        if Decimal(m[0].replace(',',''))!=amount:continue
        before=context[max(0,m.start()-30):m.start()]
        after=context[m.end():m.end()+12]
        if re.match(r'\s*(?:원|₩|KRW|USD|달러|JPY|엔|EUR|유로|[A-Z]{3}\b)',after) or re.search(r'(?:가격|요금|금액|price|fee|₩|\$)\s*[:：]?\s*$',before,re.I):return True
    return False


def guide_supported(value,evidence,text,event,source_url):
    try:validate_guide(value,event.get('occurrences') or [],public_url)
    except (ValueError,TypeError,KeyError):return False
    if not isinstance(value,dict) or not any(value.values()):return False
    def leaf(key,item,context,row):
        if item is None:return True
        if key in GUIDE_METADATA:return True
        if isinstance(item,list):return all(leaf(key,v,context,row) for v in item)
        if not isinstance(item,str):return False
        if key=='sourceUrl':return item==source_url
        if key in ('salesStartsAt','salesEndsAt'):return sales_timestamp_supported(key,item,context,text)
        if key in ('visitDate','day','pickupDay'):
            try:
                d=date.fromisoformat(item)
                return any(a<=d<=b for a,b in guide_day_ranges(context,text))
            except (ValueError,TypeError):return False
        if key in ('entryTime','startTime','endTime','priceAmount'):
            day=row.get('visitDate') or row.get('day') or row.get('pickupDay')
            contexts=[context]
            if day:
                d=date.fromisoformat(day)
                contexts=[block for block in date_blocks(context) if any(a<=d<=b for a,b in guide_day_ranges(block,text))]
            if key=='priceAmount':return any(price_supported(item,block) for block in contexts)
            def clock_supported(block):
                times=event_clocks(block,text)
                if item not in times:return False
                start,end=row.get('startTime'),row.get('endTime')
                return not(start and end) or any(times[i]==start and end in times[i+1:] for i in range(len(times)))
            return any(clock_supported(block) for block in contexts)
        if key in GUIDE_ENUM_FIELDS:
            if item=='UNKNOWN':return True
            if key=='bookingState' or key=='status' and item=='SOLD_OUT':return booking_supported(item,context,text)
            if key=='status' and item in ('PUBLISHED','UNPUBLISHED'):
                unpublished=any(any(a<=m.start() and m.end()<=b for a,b in spans) and not negated_or_possible(clause,m)
                                for clause,spans in source_clauses(context,text)
                                for m in re.finditer(GUIDE_ENUM_CUES['UNPUBLISHED'],clause,re.I))
                if unpublished:return item=='UNPUBLISHED'
                if item=='UNPUBLISHED':return False
            if item in GUIDE_ENUM_CUES:return bool(re.search(GUIDE_ENUM_CUES[item],context,re.I))
        return bool(normalized(item) and normalized(item) in normalized(context))
    return all(any(all(leaf(k,v,context,row) for k,v in row.items())
                       for context in guide_row_contexts(row,key,evidence,value))
               for key,rows in value.items() for row in rows)


def value_supported(key,value,evidence,text,event,source_url):
    if key=='occurrences':return occurrences_supported(value,evidence,text)
    if key in ('venueName','address','admission'):
        normalize=normalized_address if key=='address' else normalized_venue if key=='venueName' else normalized
        return isinstance(value,str) and bool(normalize(value)) and normalize(value) in normalize(evidence)
    if key=='districts':
        return isinstance(value,list) and bool(value) and all(isinstance(v,str) and normalized(v) and normalized(v) in normalized(evidence) for v in value)
    if key=='operationStatus':return operation_supported(value,evidence,text,source_url,event)
    if key=='visitorGuide':return guide_supported(value,evidence,text,event,source_url)
    return False
