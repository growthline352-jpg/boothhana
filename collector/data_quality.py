"""Pure event completeness rules for recurring, source-backed enrichment.

The weekly discovery job finds events broadly. This module identifies gaps in
already-known events and only fills previously empty fields; it never overwrites
reviewed facts or changes the fields that define event identity.
"""
from __future__ import annotations
from copy import deepcopy
from taxonomy import GROUPS
from datetime import date
import re

IDENTITY_FIELDS = ('name', 'subcategory', 'organizer', 'edition', 'region', 'venueName')

def _blank(value):
    return value is None or isinstance(value, str) and not value.strip()

def missing_reasons(event: dict) -> list[str]:
    reasons = []
    if _blank(event.get('address')): reasons.append('MISSING_ADDRESS')
    if _blank(event.get('admission')): reasons.append('MISSING_ADMISSION')
    occurrences = event.get('occurrences') or []
    if any(_blank(row.get('startTime')) or _blank(row.get('endTime')) for row in occurrences): reasons.append('MISSING_HOURS')
    links = event.get('discoveryLinks') or []
    if event.get('eventFormat') == 'MULTI_BOOTH' and not any(row.get('kind') == 'PARTICIPANTS' and row.get('url') and row.get('status') == 'PUBLISHED' for row in links):
        reasons.append('MISSING_PARTICIPANT_SOURCE')
    if event.get('eventFormat') == 'MULTI_BOOTH' and not any(row.get('kind') == 'FLOOR_PLAN' and row.get('url') and row.get('status') == 'PUBLISHED' for row in links):
        reasons.append('MISSING_FLOORPLAN_SOURCE')
    if event.get('eventFormat') == 'MULTI_BOOTH' and not any(row.get('kind') == 'SALES' and row.get('url') and row.get('status') == 'PUBLISHED' for row in links):
        reasons.append('MISSING_SALES_SOURCE')
    if not any(row.get('matchesEdition') is True for row in event.get('banners') or []): reasons.append('MISSING_CURRENT_BANNER')
    if event.get('subcategory') in GROUPS['SUBCULTURE'] and not event.get('visitorGuide'):reasons.append('MISSING_VISITOR_GUIDE')
    return reasons

def _norm(value):
    return re.sub(r'\s+', '', str(value or '')).casefold()

def same_event(original: dict, observed: dict) -> bool:
    if _norm(original.get('name')) != _norm(observed.get('name')): return False
    original_dates = {(row.get('startDate'), row.get('endDate')) for row in original.get('occurrences') or []}
    observed_dates = {(row.get('startDate'), row.get('endDate')) for row in observed.get('occurrences') or []}
    return bool(original_dates and original_dates & observed_dates)

def _unique(existing: list, incoming: list, key, limit: int) -> list:
    result = deepcopy(existing)
    seen = {key(row) for row in result}
    for row in incoming:
        identity = key(row)
        if identity in seen: continue
        seen.add(identity); result.append(deepcopy(row))
        if len(result) >= limit: break
    return result

