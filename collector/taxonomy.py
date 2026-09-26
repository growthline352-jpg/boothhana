"""v18: Seoul/Gyeonggi only. Incheon is intentionally NOT included."""
GROUPS = {'SUBCULTURE': ['COMIC_DOUJIN', 'DOLL', 'ONLY_EVENT', 'BIRTHDAY_CAFE', 'STATIONERY_GOODS'], 'EXHIBITION': ['WINE', 'WEDDING', 'LIFESTYLE', 'DESIGN', 'BUSINESS'], 'FESTIVAL': ['WALK', 'LIGHT', 'MUSIC', 'FOOD', 'CULTURE']}
CATEGORIES = frozenset(x for values in GROUPS.values() for x in values)
REGIONS = frozenset({'SEOUL','GYEONGGI'})
SCOPES = frozenset({'SEOUL','GYEONGGI','SEOUL_GYEONGGI'})
def category_for(subcategory):
    return next((k for k,v in GROUPS.items() if subcategory in v), None)
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
