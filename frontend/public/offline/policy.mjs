/** Explicit public projection. Never store raw API bodies, account records, notes or reservations. */
export const VERSION = 19
export const TTL = 7 * 24 * 60 * 60 * 1000
export const MAX_PACKS = 5
export const MAX_TOTAL = 60 * 1024 * 1024
export const MAX_PACK = 20 * 1024 * 1024
export const MAX_FILE = 8 * 1024 * 1024
export const MAX_JSON = 4 * 1024 * 1024
export const MAX_IMAGES = 24
const text = (s, max = 2000) => typeof s === 'string' ? s.slice(0, max) : ''
const arr = x => Array.isArray(x) ? x : []
export const positiveId = x => Number.isSafeInteger(x) && x > 0
export function safeLink(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : '' } catch { return '' }
}
export function apiOrigin(value) {
  const u = new URL(value)
  if (u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw Error('API 주소 설정을 확인해 주세요.')
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) throw Error('HTTPS 또는 로컬 테스트 API만 허용합니다.')
  return u.origin
}
export function liveMedia(raw, planResponse) {
  const assets = new Map(), managed = new Set(arr(planResponse?.managedAssetIds))
  for (const a of arr(raw.assets)) {
    if (!positiveId(a.id) || a.offlineAllowed !== true || !safeLink(a.url)) continue
    // Managed floor plans must use the current READY version, not an older raw image.
    if (a.type === 'FLOOR_PLAN' && managed.has(a.id)) continue
    assets.set('asset:' + a.id, {key: 'asset:' + a.id, id: a.id, url: safeLink(a.url), type: text(a.type,30),
      participantId: positiveId(a.participantId) ? a.participantId : null, productId: positiveId(a.productId) ? a.productId : null,
      caption: text(a.caption,255), credit: text(a.credit,1000), source: safeLink(a.attribution)})
  }
  for (const p of arr(planResponse?.plans)) {
    if (p.state !== 'READY' || p.offlineAllowed !== true || !positiveId(p.assetId) || !safeLink(p.imageUrl)) continue
    const key = 'plan:' + text(p.id,100)
    assets.set(key, {key, id:p.assetId,url:safeLink(p.imageUrl), type:'FLOOR_PLAN', participantId:null,productId:null,
      caption:text(p.scope?.title,255), credit:text(p.credit,1000),source:safeLink(p.sourceUrl),
      sha256:typeof p.sourceSha256==='string'&&/^[a-f0-9]{64}$/i.test(p.sourceSha256)?p.sourceSha256.toLowerCase():null,
      dates:arr(p.scope?.dates).map(d=>text(d,10)), hall:text(p.scope?.hall,150),partial:p.partial===true})
  }
  return [...assets.values()]
}
export function buildPackage(raw, plans, selection=[], day='', now=Date.now()) {
  if (!raw || !positiveId(raw.id) || !raw.event || !['SEOUL','GYEONGGI'].includes(raw.event.region) || !Array.isArray(raw.participants)) throw Error('공개 행사 응답이 올바르지 않습니다.')
  if (raw.participants.length > 2000) throw Error('참가 부스가 너무 많아 이번 오프라인 저장 한도를 넘습니다.')
  const e=raw.event, chosen=new Set(arr(selection).filter(x=>positiveId(x.id)&&['PARTICIPANT','PRODUCT'].includes(x.type)).map(x=>x.type+':'+x.id))
  const participants=raw.participants.map(p=>{
    if (!positiveId(p.id) || !p.participant) throw Error('공개 부스 정보가 올바르지 않습니다.')
    const src=p.participant
    const products=arr(p.productRows ?? arr(p.sales?.products).map(data=>({id:null,data}))).map(row=>{
      const x=row.data || {}, id=positiveId(row.id)?row.id:null
      return {id,name:text(x.name,255),summary:text(x.summary),price:x.price?{amount:text(x.price.amount,30),currency:text(x.price.currency,3),checkedOn:text(x.price.checkedOn,10)}:null,
        saleState:text(x.saleState,30),evidenceScope:text(x.evidenceScope,40),verification:text(row.verification?.state,40),lastSeenAt:text(row.verification?.lastSeenAt,50),
        productUrl:safeLink(x.productUrl),selected:id!==null&&chosen.has('PRODUCT:'+id),sources:arr(x.sources).map(s=>safeLink(s.url)).filter(Boolean)}
    })
    return {id:p.id,name:text(src.registrationName,255),summary:text(p.sales?.summary),subjects:arr(src.subjects).map(v=>text(v,100)),
      selectedDirect:chosen.has('PARTICIPANT:'+p.id),
      selected:chosen.has('PARTICIPANT:'+p.id)||products.some(x=>x.selected),
      locations:arr(src.locations).map(l=>({code:text(l.code,100),status:text(l.status,30),hall:text(l.hall,150),zone:text(l.zone,150),startDate:text(l.startDate,10),endDate:text(l.endDate,10)})),
      links:arr(src.officialLinks).map(safeLink).filter(Boolean),products}
  })
  if (participants.reduce((n,p)=>n+p.products.length,0)>5000) throw Error('상품 수가 오프라인 저장 한도를 넘습니다.')
  const allMedia=liveMedia(raw,plans)
  // Prefer map images, then selected products/booths, then explicitly selected banner only.
  const selectedParticipants=new Set(participants.filter(p=>p.selected).map(p=>p.id))
  const eligible=allMedia.filter(a=>a.type==='FLOOR_PLAN'||chosen.has('PRODUCT:'+a.productId)||selectedParticipants.has(a.participantId)||a.id===raw.banner?.id)
    .sort((a,b)=>Number(b.type==='FLOOR_PLAN')-Number(a.type==='FLOOR_PLAN'))
  const media=eligible.slice(0,MAX_IMAGES)
  const packageData={version:VERSION,id:raw.id,name:text(e.name,255),region:e.region,subcategory:text(e.subcategory,40),venue:text(e.venueName,255),address:text(e.address,500),description:text(e.description),admission:text(e.admission,500),
    occurrences:arr(e.occurrences).map(o=>({startDate:text(o.startDate,10),endDate:text(o.endDate,10),startTime:text(o.startTime,5),endTime:text(o.endTime,5)})),
    operation:{state:text(e.operationStatus?.state,30),note:text(e.operationStatus?.note),source:safeLink(e.operationStatus?.sourceUrl),checkedOn:text(e.operationStatus?.checkedOn,10)},
    sources:arr(e.sources).map(s=>safeLink(s.url)).filter(Boolean),warnings:arr(e.warnings).map(w=>text(w,300)),participants,media,
    selectedDay:/^\d{4}-\d{2}-\d{2}$/.test(day)?day:'',savedAt:now,expiresAt:now+TTL,publishedAt:text(raw.publishedAt,50),
    missing:[],omittedImages:eligible.length-media.length,plansAvailable:arr(plans?.plans).length,
    noApprovedPlan:!media.some(a=>a.type==='FLOOR_PLAN'),blobs:[],bytes:0}
  return packageData
}
export function usable(pack,now=Date.now()) {
  return pack?.version===VERSION && positiveId(pack.id) && Number.isFinite(pack.savedAt) && pack.savedAt<=now+60000 && Number.isFinite(pack.expiresAt) && pack.expiresAt>now && pack.expiresAt<=pack.savedAt+TTL
    && Array.isArray(pack.participants) && Array.isArray(pack.media) && Array.isArray(pack.blobs) && Array.isArray(pack.missing)
    && Number.isFinite(pack.bytes) && pack.bytes>=0 && pack.bytes<=MAX_PACK
}

