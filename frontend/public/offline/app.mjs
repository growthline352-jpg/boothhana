import { listPacks,getPack,deletePack,clearAll,ensureShell,revalidate } from './store.mjs'
import { safeLink } from './policy.mjs'
const root=document.querySelector('#content'),status=document.querySelector('#status'),connection=document.querySelector('#connection')
let generation=0,urls=new Map(),current=null,query='',selectedOnly=false,expiryTimer=null
const el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);if(cls)n.className=cls;return n}
const stamp=x=>new Date(x).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})
function link(label,url){const n=el('a',label);n.href=safeLink(url)||'#';n.target='_blank';n.rel='noopener noreferrer';n.referrerPolicy='no-referrer';return n}
function button(label,click){const n=el('button',label);n.type='button';n.addEventListener('click',event=>{void Promise.resolve().then(()=>click(event)).catch(e=>{status.textContent=e.message||'작업을 완료하지 못했습니다.'})});return n}
function dispose(){for(const u of urls.values())URL.revokeObjectURL(u);urls.clear();clearTimeout(expiryTimer)}
function blobURL(pack,key){if(urls.has(key))return urls.get(key);const value=pack.blobs.find(x=>x.key===key);if(!value)return '';const url=URL.createObjectURL(value.blob);urls.set(key,url);return url}
function network(){connection.textContent=navigator.onLine?'기기 저장 자료를 먼저 표시합니다.': '인터넷 연결 없음 · 저장된 자료를 보고 있습니다.';if(navigator.onLine)connection.textContent='기기 저장 자료를 먼저 표시합니다. 최신 안내는 온라인에서 다시 확인하세요.'}
network();window.addEventListener('online',()=>{network();void load()});window.addEventListener('offline',network)
function meta(pack){return `${stamp(pack.savedAt)} 저장 · ${stamp(pack.expiresAt)}까지 · ${(pack.bytes/1024/1024).toFixed(1)}MiB`}
async function home(request=generation){
 const rows=await listPacks();if(request!==generation||location.hash)return;root.replaceChildren();root.append(el('h2',`이 기기에 저장한 행사 ${rows.length}/5`))
 if(!rows.length)root.append(el('p','저장한 행사가 없습니다. 인터넷이 연결됐을 때 행사 상세에서 [오프라인 저장]을 눌러 주세요. 만료되거나 브라우저가 삭제한 자료도 다시 내려받아야 합니다.'))
 for(const p of rows){const card=el('article',undefined,'card'),a=el('a',p.name);a.href='#'+p.id;card.append(el('h3'));card.querySelector('h3').append(a);card.append(el('p',meta(p),'muted'))
  if(p.missing||p.omittedImages||p.noApprovedPlan)card.append(el('p','일부 이미지 또는 배치도는 포함되지 않았습니다.','warning'))
  card.append(button('이 행사 삭제',async()=>{if(confirm('이 행사의 기기 저장 자료를 삭제할까요?')){await deletePack(p.id);await load()}}));root.append(card)}
}
const scopeNames={EVENT_LISTED:'이번 행사 등록 품목',EVENT_SALE_CONFIRMED:'이번 행사 판매 공지 확인',PROFILE:'취급 분야',GENERAL_CATALOG:'상시 상품 · 행사 판매 미확인',PAST_REFERENCE:'과거 판매 참고',UNKNOWN:'판매 확인 필요'}
const saleNames={PLANNED:'판매 예정',ON_SALE:'판매 중으로 안내됨',SOLD_OUT:'품절 안내',CANCELED:'판매 취소 안내',UNKNOWN:'판매 상태 미확인'}
function image(pack,asset){const url=blobURL(pack,asset.key);if(!url)return null;const f=el('figure'),img=el('img');img.src=url;img.alt=asset.caption||'저장 이미지';img.className='image';img.loading='lazy';const cap=el('figcaption',asset.credit+' · ');if(asset.source)cap.append(link('출처 (온라인)',asset.source));f.append(img,cap);return f}
function renderParticipants(pack,container){
 container.replaceChildren();const needle=query.toLocaleLowerCase('ko-KR')
 const rows=pack.participants.filter(p=>(!selectedOnly||p.selected)&&(!needle||[p.name,p.summary,...p.subjects,...p.locations.flatMap(l=>[l.code,l.hall,l.zone]),...p.products.map(x=>x.name)].join(' ').toLocaleLowerCase('ko-KR').includes(needle)))
 container.append(el('p',`${rows.length}곳 · 공개된 정보의 저장본이며 실제 전체 참가 명단은 아닙니다.`,'muted'))
 // Render progressively without blocking large packages on mobile.
 let count=0;const more=button('부스 40곳 더 보기',append)
 function append(){more.remove();for(const p of rows.slice(count,count+40)){
  const card=el('article',undefined,'card');const title=el('h3',p.name);card.append(title)
  if(p.selected)card.append(el('span','내 목록에서 선택한 부스·상품','saved'))
  if(!p.locations.length)card.append(el('p','부스 위치 미확인'))
  for(const l of p.locations)card.append(el('span',[l.code||'번호 미확인',l.hall,l.zone,l.startDate&&(l.startDate+(l.endDate!==l.startDate?' ~ '+l.endDate:''))].filter(Boolean).join(' · '),'location'))
  card.append(el('p',p.summary||'공개 판매 안내 없음'))
  for(const x of p.products){const box=el('section',undefined,'product');box.append(el('h4',x.name));if(x.selected)box.append(el('span','내 목록에서 선택한 상품 · 구매·수령 완료 확인 아님','saved'))
   if(x.price)box.append(el('p',`${x.price.amount} ${x.price.currency} · ${x.price.checkedOn||'확인일 미상'} 기준`))
   box.append(el('small',`${scopeNames[x.evidenceScope]||'판매 확인 필요'} / ${saleNames[x.saleState]||'판매 상태 미확인'}`));box.append(el('p',x.summary))
   if(x.verification==='NOT_RECONFIRMED')box.append(el('p','최근 수집에서 재확인되지 않은 상품입니다.','warning'))
   const a=pack.media.find(a=>a.productId===x.id&&a.participantId===p.id&&a.type!=='FLOOR_PLAN');if(a){const f=image(pack,a);if(f)box.append(f)}
   if(x.productUrl)box.append(link('판매 안내 (온라인)',x.productUrl));card.append(box)}
  for(const u of p.links)card.append(link('공식 채널 (온라인) ↗ ',u));container.append(card)}
  count+=40;if(count<rows.length)container.append(more)
 }
 append()
}
function renderPack(pack){
 dispose();expiryTimer=setTimeout(()=>void load(false),Math.max(0,Math.min(2147483647,pack.expiresAt-Date.now()+10)));root.replaceChildren();const back=el('a','← 저장한 행사 전체');back.href='/offline/index.html';root.append(back,el('h2',pack.name),el('p',meta(pack),'muted'))
 if(pack.checkedAt)root.append(el('p','공개 문구·권한 재확인: '+stamp(pack.checkedAt)+' · 기존 만료일은 유지됩니다.','muted'))
 root.append(el('p',`${pack.venue||'장소 미확인'} · ${pack.address||'주소 미확인'}`),el('p',pack.admission||'입장 조건 미확인'))
 for(const d of pack.occurrences)root.append(el('p',`${d.startDate}${d.endDate!==d.startDate?' ~ '+d.endDate:''} · ${d.startTime||'시간 미확인'}${d.endTime?' – '+d.endTime:''}`))
 if(pack.selectedDay)root.append(el('p','저장할 때 선택한 방문일: '+pack.selectedDay))
 if(pack.operation.note)root.append(el('p',pack.operation.note+' · 저장 시점 안내','warning'))
 if(pack.missing.length||pack.omittedImages){root.append(el('p',[...pack.missing,pack.omittedImages?`${pack.omittedImages}개 이미지는 포함되지 않았습니다. 저장 한도·공개 상태를 확인하고 필요한 자료는 다시 내려받아 주세요.`:''].filter(Boolean).join('\n'),'warning'))}
 const actions=el('div',undefined,'actions');const online=el('a','최신 정보 확인·다시 내려받기 (온라인)');online.href='/discover/'+pack.id;actions.append(online,button('이 행사 삭제',async()=>{if(confirm('이 행사 자료를 삭제할까요?')){await deletePack(pack.id);location.hash='';await load()}}));root.append(actions)
 const details=el('details'),summary=el('summary','행사 소개·주의사항·출처');details.append(summary,el('p',pack.description));for(const warning of pack.warnings)details.append(el('p',warning));for(const u of pack.sources)details.append(link('공식·참고 안내 (온라인) ↗ ',u));root.append(details)
 const plans=pack.media.filter(a=>a.type==='FLOOR_PLAN'&&pack.blobs.some(b=>b.key===a.key));root.append(el('h2','저장된 배치도'))
 if(!plans.length)root.append(el('p','저장된 배치도 파일이 없습니다. 사용 허용·공개 상태·다운로드 결과를 확인하세요. 부스번호는 아래 목록에서 찾을 수 있습니다.','warning'))
 for(const p of plans){const box=el('section',undefined,'card');box.append(el('h3',p.caption||'배치도'));if(p.dates?.length)box.append(el('p',p.dates.join(' · ')));if(p.hall)box.append(el('p',p.hall));if(p.partial)box.append(el('p','일부만 확인된 배치도입니다.','warning'))
  const viewport=el('div',undefined,'plan-window'),img=el('img');img.src=blobURL(pack,p.key);img.alt=p.caption||'저장된 배치도';img.style.width='100%';viewport.append(img)
  const zoom=el('div',undefined,'controls');let scale=100;zoom.append(button('확대',()=>{scale=Math.min(400,scale+50);img.style.width=scale+'%'}),button('축소',()=>{scale=Math.max(100,scale-50);img.style.width=scale+'%'}));box.append(zoom,viewport,el('p',p.credit,'muted'));if(p.source)box.append(link('배치도 원문 (온라인)',p.source));root.append(box)}
 const filter=el('div',undefined,'controls'),search=el('input');search.type='search';search.placeholder='부스번호·부스명·상품명 검색';search.setAttribute('aria-label','저장된 부스·상품 검색');search.value=query
 const label=el('label'),check=el('input');check.type='checkbox';check.checked=selectedOnly;label.append(check,document.createTextNode('내 목록에서 선택한 부스만'))
 const count=pack.participants.filter(p=>p.selected).length;label.append(el('small',` (${count}곳)`));filter.append(search,label);root.append(el('h2','부스·상품·개인 선택 목록'),filter)
 const list=el('div');root.append(list);renderParticipants(pack,list)
 search.addEventListener('input',()=>{query=search.value;renderParticipants(pack,list)})
 check.addEventListener('change',()=>{selectedOnly=check.checked;renderParticipants(pack,list)})
 root.append(el('p','이 목록은 선택한 공개 부스·상품의 열람용 사본입니다. 선입금 주문번호·결제 기록·계정 메모·실제 수령 여부는 저장하지 않습니다.','notice'))
}
async function load(checkOnline=true){
 const request=++generation;dispose();current=null;status.textContent=''
 try{
  const id=Number(location.hash.slice(1));if(!id){await home(request);return}
  const pack=await getPack(id);if(request!==generation)return
  if(!pack){root.replaceChildren(el('p','저장되지 않았거나 만료·삭제된 행사입니다. 인터넷 연결 후 다시 내려받아 주세요.'));const back=el('a','저장된 행사 전체');back.href='/offline/index.html';root.append(back);return}
  current=pack;renderPack(pack)
  if(navigator.onLine&&checkOnline){const result=await revalidate(pack);if(request!==generation)return
   // Always read the committed current copy, not a stale object used to start the request.
   const updated=await getPack(id);if(request!==generation)return
   if(!updated){dispose();current=null;root.replaceChildren(el('p','공개 철회·계정 변경·삭제 또는 만료로 기기 자료를 더 이상 표시하지 않습니다.'));return}
   current=updated;renderPack(updated)
   if(result.state==='checked')status.textContent=result.removed?'공개에서 제외된 자료를 제거했습니다.':result.changed?'현재 공개된 문구로 갱신했습니다. 새 이미지는 온라인에서 다시 내려받으세요.':'공개 상태와 문구를 재확인했습니다. 만료 시각은 그대로 유지됩니다.'
   else if(result.state==='superseded')status.textContent='다른 화면에서 갱신된 저장 자료를 표시합니다.'
   else status.textContent='최신 정보를 확인하지 못했습니다. 저장된 자료를 계속 보여줍니다.'
  }
 }catch(e){if(request===generation){root.replaceChildren(el('p','기기 저장 자료를 열지 못했습니다. 저장공간·브라우저 설정을 확인하세요.'));status.textContent=e.message}}
}
window.addEventListener('hashchange',()=>{query='';selectedOnly=false;void load()})
document.querySelector('#clear').addEventListener('click',async()=>{try{if(confirm('이 기기의 오프라인 행사 자료를 모두 삭제할까요?')){await clearAll();location.hash='';await load()}}catch(e){status.textContent=e.message}})
// Storage notifications render the latest committed copy, but never start another network check.
// Otherwise tabs can perpetually notify/revalidate one another.
try{const channel=new BroadcastChannel('boothhana-offline-v18');channel.onmessage=()=>void load(false)}catch{/* pageshow/visibility still recheck */}
window.addEventListener('pageshow',()=>void load())
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void load(false)})
window.addEventListener('pagehide',()=>{++generation;dispose()})
void load();if(navigator.onLine)void ensureShell().catch(e=>{status.textContent='오프라인 화면 설치 확인 필요: '+e.message})