def merge_enrichment(original: dict, observed: dict) -> dict:
    """Fill gaps from a verified observation while preserving existing facts and identity."""
    if not same_event(original, observed): raise ValueError('Enrichment result does not match the target event')
    merged = deepcopy(original)
    for field in IDENTITY_FIELDS:
        merged[field] = deepcopy(original.get(field))
    for field in ('address', 'admission', 'description'):
        if _blank(merged.get(field)) and not _blank(observed.get(field)): merged[field] = deepcopy(observed[field])
    if merged.get('eventFormat') == 'UNKNOWN' and observed.get('eventFormat') in ('MULTI_BOOTH', 'SINGLE_HOST'):
        merged['eventFormat'] = observed['eventFormat']

    incoming_occurrences = {(row.get('startDate'), row.get('endDate')): row for row in observed.get('occurrences') or []}
    for row in merged.get('occurrences') or []:
        incoming = incoming_occurrences.get((row.get('startDate'), row.get('endDate')))
        if not incoming: continue
        for field in ('startTime', 'endTime'):
            if _blank(row.get(field)) and not _blank(incoming.get(field)): row[field] = incoming[field]

    merged['subjects'] = _unique(merged.get('subjects') or [], observed.get('subjects') or [], _norm, 20)
    merged['sources'] = _unique(merged.get('sources') or [], observed.get('sources') or [], lambda row: row.get('url'), 5)
    merged['banners'] = _unique(merged.get('banners') or [], observed.get('banners') or [], lambda row: (row.get('imageUrl'), row.get('pageUrl')), 3)
    merged['warnings'] = _unique(merged.get('warnings') or [], observed.get('warnings') or [], _norm, 20)

    links = deepcopy(merged.get('discoveryLinks') or [])
    for incoming in observed.get('discoveryLinks') or []:
        duplicate = next((row for row in links if row.get('kind') == incoming.get('kind') and row.get('url') == incoming.get('url')), None)
        if duplicate: continue
        placeholder = next((row for row in links if row.get('kind') == incoming.get('kind') and not row.get('url')), None)
        if placeholder and incoming.get('url'): links[links.index(placeholder)] = deepcopy(incoming)
        elif len(links) < 20: links.append(deepcopy(incoming))
    merged['discoveryLinks'] = links
    incoming_guide=observed.get('visitorGuide')
    if incoming_guide:
        if not merged.get('visitorGuide'):merged['visitorGuide']=deepcopy(incoming_guide)
        else:
            for kind,limit in [('tickets',40),('programs',100),('faq',30),('sales',30),('coverage',8)]:
                key='kind' if kind=='coverage' else 'id'
                rows=merged['visitorGuide'].get(kind) or []
                for incoming in incoming_guide.get(kind) or []:
                    old=next((row for row in rows if row[key]==incoming[key]),None)
                    if old is None and len(rows)<limit:rows.append(deepcopy(incoming))
                    elif old and old.get('status') in ('UNKNOWN','UNPUBLISHED','INACCESSIBLE') and incoming.get('sourceUrl') and incoming.get('checkedOn') and incoming.get('status') in ('PUBLISHED','CONFIRMED','PARTIAL'):rows[rows.index(old)]=deepcopy(incoming)
                merged['visitorGuide'][kind]=rows

    old_status = merged.get('operationStatus') or {'state': 'UNKNOWN', 'note': None, 'sourceUrl': None, 'checkedOn': None}
    new_status = observed.get('operationStatus') or {}
    if new_status.get('state') != 'UNKNOWN' and new_status.get('sourceUrl') and new_status.get('checkedOn'):
        if old_status.get('state') == 'UNKNOWN' or str(new_status['checkedOn']) >= str(old_status.get('checkedOn') or ''):
            merged['operationStatus'] = deepcopy(new_status)
    return merged

def target_priority(target: dict, attempts: dict, priority_keywords: list[str]):
    event = target['event']; event_id = str(target['id'])
    last = str((attempts.get(event_id) or {}).get('checkedAt') or '')
    priority = 0 if any(_norm(word) in _norm(event.get('name')) for word in priority_keywords if _norm(word)) else 1
    start = min((row.get('startDate') or '9999-12-31' for row in event.get('occurrences') or []), default='9999-12-31')
    # Never/oldest attempted first prevents a permanently unpublished event from starving others.
    return (not target.get('informationRequested',False), bool(last), last, priority, start, int(target['id']))

def select_targets(targets: list[dict], attempts: dict, limit: int, priority_keywords: list[str]) -> list[dict]:
    candidates = [target for target in targets if target.get('informationRequested') or missing_reasons(target.get('event') or {})]
    return sorted(candidates, key=lambda target: target_priority(target, attempts, priority_keywords))[:limit]

def attempt_record(event: dict, status: str) -> dict:
    return {'checkedAt': date.today().isoformat(), 'status': status, 'reasons': missing_reasons(event)}
