import type {EventData} from '../collection/api'
import {SafeLink} from './Shared'
export function FirstVisitSummary({event}:{event:EventData}){
 const rows=event.visitorGuide?.faq.filter(f=>f.status==='CONFIRMED'&&f.answer&&f.sourceUrl&&f.checkedOn&&/입장|대기|재입장|준비물|신분증|예약/.test(f.question)).slice(0,3)??[]
 if(!rows.length)return null
 return <section className="visit-preparation" aria-label="공식 입장 안내"><h2>입장 안내</h2>{rows.map(f=><div key={f.id}><strong>{f.question}</strong><p>{f.answer}</p><small><SafeLink url={f.sourceUrl}>공식 안내 ↗</SafeLink> · {f.checkedOn} 확인</small></div>)}</section>
}