/** Re-project current public text; never leave withdrawn sales summaries behind.
 * Original consent/selection and retention deadline survive; this is NOT a new download. */
export function refreshedPackage(previous, raw, plans, planOK = true, now = Date.now()) {
  const selection = previous.participants.flatMap(p => [
    ...(p.selectedDirect ? [{type:'PARTICIPANT',id:p.id}] : []),
    ...p.products.filter(x => x.selected && positiveId(x.id)).map(x => ({type:'PRODUCT',id:x.id})),
  ])
  const fresh = buildPackage(raw, plans, selection, previous.selectedDay, now)
  const downloaded = new Map(previous.blobs.map(b => [b.key,b]))
  const eligible = fresh.media.filter(a => (planOK || a.type!=='FLOOR_PLAN') && downloaded.get(a.key)?.url===a.url
    && (!a.key.startsWith('plan:') || a.sha256 && downloaded.get(a.key)?.sha256===a.sha256))
  const keys = new Set(eligible.map(a => a.key))
  const next = {...fresh, apiBase:previous.apiBase, copyId:previous.copyId, ownerEpoch:previous.ownerEpoch,
    savedAt:previous.savedAt, expiresAt:previous.expiresAt, checkedAt:now,
    media:eligible, blobs:previous.blobs.filter(b => keys.has(b.key)),
    missing:[...previous.missing], omittedImages:fresh.omittedImages + fresh.media.length-eligible.length,
    noApprovedPlan:!eligible.some(a => a.type==='FLOOR_PLAN')}
  if(!planOK) next.missing.push('배치도 공개 상태 재확인 실패: 배치도를 다시 내려받아 주세요.')
  next.missing = [...new Set(next.missing)]
  return next
}
