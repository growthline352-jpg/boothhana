"""Durable completion for one unchanged event/source version, not a timer."""
from __future__ import annotations
import hashlib
import json

TERMINAL = {'COMPLETE', 'UNAVAILABLE', 'EXHAUSTED'}
METHODS = ('SOURCE_DETAILS', 'ORGANIZER_SEARCH', 'VENUE_SEARCH')


def facts(value):
    if isinstance(value, dict):
        return {key: facts(row) for key, row in value.items()
                if key not in ('checkedOn', 'checkedAt', 'lastSeenAt', 'updatedAt', 'warnings', 'evidence')}
    if isinstance(value, list):
        return [facts(row) for row in value]
    return value


def fingerprint(event, *, requested=False, policy=None):
    data = [facts(event), bool(requested), policy]
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode()).hexdigest()


def enrichment_due(target, attempt):
    stamp = fingerprint(target.get('event') or {}, requested=target.get('informationRequested'))
    if target.get('repairSourceFailure') and not attempt.get('sourceFailureChecked'):return True
    # Recover terminal records written by the old failure/exhaustion policy.
    if attempt.get('resolution') == 'EXHAUSTED' and (attempt.get('status')!='SUCCESS' or any(row.get('status')!='SUCCESS' for row in attempt.get('methods',[]))):return True
    return not (attempt.get('fingerprint') == stamp and attempt.get('resolution') in TERMINAL)


def method_context(method, history=()):
    instructions = {
        'SOURCE_DETAILS': '등록된 개별 원문과 상세 본문·첨부 이미지를 먼저 확인한다.',
        'ORGANIZER_SEARCH': '행사명·회차·주최자 이름으로 주최 공식 홈페이지·개별 SNS 공지를 찾는다. 실패한 검색어를 그대로 반복하지 않는다.',
        'VENUE_SEARCH': '행사명·회차·장소로 전시장 일정·공식 예매처·공공기관 공지 등 다른 공식 경로를 찾는다. 기존 실패 URL만 다시 열고 끝내지 않는다.',
    }
    return dict(method=method, instruction=instructions[method], previousAttempts=list(history))
