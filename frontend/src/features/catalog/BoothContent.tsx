import { useEffect,useRef } from 'react'
import { useLocation } from 'react-router'
import { SaveButton } from '../library/SaveButton'
import { ShareQr } from '../library/ShareQr'
import { ReportLink,OwnershipLink } from '../support/ReportLink'
import type { PublicAsset, PublicParticipant } from './api'
import { labels, scopes, SafeLink, LocationText, ProductCard, StoredImage } from './Shared'
import { attendance, relevantLocations } from '../visit/visit'
import { ShareButton } from '../visit/ShareButton'

/** Same public-only content in a regular drawer or the map's single fullscreen dialog. */
export function BoothContent({row,assets,day='',hall='',onMap,shareUrl,eventNotice,eventId,viewedVersion}:{
  eventId?:number;viewedVersion?:string;row:PublicParticipant;assets:PublicAsset[];day?:string;hall?:string;onMap?:()=>void;shareUrl?:string;eventNotice?:string|null
}) {
  const content=useRef<HTMLElement>(null),location=useLocation()
  const focusedProduct=new URLSearchParams(location.search).get('product')
  useEffect(()=>{if(!focusedProduct||!/^\d+$/.test(focusedProduct))return;const element=content.current?.querySelector<HTMLElement>(`[data-product-id="${focusedProduct}"]`);if(!element)return;const details=element.closest('details');if(details)details.open=true;const frame=requestAnimationFrame(()=>{element.scrollIntoView({block:'nearest'});element.focus({preventScroll:true})});return()=>cancelAnimationFrame(frame)},[focusedProduct,row.id])
  const promos = assets.filter(a => a.productId === null)
  // A private/unreviewed sales object must not leak through residual product rows.
  const products=row.sales?(row.productRows??row.sales.products.map(data=>({id:null,data}))):[]
  const atEvent=products.filter(p=>['EVENT_LISTED','EVENT_SALE_CONFIRMED'].includes(p.data.evidenceScope))
  const references=products.filter(p=>!['EVENT_LISTED','EVENT_SALE_CONFIRMED'].includes(p.data.evidenceScope))
  const state=attendance(row,day,hall),locations=relevantLocations(row.participant.locations,day,hall)
  return <section ref={content} className="catalog-drawer-content">
      <LocationText locations={locations}/>{eventNotice&&<p className="visit-important-note">{eventNotice}</p>}
      {state!=='confirmed'&&<p className="visit-warning">{state==='other'?'선택한 날짜·전시관에는 이 부스의 참가 위치가 등록되어 있지 않아요.':'선택한 날짜·전시관의 참가 여부를 아직 확인하지 못했어요.'}</p>}
      <p className="catalog-summary">{row.sales?.summary||'판매정보를 확인하고 있어요.'}</p>
      <div className="row-actions">{eventId&&<SaveButton target={{type:'PARTICIPANT',eventId,id:row.id,participantId:row.id}} day={day} hall={hall}/ >}{onMap&&<button type="button" className="btn secondary" onClick={onMap}>지도에서 보기</button>}{eventId?<ShareQr target={{type:'PARTICIPANT',eventId,id:row.id,participantId:row.id}} day={day} hall={hall} title={row.participant.registrationName}/>:shareUrl&&<ShareButton title={row.participant.registrationName} url={shareUrl} label="부스 공유"/>}</div>
      {eventId&&<div className="row-actions"><ReportLink target={{namespace:'CATALOG',type:'PARTICIPANT',eventId,id:row.id,day,hall}} label="부스 정보 신고" viewedVersion={viewedVersion}/><OwnershipLink eventId={eventId} participantId={row.id}/></div>}
      <p className="item-meta">{row.participant.members.map(m=>m.name).join(' · ')}</p>
      {row.sales&&<><p className="item-meta">{scopes[row.sales.evidenceScope]}</p>{row.sales.warnings.map((w,i)=><p className="visit-warning" key={i}>{w}</p>)}</>}
      <h3>이번 행사 상품 안내 · {atEvent.length}개</h3><p className="item-meta">행사 등록·판매 공지 기준이며 현장 재고를 보장하지 않아요.</p>
      <div className="catalog-products">{atEvent.map((p,i)=><ProductCard memoryTarget={eventId&&p.id?{type:'PRODUCT',eventId,id:p.id,participantId:row.id}:undefined} day={day} hall={hall} reportTarget={eventId&&p.id?{namespace:'CATALOG',type:'PRODUCT',eventId,id:p.id,day,hall}:undefined} key={p.id??i} product={p.data} verification={'verification' in p?p.verification:undefined} images={assets.filter(a=>p.id!==null&&a.productId===p.id)}/>)}</div>
      {!atEvent.length&&<p>이번 행사에서 판매한다고 확인된 개별 상품은 아직 없어요. 아래 참고 정보와 공식 안내를 확인하세요.</p>}
      {references.length>0&&<details className="visit-reference-products"><summary>평소·과거 판매 및 취급 참고 · {references.length}개</summary><p className="visit-warning">이 상품들이 이번 행사에 나온다는 뜻은 아닙니다.</p><div className="catalog-products">{references.map((p,i)=><ProductCard memoryTarget={eventId&&p.id?{type:'PRODUCT',eventId,id:p.id,participantId:row.id}:undefined} day={day} hall={hall} reportTarget={eventId&&p.id?{namespace:'CATALOG',type:'PRODUCT',eventId,id:p.id,day,hall}:undefined} key={p.id??i} product={p.data} verification={'verification' in p?p.verification:undefined} images={assets.filter(a=>p.id!==null&&a.productId===p.id)}/>)}</div></details>}
      {promos.length>0&&<details><summary>부스 홍보 이미지·판매표</summary><div className="catalog-promos">{promos.map(a=><figure key={a.id}><StoredImage url={a.url} alt={a.caption||labels[a.type]}/><figcaption>{labels[a.type]} · {a.credit} · <SafeLink url={a.attribution}>출처</SafeLink>{eventId&&<ReportLink target={{namespace:'CATALOG',type:'ASSET',eventId,id:a.id}} label="이미지 문제 신고"/>}</figcaption></figure>)}</div></details>}
      <details><summary>다른 날짜 위치·주제·판매 방식</summary><LocationText locations={row.participant.locations}/>{row.sales&&<><p>취급 품목: {row.sales.categories.join(', ')}</p><p>작품·주제: {row.sales.subjects.join(', ')}</p><p>{row.sales.salesMethod}</p></>}</details>
      <div className="row-actions">{row.participant.officialLinks.map((url,i)=><SafeLink key={i} url={url}>참가자 공식 안내 {i+1}</SafeLink>)}</div>
    </section>
}
