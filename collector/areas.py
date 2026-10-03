"""Administrative districts backed by event location, not organizer location."""
DISTRICTS={'강남구','서초구','송파구','강동구','마포구','서대문구','은평구','종로구','중구','용산구','성동구','광진구','강서구','양천구','영등포구','구로구','금천구','동작구','관악구','동대문구','성북구','중랑구','강북구','도봉구','노원구'}
def district_errors(event):
    districts=event.get('districts') or []
    if not isinstance(districts,list) or any(not isinstance(d,str) or d not in DISTRICTS for d in districts):return ['서울 구 정보 형식 오류']
    if len(districts)!=len(set(districts)) or len(districts)>25:return ['서울 구 정보 중복/항목 수 오류']
    if districts and event.get('region')!='SEOUL':return ['서울 구 정보와 개최 지역 불일치']
    return []
