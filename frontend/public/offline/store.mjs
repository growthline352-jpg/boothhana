import { VERSION,MAX_PACKS,MAX_TOTAL,MAX_PACK,MAX_FILE,MAX_JSON,apiOrigin,buildPackage,usable,refreshedPackage } from './policy.mjs'
// Keep the database name to invalidate old v18 writers via an IDB version change.
const DB='boothhana.offline.v18', DB_VERSION=2
const changed=()=>{try{const c=new BroadcastChannel('boothhana-offline-v18');c.postMessage('changed');c.close()}catch{/* optional */}}
const validOwner=o=>o==='guest'||/^member:\d+$/.test(o)
const eventKey=id=>'event:'+id
const uid=()=>crypto.randomUUID()
function database(){return new Promise((resolve,reject)=>{
 const r=indexedDB.open(DB,DB_VERSION);let failed=false
 const timeout=setTimeout(()=>{failed=true;reject(Error('기기 저장소 응답이 늦습니다. 다른 탭을 닫고 다시 시도해 주세요.'))},10000)
 r.onupgradeneeded=()=>{
  // open() cannot be cancelled. A blocked/timed-out request may start its upgrade later.
  // Rejecting its Promise must not subsequently clear data behind the caller's back.
  if(failed){r.transaction.abort();return}
  // Only disposable offline copies are cleared. Member/guest library and server data are untouched.
  for(const name of ['packs','meta']){
   if(r.result.objectStoreNames.contains(name))r.transaction.objectStore(name).clear()
   else r.result.createObjectStore(name,name==='packs'?{keyPath:'id'}:undefined)
  }
 }
 r.onsuccess=()=>{clearTimeout(timeout);const db=r.result;if(failed){db.close();return}db.onversionchange=()=>db.close();resolve(db)}
 r.onerror=()=>{clearTimeout(timeout);failed=true;reject(r.error||Error('기기 저장소를 열지 못했습니다.'))}
 r.onblocked=()=>{clearTimeout(timeout);failed=true;reject(Error('이전 버전의 오프라인 탭을 닫고 다시 시도해 주세요.'))}
})}
/** Complete, not individual request success, is the persistence boundary. No async IDB callbacks. */
async function transaction(mode,run){const db=await database();return new Promise((resolve,reject)=>{
 let tx,result,failure
 try{tx=db.transaction(['packs','meta'],mode)}catch(e){db.close();reject(e);return}
 const fail=e=>{failure=e;try{tx.abort()}catch{db.close();reject(e)}}
 tx.oncomplete=()=>{db.close();resolve(result)}
 tx.onabort=()=>{db.close();reject(failure||tx.error||Error('저장이 취소되었습니다. 자료·계정을 다시 확인해 주세요.'))}
 tx.onerror=()=>{failure ||= tx.error||Error('저장 공간 또는 권한을 확인해 주세요.')}
 try{run(tx,v=>{result=v},fail)}catch(e){fail(e)}
})}
export async function syncOwner(owner,stillAllowed=()=>true){
 if(!validOwner(owner)||!stillAllowed())throw Error('확인된 계정 또는 비회원 상태가 필요합니다.')
 const value=await transaction('readwrite',(tx,done,fail)=>{
  const meta=tx.objectStore('meta'),r=meta.get('owner')
  r.onsuccess=()=>{
   if(!stillAllowed()){fail(Error('계정 확인이 변경되어 기기 저장 작업을 중단했습니다.'));return}
   if(r.result?.owner===owner){done({...r.result,changed:false});return}
   tx.objectStore('packs').clear();meta.clear();const next={owner,epoch:uid()};meta.put(next,'owner');done({...next,changed:true})
  }
 });if(value.changed)changed();return {owner:value.owner,epoch:value.epoch}
}
export async function currentOwner(){return transaction('readonly',(tx,done)=>{const r=tx.objectStore('meta').get('owner');r.onsuccess=()=>done(r.result)})}
/** One snapshot of owner, deletion generation, and actual package revision. */
async function readContext(id){return transaction('readonly',(tx,done)=>{
 const meta=tx.objectStore('meta'),o=meta.get('owner'),e=meta.get(eventKey(id)),p=tx.objectStore('packs').get(id)
 p.onsuccess=()=>done({owner:o.result?.owner,epoch:o.result?.epoch,eventEpoch:e.result??null,copyId:p.result?.copyId??null})
})}
export async function deletePack(id){
 await transaction('readwrite',tx=>{tx.objectStore('packs').delete(id);tx.objectStore('meta').put(uid(),eventKey(id))});changed()
}
export async function clearAll(){
 await transaction('readwrite',tx=>{const meta=tx.objectStore('meta'),r=meta.get('owner');r.onsuccess=()=>{
  tx.objectStore('packs').clear();meta.clear();meta.put({owner:r.result?.owner||'guest',epoch:uid()},'owner')
 }});changed()
}
export async function getPack(id){
 return transaction('readwrite',(tx,done)=>{const s=tx.objectStore('packs'),r=s.get(id);r.onsuccess=()=>{
  if(r.result&&!usable(r.result)){s.delete(id);tx.objectStore('meta').put(uid(),eventKey(id));done(null)}else done(r.result||null)
 }})
}
export async function listPacks(){
 return transaction('readwrite',(tx,done)=>{const rows=[],r=tx.objectStore('packs').openCursor();r.onsuccess=()=>{
  const c=r.result;if(!c){done(rows.sort((a,b)=>b.savedAt-a.savedAt));return}
  const p=c.value;if(!usable(p)){c.delete();tx.objectStore('meta').put(uid(),eventKey(p.id))}
  else rows.push({id:p.id,name:p.name,savedAt:p.savedAt,expiresAt:p.expiresAt,bytes:p.bytes,region:p.region,missing:p.missing.length,omittedImages:p.omittedImages,noApprovedPlan:p.noApprovedPlan})
  c.continue()
 }})
}
function countBytes(pack){
 // JSON includes each Blob's metadata (Blob serializes to {}) plus the actual binary sizes.
 let bytes=pack.blobs.reduce((n,b)=>n+b.blob.size,0)
 for(let i=0;i<3;i++){pack.bytes=bytes;bytes=new Blob([JSON.stringify(pack)]).size+pack.blobs.reduce((n,b)=>n+b.blob.size,0)}
 pack.bytes=bytes;return bytes
}
async function commitPack(pack,token,stillAllowed=()=>true){
 countBytes(pack)
 if(pack.bytes>MAX_PACK)throw Error('행사당 저장 한도 20MiB를 넘습니다.')
 const committed=await transaction('readwrite',(tx,done,fail)=>{
  const meta=tx.objectStore('meta'),packs=tx.objectStore('packs'),o=meta.get('owner'),e=meta.get(eventKey(pack.id))
  e.onsuccess=()=>{
   if(!stillAllowed()||!o.result||o.result.epoch!==token.epoch||o.result.owner!==token.owner||
      (e.result??null)!==token.eventEpoch){fail(Error('저장 중 자료가 삭제·갱신되었거나 계정이 바뀌었습니다. 다시 확인해 주세요.'));return}
   const r=packs.getAll();r.onsuccess=()=>{
    const previous=r.result.find(p=>p.id===pack.id)
    if((previous?.copyId??null)!==token.copyId){fail(Error('다른 화면에서 자료가 갱신되었습니다. 다시 확인해 주세요.'));return}
    if(!usable(pack)){fail(Error('저장 자료가 만료되었거나 올바르지 않습니다. 다시 내려받아 주세요.'));return}
    const rows=r.result.filter(p=>usable(p)&&p.id!==pack.id)
    if(rows.length>=MAX_PACKS){fail(Error('최대 5개 행사까지 저장할 수 있습니다. 기존 자료를 삭제해 주세요.'));return}
    if(rows.reduce((sum,p)=>sum+p.bytes,0)+pack.bytes>MAX_TOTAL){fail(Error('오프라인 자료의 총 저장 한도 60MiB를 넘습니다.'));return}
    for(const old of r.result)if(!usable(old))packs.delete(old.id)
    if(!stillAllowed()){fail(Error('저장을 취소했습니다.'));return}
    packs.put(pack);meta.put(uid(),eventKey(pack.id));done(true)
   }
  }
 });if(committed)changed();return committed
}
export async function ensureShell(){
 if(!globalThis.isSecureContext||!navigator.serviceWorker)throw Error('HTTPS와 Service Worker를 지원하는 브라우저가 필요합니다.')
 const reg=await navigator.serviceWorker.register('/library-sw.js',{scope:'/',updateViaCache:'none'})
 // Prefer an installing update, not the active old worker which may cache incompatible modules.
 if(reg.update)await reg.update()
 let worker=reg.installing||reg.waiting||reg.active
 if(!worker)throw Error('오프라인 화면 설치를 시작하지 못했습니다.')
 if(worker.state!=='activated')await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{worker.removeEventListener('statechange',check);reject(Error('오프라인 화면 설치 시간이 초과되었습니다.'))},20000)
  function check(){if(worker.state==='activated'){clearTimeout(timeout);worker.removeEventListener('statechange',check);resolve()}else if(worker.state==='redundant'){clearTimeout(timeout);worker.removeEventListener('statechange',check);reject(Error('오프라인 화면 설치에 실패했습니다.'))}}
  worker.addEventListener('statechange',check);check()
 })
 await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('오프라인 화면 확인 시간이 초과되었습니다.'))},5000)
  channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data?.ready&&e.data.version===VERSION?resolve():reject(Error('오프라인 화면 파일이 모두 저장되지 않았습니다. 이전 탭을 닫고 다시 시도해 주세요.'))}
  worker.postMessage({type:'OFFLINE_PING'},[channel.port2])
 })
 return true
}
export async function boundedFetch(url,maxBytes,kind='json'){
 if(!Number.isFinite(maxBytes)||maxBytes<1)throw Error('파일 저장 한도를 확인해 주세요.')
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000)
 try{
  const r=await fetch(url,{credentials:'omit',redirect:'error',signal:controller.signal,cache:'no-store',referrerPolicy:'no-referrer'})
  if(!r.ok){const e=Error('공개 자료를 불러오지 못했습니다. HTTP '+r.status);e.status=r.status;throw e}
  const type=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()
  if(kind==='image'&&!['image/png','image/jpeg','image/webp','image/gif'].includes(type))throw Error('지원하는 이미지 형식이 아닙니다.')
  if(kind==='json'&&type!=='application/json'&&!/^application\/[a-z0-9.+-]+\+json$/.test(type))throw Error('공개 JSON 응답이 아닙니다.')
  if(Number(r.headers.get('content-length')||0)>maxBytes)throw Error('파일 크기가 저장 한도를 넘습니다.')
  const reader=r.body?.getReader();if(!reader)throw Error('파일을 읽을 수 없습니다.')
  let size=0;const chunks=[]
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw Error('파일 크기가 저장 한도를 넘습니다.')}chunks.push(value)}
  const blob=new Blob(chunks,{type});return kind==='json'?JSON.parse(await blob.text()):blob
 }finally{clearTimeout(timer)}
}
export async function downloadEvent({apiBase,eventId,owner,selection=[],day='',onProgress=()=>{},stillAllowed=()=>true}){
 const base=apiOrigin(apiBase)
 if(!Number.isSafeInteger(eventId)||eventId<1||!validOwner(owner))throw Error('행사와 계정을 확인해 주세요.')
 if(!stillAllowed())throw Error('계정을 다시 확인한 뒤 저장해 주세요.')
 const token=await readContext(eventId)
 if(token.owner!==owner)throw Error('계정 확인이 끝난 뒤 다시 저장해 주세요.')
 onProgress('오프라인 화면을 준비하고 있습니다.');await ensureShell()
 if(!stillAllowed())throw Error('저장을 취소했습니다.')
 onProgress('현재 공개 행사 정보를 확인하고 있습니다.')
 const raw=await boundedFetch(`${base}/api/public/catalog/events/${eventId}`,MAX_JSON)
 if(raw.id!==eventId)throw Error('다른 행사 응답은 저장할 수 없습니다.')
 let plans={plans:[],managedAssetIds:[]},planError=''
 try{plans=await boundedFetch(`${base}/api/public/catalog/events/${eventId}/floorplans`,MAX_JSON)}
 catch{planError='배치도 최신 상태를 확인하지 못해 배치도 파일은 저장하지 않았습니다.'}
 const pack=buildPackage(raw,plans,selection,day)
 pack.copyId=uid();pack.ownerEpoch=token.epoch;pack.apiBase=base
 if(planError){pack.media=pack.media.filter(m=>m.type!=='FLOOR_PLAN');pack.missing.push(planError);pack.noApprovedPlan=true}
 let bytes=countBytes(pack)
 for(const [i,asset] of pack.media.entries()){
  if(!stillAllowed())throw Error('계정 상태가 바뀌어 저장을 중단했습니다.')
  onProgress(`이미지 저장 ${i+1}/${pack.media.length}`)
  try{
   const blob=await boundedFetch(asset.url,Math.min(MAX_FILE,MAX_PACK-bytes),'image')
   let sha256
   if(asset.key.startsWith('plan:')){
    if(!asset.sha256)throw Error('공개 배치도의 SHA-256 정보가 없습니다.')
    sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('')
    if(sha256!==asset.sha256)throw Error('공개 배치도와 내려받은 파일의 SHA-256이 다릅니다.')
   }
   const bitmap=await createImageBitmap(blob);bitmap.close()
   pack.blobs.push({key:asset.key,url:asset.url,blob,...(sha256?{sha256}:{})});bytes=countBytes(pack)
   if(bytes>MAX_PACK){pack.blobs.pop();bytes=countBytes(pack);throw Error('저장 용량 초과')}
  }catch{pack.missing.push(`${asset.type==='FLOOR_PLAN'?'배치도':'이미지'} #${asset.id}: 다운로드·CORS·형식·용량·해시 확인 필요`)}
 }
 pack.noApprovedPlan=!pack.media.some(a=>a.type==='FLOOR_PLAN'&&pack.blobs.some(b=>b.key===a.key))
 await commitPack(pack,token,stillAllowed)
 onProgress('저장된 자료를 다시 확인하고 있습니다.')
 const confirmed=await getPack(eventId)
 if(!confirmed||confirmed.copyId!==pack.copyId)throw Error('기기에 저장된 자료가 변경되었습니다. 다시 확인해 주세요.')
 return {id:pack.id,missing:pack.missing,omittedImages:pack.omittedImages,noApprovedPlan:pack.noApprovedPlan,bytes:pack.bytes,savedAt:pack.savedAt}
}
/** Successful checks refresh public text but never extend the original seven-day deadline. */
export async function revalidate(pack){
 const token=await readContext(pack.id)
 if(!token.epoch||token.epoch!==pack.ownerEpoch||token.copyId!==pack.copyId)return {state:'superseded'}
 try{
  const raw=await boundedFetch(`${apiOrigin(pack.apiBase)}/api/public/catalog/events/${pack.id}`,MAX_JSON)
  if(raw.id!==pack.id)throw Error('행사 응답 불일치')
  let plans={plans:[],managedAssetIds:[]},planOK=true
  try{plans=await boundedFetch(`${pack.apiBase}/api/public/catalog/events/${pack.id}/floorplans`,MAX_JSON)}catch{planOK=false}
  const next=refreshedPackage(pack,raw,plans,planOK)
  // A new identity prevents another late check from overwriting this successful update.
  next.copyId=uid()
  const before=pack.blobs.length+pack.participants.length+pack.participants.reduce((n,p)=>n+p.products.length,0)
  const after=next.blobs.length+next.participants.length+next.participants.reduce((n,p)=>n+p.products.length,0)
  await commitPack(next,token)
  return {state:'checked',changed:raw.publishedAt!==pack.publishedAt,removed:Math.max(0,before-after)}
 }catch(e){
  if([401,403,404,410].includes(e.status)){
   const removed=await transaction('readwrite',(tx,done)=>{
    const meta=tx.objectStore('meta'),o=meta.get('owner'),v=meta.get(eventKey(pack.id)),s=tx.objectStore('packs'),r=s.get(pack.id)
    r.onsuccess=()=>{if(o.result?.epoch!==token.epoch||(v.result??null)!==token.eventEpoch||r.result?.copyId!==pack.copyId){done(false);return}
     s.delete(pack.id);meta.put(uid(),eventKey(pack.id));done(true)}
   });if(removed)changed();return {state:removed?'removed':'superseded'}
  }
  return {state:'unreachable'}
 }
}
