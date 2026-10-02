import type { VisitorGuide, Occurrence } from '../collection/api'
export const emptyVisitorGuide:VisitorGuide={tickets:[],programs:[],faq:[],sales:[],coverage:[]}
export function visitorGuideError(guide:VisitorGuide,dates:Occurrence[]):string|null {
  const within=(day:string|null)=>!day||dates.some(d=>d.startDate<=day&&d.endDate>=day)
  const evidence=(row:{sourceUrl:string|null;checkedOn:string|null},needed:boolean)=>{
    if(needed&&(!row.sourceUrl||!row.checkedOn))return 'MISSING'
    if(row.sourceUrl){try{const url=new URL(row.sourceUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return 'URL'}catch{return 'URL'}}
    return null
  }
  for(const [key,max] of Object.entries({tickets:40,programs:100,faq:30,sales:30,coverage:8}))if(guide[key as keyof VisitorGuide].length>max)return `한 번에 저장할 수 있는 ${key} 항목 수는 ${max}개입니다.`
  for(const t of guide.tickets){
    if(!t.name.trim())return '입장권 이름을 입력해 주세요.'
    if(!within(t.visitDate))return `${t.name}: 관람일이 행사 운영일 밖에 있습니다.`
    if(evidence(t,['PUBLISHED','SOLD_OUT'].includes(t.status)))return `${t.name}: 올바른 출처 주소와 확인일을 입력해 주세요.`
    if(['UNKNOWN','UNPUBLISHED'].includes(t.status)&&(t.priceAmount!==null||t.entryTime||t.reservationUrl))return `${t.name}: 미확정 입장권은 가격·입장 시간·구매 링크를 비워 주세요.`
    if(t.priceAmount!==null&&(!/^\d{1,12}(\.\d{1,2})?$/.test(t.priceAmount)||!t.currency||!/^[A-Z]{3}$/.test(t.currency)))return `${t.name}: 가격과 통화 코드를 확인해 주세요.`
  }
  for(const p of guide.programs){
    if(!p.name.trim())return '프로그램 이름을 입력해 주세요.'
    if(!within(p.day)||!p.day&&(p.startTime||p.endTime))return `${p.name}: 프로그램 날짜를 확인해 주세요. 날짜 미정이면 시간도 비워 주세요.`
    if(p.startTime&&p.endTime&&p.startTime>=p.endTime)return `${p.name}: 종료 시간은 시작 시간 이후여야 합니다.`
    if(p.ticketId&&!guide.tickets.some(t=>t.id===p.ticketId))return `${p.name}: 연결 입장권을 다시 선택해 주세요.`
    if(evidence(p,['PUBLISHED','SOLD_OUT'].includes(p.status)))return `${p.name}: 올바른 출처 주소와 확인일을 입력해 주세요.`
  }
  for(const f of guide.faq){
    if(!f.question.trim())return 'FAQ 질문을 입력해 주세요.'
    if(f.status==='UNKNOWN'&&f.answer||f.status==='CONFIRMED'&&!f.answer?.trim())return `${f.question}: 답변 확인 상태와 내용을 맞춰 주세요.`
    if(evidence(f,f.status==='CONFIRMED'))return `${f.question}: 올바른 출처 주소와 확인일을 입력해 주세요.`
  }
  for(const s of guide.sales)if(!s.title.trim()||!within(s.pickupDay)||evidence(s,true))return '판매 공지의 제목·수령일·출처·확인일을 확인해 주세요.'
  if(new Set(guide.coverage.map(c=>c.kind)).size!==guide.coverage.length)return '정보 수집 상태의 항목 종류가 중복되었습니다.'
  for(const c of guide.coverage)if(evidence(c,c.status!=='UNKNOWN'))return '정보 수집 상태의 출처·확인일을 확인해 주세요.'
  for(const s of [...guide.tickets,...guide.sales]){
    for(const v of [s.salesStartsAt,s.salesEndsAt])if(v&&!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(v))return '판매 일시를 확인해 주세요.'
    if(s.salesStartsAt&&s.salesEndsAt){
      const dateOnly=s.salesStartsAt.length===10||s.salesEndsAt.length===10
      const day=(v:string)=>v.length===10?v:new Date(Date.parse(v)+9*3600000).toISOString().slice(0,10)
      if(dateOnly?day(s.salesStartsAt)>day(s.salesEndsAt):Date.parse(s.salesStartsAt)>Date.parse(s.salesEndsAt))return '판매 종료일은 시작일 이후여야 합니다.'
    }
  }
  return null
}
