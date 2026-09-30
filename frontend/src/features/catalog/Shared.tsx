import { SaveButton } from '../library/SaveButton'
import type { MemoryTarget } from '../library/types'
import { ReportLink } from '../support/ReportLink'
import type { Target } from '../support/api'
import type { ProductCheck } from './api'
import type { ReactNode } from 'react'
import { ContentImage } from '../../components/ui/ContentImage'
import type { Location, Product, EvidenceScope, PublicAsset } from './api'
export const labels:Record<string,string>={WINE:'주류·와인',WEDDING:'웨딩',LIFESTYLE:'생활·취미',DESIGN:'디자인·아트',BUSINESS:'창업·산업',WALK:'걷기·거리',LIGHT:'불꽃·빛',MUSIC:'음악·공연',FOOD:'먹거리',CULTURE:'지역·문화',COMIC_DOUJIN:'코믹·동인',DOLL:'인형',ONLY_EVENT:'온리전',BIRTHDAY_CAFE:'생일카페',STATIONERY_GOODS:'문구·일러스트·굿즈',PENDING:'검토 대기',REVIEWED:'검토 완료',EXCLUDED:'제외',ASSIGNED:'배정 확인',UNASSIGNED:'미배정',UNKNOWN:'미확인',NOT_APPLICABLE:'해당 없음',PARTIAL:'일부 수집',COMPLETE:'전체 확인 보고',UNPUBLISHED:'미공개',SUCCESS:'정상 종료',RUNNING:'실행 중',FAILED:'실패',STORED:'파일 저장 완료',CANDIDATE:'링크 확보',APPROVED:'사용 승인',REJECTED:'사용 거절',BANNER:'행사 배너',FLOOR_PLAN:'배치도',BOOTH_CUT:'부스컷',SALES_SHEET:'판매표',PRODUCT:'상품 사진',LOGO:'로고',PARTICIPANTS:'참가 부스',SALES:'판매정보',ACTIVE:'이어 수집 대기',BLOCKED:'재확인 필요',REJECTED_ALL:'전체 거절',NO_RESULTS:'확인 결과 없음',REGISTERED_BOOTHS:'등록 부스',BOOTH_CUTS:'부스컷',PRODUCTS:'상품'}
export const scopes:Record<EvidenceScope,string>={EVENT_LISTED:'이번 행사 등록 품목',EVENT_SALE_CONFIRMED:'이번 행사 판매 공지 확인',PROFILE:'취급 분야 · 개별 판매품 미확인',GENERAL_CATALOG:'상시 상품 · 이번 행사 판매 미확인',PAST_REFERENCE:'과거 판매 참고',UNKNOWN:'판매정보 확인 필요'}
export function SafeLink({url,children}:{url:string|null|undefined;children?:ReactNode}) {
 try{if(!url) return <span>미확인</span>;const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return <span>잘못된 링크</span>}
 catch{return <span>잘못된 링크</span>}
 return <a className="catalog-external-link" href={url!} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children||url}</a>
}
export function LocationText({locations}:{locations:Location[]}){return <>{locations.length?locations.map((l,i)=><span className="catalog-location" key={i}>{l.code||labels[l.status]||l.status}{l.hall&&` · ${l.hall}`}{l.zone&&` · ${l.zone}`}{l.startDate&&` · ${l.startDate}${l.endDate!==l.startDate?'~'+l.endDate:''}`}</span>):'위치 미확인'}</>}
export function Pager({page,total,change}:{page:number;total:number;change:(v:number)=>void}){return <nav className="catalog-pager" aria-label="페이지"><button className="btn secondary" disabled={!page} onClick={()=>change(page-1)}>이전</button><span>{page+1} / {Math.max(1,Math.ceil(total/20))} · {total}건</span><button className="btn secondary" disabled={(page+1)*20>=total} onClick={()=>change(page+1)}>다음</button></nav>}
export const saleStates:Record<string,string>={PLANNED:'판매 예정',ON_SALE:'판매 중으로 안내됨',SOLD_OUT:'품절 안내',CANCELED:'판매 취소 안내',UNKNOWN:'판매 상태 미확인'}
function productPrice(product:Product){
 if(!product.price)return '가격 미확인'
 const amount=Number(product.price.amount)
 if(product.price.currency==='KRW'&&Number.isFinite(amount))return amount===0?'무료':`${amount.toLocaleString('ko-KR')}원`
 return `${Number.isFinite(amount)?amount.toLocaleString('ko-KR'):product.price.amount} ${product.price.currency}`
}
export function ProductCard({product,images=[],verification,reportTarget,memoryTarget,day='',hall=''}:{memoryTarget?:MemoryTarget;day?:string;hall?:string;reportTarget?:Target;product:Product;images?:PublicAsset[];verification?:ProductCheck}){
 const inactive=['SOLD_OUT','CANCELED'].includes(product.saleState),stale=verification?.state==='NOT_RECONFIRMED'
 return <article data-product-id={memoryTarget?.id} tabIndex={-1} className="catalog-product">
  <div className="catalog-product-media"><ContentImage url={images[0]?.url} kind="product" alt={product.name}/></div>
  <div className="catalog-product-body"><h3>{product.name}</h3>{memoryTarget&&<SaveButton target={memoryTarget} day={day} hall={hall} compact/>}
   <p className="visit-product-price">{productPrice(product)}</p>
   <div className="visit-product-badges"><span className="chip muted">{scopes[product.evidenceScope]}</span><span className={`chip ${inactive?'warning':'muted'}`}>{saleStates[product.saleState]||saleStates.UNKNOWN}</span></div>
   {stale&&<p className="visit-warning">최근 수집에서 재확인되지 않음 · 현재 판매 여부 확인 필요</p>}
   <p className="catalog-product-description">{product.summary}</p>
   {product.productUrl&&<SafeLink url={product.productUrl}>{inactive||stale?'판매 상태 확인':'판매 공지 확인'} ↗</SafeLink>}
   <details className="visit-product-evidence"><summary>확인일·출처·가격 조건</summary>
    {verification?.state==='LEGACY'&&<small>이전 수집 정보 · 재확인 이력 없음</small>}
    {verification?.lastSeenAt&&<small>마지막 상품 확인: {new Date(verification.lastSeenAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small>}
    {product.price&&<small>표시 기본금액 · {product.price.checkedOn} 확인 · {product.price.note||'옵션·배송비 확인 필요'}</small>}
    <p>{product.subjects.join(' · ')}</p><small>수집 당시 안내이며 현장·실시간 재고를 보장하지 않습니다.</small>
    {product.warnings.length>0&&<div className="catalog-product-warnings">{product.warnings.map((warning,i)=><p key={i}>{warning}</p>)}</div>}
    {product.sources.map((source,i)=><p key={i}><SafeLink url={source.url}>판매 정보 출처 {i+1}</SafeLink></p>)}
   </details>{reportTarget&&<ReportLink target={reportTarget} label="상품 정보 신고"/>}{reportTarget&&images[0]&&<ReportLink target={{namespace:'CATALOG',type:'ASSET',eventId:reportTarget.eventId,id:images[0].id}} label="이미지 문제 신고"/>}{images[0]&&<small>{images[0].credit} · <SafeLink url={images[0].attribution}>이미지 출처</SafeLink></small>}
  </div></article>
}
export function StoredImage({url,alt,loading='lazy',fetchPriority='auto'}:{url:string;alt:string;loading?:'eager'|'lazy';fetchPriority?:'high'|'low'|'auto'}){try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return null}catch{return null}return <img src={url} alt={alt} loading={loading} fetchPriority={fetchPriority} referrerPolicy="no-referrer"/>}
