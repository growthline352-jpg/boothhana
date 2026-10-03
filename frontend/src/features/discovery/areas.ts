export const seoulAreas=[
  {code:'GANGNAM_SEOCHO',label:'강남·서초',districts:['강남구','서초구']},
  {code:'SONGPA_GANGDONG',label:'송파·강동',districts:['송파구','강동구']},
  {code:'NORTHWEST',label:'마포·서대문·은평',districts:['마포구','서대문구','은평구']},
  {code:'CENTRAL',label:'종로·중구·용산',districts:['종로구','중구','용산구']},
  {code:'SEONGDONG_GWANGJIN',label:'성동·광진',districts:['성동구','광진구']},
  {code:'GANGSEO_YANGCHEON',label:'강서·양천',districts:['강서구','양천구']},
  {code:'SOUTHWEST',label:'영등포·구로·금천',districts:['영등포구','구로구','금천구']},
  {code:'DONGJAK_GWANAK',label:'동작·관악',districts:['동작구','관악구']},
  {code:'NORTHEAST',label:'동대문·성북·중랑·강북·도봉·노원',districts:['동대문구','성북구','중랑구','강북구','도봉구','노원구']},
] as const
export function parseAreas(value:string|null){return seoulAreas.filter(a=>(value??'').split(',').includes(a.code)).map(a=>a.code).join(',')}
export const areaLabel=(code:string)=>seoulAreas.find(a=>a.code===code)?.label??code
