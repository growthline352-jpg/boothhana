import type {PublicEvent} from './api'
import { SafeLink } from './Shared'
import { dateLabel } from '../discovery/browse'
import { InformationRequestButton } from '../support/InformationRequestButton'
import './visitorGuide.css'

const statusLabels:Record<string,string>={PUBLISHED:'공개 정보 확인',PARTIAL:'일부 수집',UNPUBLISHED:'미공개',UNKNOWN:'확인 중',INACCESSIBLE:'원문 접근 실패',SOLD_OUT:'매진 안내'}
const kinds:Record<string,string>={PARTICIPANTS:'참가 명단',SALES:'상품·판매 안내',PROGRAMS:'프로그램',TICKETS:'예매 안내',FAQ:'이용 안내'}
function guideDate(value:string|null) {
  if(!value)return '미확인'
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return dateLabel(value)+' (시각 미공개)'
  const d=new Date(value)
  return Number.isNaN(d.getTime())?'미확인':d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
}
function Evidence({source,checked}:{source:string|null;checked:string|null}) {
  return <p className="guide-evidence">{source&&<SafeLink url={source}>안내 원문 확인 ↗</SafeLink>}{checked&&<small> · {checked} 확인</small>}</p>
}
export function VisitorGuide({value,day}:{value:PublicEvent;day:string}) {
  const guide=value.event.visitorGuide
  const programGroups=[
    {key:'scheduled',label:`${day?dateLabel(day):'날짜별'} 프로그램`,programs:(guide?.programs??[]).filter(p=>p.day===day)},
    {key:'undated',label:'요일 미확인 프로그램',programs:(guide?.programs??[]).filter(p=>!p.day)},
  ].filter(group=>group.programs.length>0)
  const products=value.participants.reduce((count,r)=>count+(r.sales?.products.length??0),0)
  const coverage=guide?.coverage.length?guide.coverage:(value.event.discoveryLinks??[]).filter(l=>['PARTICIPANTS','SALES'].includes(l.kind)).map(l=>({kind:l.kind,status:l.status==='PUBLISHED'?'PARTIAL':l.status,note:l.note,sourceUrl:l.url,checkedOn:null}))
  return <section className="visitor-guide panel" aria-label="예매·프로그램·수집 안내">
    <div className="guide-heading"><h2>예매·프로그램 안내</h2><InformationRequestButton kind="PROGRAM" eventId={value.id} day={day}/></div>
    {!!guide?.tickets.length&&<section aria-label="예매권 안내"><h3>입장권·예매 일정</h3><div className="guide-grid">{guide.tickets.map(t=><article className="guide-card" key={t.id}>
      <h4>{t.name}{t.visitDate&&<small> · {dateLabel(t.visitDate)}</small>}</h4>
      <p>{t.priceAmount!==null?`${Number(t.priceAmount).toLocaleString('ko-KR')}${t.currency==='KRW'?'원':` ${t.currency}`}`:'가격 확인 중'}</p>
      {(t.salesStartsAt||t.salesEndsAt)&&<p>예매 {t.salesStartsAt?guideDate(t.salesStartsAt):'시작 미확인'}{t.salesEndsAt?` ~ ${guideDate(t.salesEndsAt)}`:''}</p>}
      {t.entryTime&&<p>입장 {t.entryTime}</p>}<span className="chip muted">{statusLabels[t.status]??'확인 중'}</span>
      {t.note&&<p>{t.note}</p>}{t.reservationUrl&&<SafeLink url={t.reservationUrl}>예매 안내 바로가기 ↗</SafeLink>}<Evidence source={t.sourceUrl} checked={t.checkedOn}/>
    </article>)}</div></section>}
    {programGroups.map(group=><section key={group.key} aria-label={group.label}><h3>{group.label}</h3><div className="guide-grid">{group.programs.map(p=><article className="guide-card" key={p.id}>
      <h4>{p.name}</h4><p>{p.startTime?`${p.startTime}${p.endTime?` ~ ${p.endTime}`:''}`:'시간 확인 중'}{p.venue?` · ${p.venue}`:''}</p>
      <p>{p.ticketRequirement==='SEPARATE'?'별도 티켓 필요':p.ticketRequirement==='INCLUDED'?'행사 입장권에 포함':'입장 조건 확인 중'}</p>
      {!!p.subjects.length&&<p>{p.subjects.join(' · ')}</p>}{p.note&&<p>{p.note}</p>}
      {p.ticketId&&guide?.tickets.find(t=>t.id===p.ticketId)&&<p>연결 예매권: {guide.tickets.find(t=>t.id===p.ticketId)?.name}</p>}
      <Evidence source={p.sourceUrl} checked={p.checkedOn}/>
    </article>)}</div></section>)}
    {!!guide?.sales.length&&<section aria-label="공식 판매 공지"><h3>공식 판매·선입금 공지</h3>{guide.sales.map(s=><article className="guide-card" key={s.id}><h4>{s.title}</h4>{s.salesMethod&&<p>{s.salesMethod}</p>}{s.salesStartsAt&&<p>판매 시작 {guideDate(s.salesStartsAt)}</p>}{s.salesEndsAt&&<p>판매 마감 {guideDate(s.salesEndsAt)}</p>}{s.note&&<p>{s.note}</p>}<Evidence source={s.sourceUrl} checked={s.checkedOn}/></article>)}</section>}
    {!!guide?.faq.length&&<section aria-label="회차별 이용 안내"><h3>자주 묻는 질문</h3>{guide.faq.map(f=><details key={f.id}><summary>{f.question}</summary><p>{f.status==='CONFIRMED'?f.answer:'이번 회차의 안내를 확인하고 있어요. 과거 회차 규정으로 확정하지 않습니다.'}</p><Evidence source={f.sourceUrl} checked={f.checkedOn}/></details>)}</section>}
    <section className="guide-coverage" aria-label="정보 수집 상태"><h3>현재 소개하는 정보</h3><p>부스 {value.participants.length}곳 · 상품 항목 {products}개. 소개된 수이며 행사 전체 규모를 뜻하지 않습니다.</p>
      {coverage.map((c,i)=><div key={`${c.kind}:${i}`}><strong>{kinds[c.kind]??c.kind}</strong><span className="chip muted">{statusLabels[c.status]??'확인 중'}</span>{c.note&&<p>{c.note}</p>}<Evidence source={c.sourceUrl} checked={c.checkedOn}/></div>)}
      <p>미수집과 미참가는 다릅니다. 상품의 판매 상태는 확인 당시 안내이며 현장 재고·대기시간을 보장하지 않습니다.</p>
    </section>
  </section>
}
