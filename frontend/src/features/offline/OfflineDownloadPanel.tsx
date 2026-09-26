import { useContext,useEffect,useRef,useState } from 'react'
import { AuthContext } from '../../app/auth-context'
import { API_BASE_URL } from '../../api/client'
import { useLibrary } from '../library/LibraryProvider'
import { loadOfflineModule } from './offlineModule'
import { offlineOwner } from './OfflinePrivacyGuard'
export function OfflineDownloadPanel({eventId,day}:{eventId:number;day:string}){
 const auth=useContext(AuthContext),library=useLibrary(),alive=useRef(true),serial=useRef(0),eventRef=useRef({eventId,day})
 eventRef.current={eventId,day}
 const [consent,setConsent]=useState(false),[includeSelection,setIncludeSelection]=useState(true)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;serial.current++}},[])
 useEffect(()=>{serial.current++;setBusy(false);setSaved(false);setMessage('');setConsent(false)},[eventId,day])
 const owner=offlineOwner(auth?.getSnapshot())
 const selectionReady=!!library&&library.owner===owner&&!library.loading&&!library.error
 const download=async()=>{
  if(busy||!consent||!owner)return
  if(includeSelection&&!selectionReady){setMessage('선택 목록을 불러온 뒤 저장하거나, 선택 표시 포함을 해제해 주세요.');return}
  const ticket=++serial.current;setBusy(true);setSaved(false);setMessage('저장을 시작합니다.')
  const same=()=>alive.current&&serial.current===ticket&&eventRef.current.eventId===eventId&&eventRef.current.day===day&&offlineOwner(auth?.getSnapshot())===owner
  try{
   const module=await loadOfflineModule();if(!same())throw Error('계정을 다시 확인해 주세요.')
   await module.syncOwner(owner,same)
   const selection=includeSelection&&library?.owner===owner&&!library.loading?(library.index.filter(x=>x.target.eventId===eventId&&x.target.type!=='EVENT').map(x=>({type:x.target.type,id:x.target.id}))):[]
   const result=await module.downloadEvent({apiBase:API_BASE_URL||window.location.origin,eventId,owner,selection,day,stillAllowed:same,onProgress:text=>{if(same())setMessage(text)}})
   if(same()){
    setSaved(true);setMessage(`행사 정보·부스·상품 텍스트 저장 완료 (${(result.bytes/1024/1024).toFixed(1)}MiB). `+
     (result.missing.length?`파일 ${result.missing.length}건 저장 실패. `:'')+(result.omittedImages?`이미지 ${result.omittedImages}개는 한도로 제외. `:'')+(result.noApprovedPlan?'저장된 배치도 파일 없음. ':'')+'아래 [저장 자료 열기]에서 비행기 모드로도 확인해 주세요.')
   }
  }catch(e){if(alive.current&&ticket===serial.current)setMessage(e instanceof Error?e.message:'저장에 실패했습니다.')}
  finally{if(alive.current&&ticket===serial.current)setBusy(false)}
 }
 return <section className="panel offline-download-panel" id="offline-save" aria-label="행사 오프라인 저장">
  <div className="offline-panel-heading"><span className="offline-panel-icon" aria-hidden="true">↓</span><div><p className="eyebrow">행사 전 준비</p><h2>현장용 자료를 미리 저장하세요</h2><p>인터넷이 느려도 부스번호와 공개 상품 정보를 볼 수 있어요. 허용된 이미지·배치도만 포함합니다.</p></div></div>
  <div className="offline-panel-overview"><span>열람 전용</span><span>저장 후 7일</span><span>최대 5개 행사</span><a href={`/offline/index.html${saved?'#'+eventId:''}`}>저장 자료 바로 열기 →</a></div>
  <details className="offline-download-options"><summary>저장 항목 확인하고 내려받기</summary>
  <label className="field"><span><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/> 이 기기에 7일간 저장하며, 이 기기를 사용하는 사람이 자료를 열 수 있음을 확인했습니다.</span></label>
  <label className="field"><span><input type="checkbox" checked={includeSelection} disabled={busy} onChange={e=>setIncludeSelection(e.target.checked)}/> 내 보관함에서 선택한 이 행사 부스·상품 표시도 포함</span><small>공개 항목의 선택 표시만 포함합니다. 계정 메모·주문번호·결제·예약 내역은 저장하지 않습니다.</small></label>
  <div className="row-actions"><button className="btn primary" disabled={busy||!consent||!owner||(includeSelection&&!selectionReady)} onClick={()=>void download()}>{busy?'저장 중…':'이 행사 오프라인 저장'}</button><a className="btn secondary" href={`/offline/index.html${saved?'#'+eventId:''}`}>저장 자료 열기</a>{busy&&<button className="btn secondary" onClick={()=>{serial.current++;setBusy(false);setMessage('저장을 취소했습니다. 기존 자료는 유지됩니다.')}}>취소</button>}</div>
  {owner&&includeSelection&&!selectionReady&&<p>선택 목록을 아직 확인하지 못했습니다. 불러오기를 기다리거나 위 선택 표시 포함을 해제해 주세요.</p>}
  {!owner&&<p>계정 확인 중이거나 오류 상태입니다. 새 저장은 계정 확인 후 가능하며, 이미 저장한 자료는 바로 열 수 있습니다.</p>}
  <p className={`offline-download-feedback${saved?' is-saved':''}`} role="status" aria-live="polite">{message}</p></details><small className="offline-download-policy">열람 전용 · 최대 5개 행사 / 합계 60MiB · 저장 시점 기준이며 실시간 재고·공식 수령 확인이 아닙니다. 앱 홈이 아닌 [저장 자료 열기] 주소를 홈 화면에 추가해 사용할 수 있습니다.</small>
 </section>
}
