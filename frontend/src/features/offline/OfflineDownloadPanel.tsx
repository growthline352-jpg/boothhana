import { useContext,useEffect,useRef,useState } from 'react'
import { AuthContext } from '../../app/auth-context'
import { API_BASE_URL } from '../../api/client'
import { useLibrary } from '../library/LibraryProvider'
import { loadOfflineModule } from './offlineModule'
import { offlineOwner } from './OfflinePrivacyGuard'
import { Link } from 'react-router'

export function OfflineEventButton({eventId,day}:{eventId:number;day:string}){
 const auth=useContext(AuthContext),library=useLibrary(),alive=useRef(true),serial=useRef(0)
 const getSnapshot=auth?.getSnapshot
 const [checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[message,setMessage]=useState('')
 const owner=offlineOwner(getSnapshot?.())
 const selectionReady=!!owner&&!!library&&library.owner===owner&&!library.loading&&!library.error
 useEffect(()=>{
  const active=alive,sequence=serial;active.current=true;const ticket=++sequence.current;setChecking(true);setMessage('')
  const same=()=>active.current&&ticket===sequence.current&&offlineOwner(getSnapshot?.())===owner
  if(!owner){setSaved(false);setChecking(false);return()=>{active.current=false;sequence.current++}}
  const refresh=async()=>{try{const module=await loadOfflineModule();await module.syncOwner(owner,same);const packs=await module.listPacks();if(same())setSaved(packs.some(pack=>pack.id===eventId))}catch{if(same())setSaved(false)}finally{if(same())setChecking(false)}}
  void refresh()
  let channel:BroadcastChannel|undefined
  try{channel=new BroadcastChannel('boothhana-offline-v18');channel.onmessage=()=>void refresh()}catch{/* status still refreshes after this component saves */}
  return()=>{active.current=false;sequence.current++;channel?.close()}
 },[eventId,getSnapshot,owner])
 const download=async()=>{
  if(busy||!owner||!selectionReady)return
  const ticket=++serial.current;setBusy(true);setMessage('행사 정보와 부스 자료를 저장하고 있어요.')
  const same=()=>alive.current&&ticket===serial.current&&offlineOwner(getSnapshot?.())===owner
  try{
   const module=await loadOfflineModule();await module.syncOwner(owner,same)
   const selection=library.index.filter(item=>item.target.eventId===eventId&&item.target.type!=='EVENT').map(item=>({type:item.target.type,id:item.target.id}))
   const result=await module.downloadEvent({apiBase:API_BASE_URL||window.location.origin,eventId,owner,selection,day,stillAllowed:same,onProgress:text=>{if(same())setMessage(text)}})
   if(same()){setSaved(true);setMessage(`오프라인 저장 완료 · ${(result.bytes/1024/1024).toFixed(1)}MiB${result.missing.length?` · 파일 ${result.missing.length}건 제외`:''}`)}
  }catch(error){if(same())setMessage(error instanceof Error?error.message:'오프라인 저장에 실패했습니다.')}
  finally{if(same())setBusy(false)}
 }
 return <div className={`memory-offline-save${saved?' is-saved':''}`}>
  <div className="row-actions"><button type="button" className={`btn ${saved?'secondary':'primary'}`} disabled={checking||busy||!owner||!selectionReady} onClick={()=>void download()}>{busy?'저장 중…':checking?'저장 상태 확인 중…':saved?'오프라인 정보 다시 저장':'오프라인 정보 저장'}</button>{saved&&<Link className="btn secondary" to={`/library?offline=1&offlineEvent=${eventId}`}>저장 자료 열기</Link>}</div>
  <small>{saved?'이 기기에서 인터넷 없이 열 수 있어요. 저장일로부터 7일간 유지됩니다.':'행사·부스·공개 상품과 허용된 이미지·배치도를 이 기기에 7일간 저장합니다.'}</small>
  {message&&<p role="status" aria-live="polite">{message}</p>}
 </div>
}
