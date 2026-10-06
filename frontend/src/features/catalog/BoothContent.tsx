import { SaveButton } from '../library/SaveButton'
import { ShareQr } from '../library/ShareQr'
import { ReportLink, OwnershipLink } from '../support/ReportLink'
import type { PublicAsset, PublicParticipant } from './api'
import { scopes, SafeLink, LocationText } from './Shared'
import { ContentImage } from '../../components/ui/ContentImage'
import { attendance, relevantLocations } from '../visit/visit'
import { ShareButton } from '../visit/ShareButton'

/** Public booth summary used inside the floor-plan fullscreen dialog. */
export function BoothContent({row,assets,day='',hall='',onMap,shareUrl,eventNotice,eventId,viewedVersion}:{
  eventId?:number;viewedVersion?:string;row:PublicParticipant;assets:PublicAsset[];day?:string;hall?:string;onMap?:()=>void;shareUrl?:string;eventNotice?:string|null
}) {
  const state=attendance(row,day,hall),locations=relevantLocations(row.participant.locations,day,hall)
  const images=assets.filter(asset=>['BOOTH_CUT','LOGO','SALES_SHEET','PRODUCT'].includes(asset.type))
    .filter((asset,index,values)=>values.findIndex(value=>value.url===asset.url)===index).slice(0,3)
  const topics=[...new Set([...row.participant.subjects,...(row.sales?.subjects??[]),...(row.sales?.categories??[])].filter(Boolean))].slice(0,6)
  return <section className="catalog-drawer-content booth-map-detail">
    <LocationText locations={locations}/>
    {eventNotice&&<p className="visit-important-note">{eventNotice}</p>}
    {state!=='confirmed'&&<p className="visit-warning">{state==='other'?'선택한 날짜·전시관에는 이 부스의 참가 위치가 등록되어 있지 않아요.':'선택한 날짜·전시관의 참가 여부를 아직 확인하지 못했어요.'}</p>}
    <p className="catalog-summary">{row.participant.description?.trim()||(row.salesSummaryOrigin==='EDITORIAL'?'':row.sales?.summary)||topics.join(' · ')||'공개된 부스 소개를 확인하고 있어요.'}</p>
    {row.salesSummaryOrigin==='EDITORIAL'&&row.sales?.summary&&<section aria-label="판매 안내"><h3>판매 안내</h3><p className="preserve-lines">{row.sales.summary}</p></section>}
    {topics.length>0&&<div className="booth-detail-tags">{topics.map(topic=><span key={topic}>{topic}</span>)}</div>}
    <div className="row-actions">
      {eventId&&<SaveButton target={{type:'PARTICIPANT',eventId,id:row.id,participantId:row.id}} day={day} hall={hall}/>}
      {onMap&&<button type="button" className="btn secondary" onClick={onMap}>지도에서 보기</button>}
      {eventId?<ShareQr target={{type:'PARTICIPANT',eventId,id:row.id,participantId:row.id}} day={day} hall={hall} title={row.participant.registrationName}/>:shareUrl&&<ShareButton title={row.participant.registrationName} url={shareUrl} label="부스 공유"/>}
    </div>
    <div className="booth-map-gallery">{images.length?images.map(asset=><figure key={asset.id}><ContentImage url={asset.url} kind="booth" alt={asset.caption||row.participant.registrationName}/></figure>):<figure><ContentImage url={null} kind="booth" alt=""/></figure>}</div>
    <dl className="booth-map-facts">
      <div><dt>참가 작가·업체</dt><dd>{row.participant.members.map(member=>member.name).join(' · ')||'별도 명칭 미확인'}</dd></div>
      <div><dt>정보 범위</dt><dd>{row.sales?scopes[row.sales.evidenceScope]:'참가 부스 정보만 확인'}</dd></div>
    </dl>
    {eventId&&<div className="row-actions"><ReportLink target={{namespace:'CATALOG',type:'PARTICIPANT',eventId,id:row.id,day,hall}} label="부스 정보 신고" viewedVersion={viewedVersion}/><OwnershipLink eventId={eventId} participantId={row.id}/></div>}
    <div className="row-actions">{row.participant.officialLinks.map((url,index)=><SafeLink key={url} url={url}>참가자 공식 안내 {index+1}</SafeLink>)}</div>
  </section>
}
