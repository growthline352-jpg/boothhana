"""v18: Seoul/Gyeonggi only. Incheon is intentionally NOT included."""
import json
from pathlib import Path

FIELDS = json.loads((Path(__file__).parent / 'catalog-taxonomy.json').read_text(encoding='utf-8'))['fields']
GROUPS = {field['code']: [t['code'] for t in field['types']] for field in FIELDS}
CATEGORIES = frozenset(x for values in GROUPS.values() for x in values)
REGIONS = frozenset({'SEOUL','GYEONGGI'})
SCOPES = frozenset({'SEOUL','GYEONGGI','SEOUL_GYEONGGI'})
def category_for(subcategory):
    return next((k for k,v in GROUPS.items() if subcategory in v), None)

def matches_topic(option, subcategory, subjects):
    aliases={s.strip().lower() for s in [option['code'], *option['subjects']]}
    return subcategory in option['types'] or any(s.strip().lower() in aliases for s in subjects)

def topic_review_reasons(subcategory, subjects):
    field=next((f for f in FIELDS if f['code']==category_for(subcategory)),None)
    if not field:return []
    values=[s.strip() for s in subjects or [] if isinstance(s,str) and s.strip()]
    if not values:return ['MISSING_INTEREST_SUBJECTS']
    reasons=[]
    if not any(matches_topic(o,subcategory,values) for o in field['topics']):reasons.append('NO_INTEREST_TOPIC')
    format_codes={o['code'] for o in field['formats']}-{o['code'] for o in field['topics']}
    if all(s in format_codes for s in values):reasons.append('TYPE_ONLY_SUBJECTS')
    return reasons

TOPIC_REVIEW_LABELS={
    'MISSING_INTEREST_SUBJECTS':'취향 주제 확인 필요: 주제 태그가 비어 있습니다.',
    'NO_INTEREST_TOPIC':'취향 주제 확인 필요: 연결되는 관심 주제가 없습니다.',
    'TYPE_ONLY_SUBJECTS':'취향 주제 확인 필요: 행사 유형 코드만 입력되어 있습니다.',
}
def region_errors(region, address, place):
    errors=[]
    if region not in REGIONS: errors.append('서울·경기 개최 확인 안 됨')
    address=(address or '').strip()
    prefixes={'SEOUL':('서울특별시','서울 '),'GYEONGGI':('경기도','경기 ')}
    if address and (region not in prefixes or not address.startswith(prefixes[region])):
        errors.append('지역 코드와 실제 개최 주소 불일치 또는 서울·경기 밖 주소')
    place=(place or '').replace(' ','').lower()
    if any(x in place for x in ('인천','송도컨벤시아','songdoconvensia')):
        errors.append('인천 개최지는 대상 아님')
    if region!='GYEONGGI' and any(x in place for x in ('킨텍스','kintex','수원메쎄','수원컨벤션','suwonmesse')):
        errors.append('경기 전시장과 지역 코드 불일치')
    return errors
