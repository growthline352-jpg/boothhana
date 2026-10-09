import { useRef, useState, type FormEvent } from 'react'
import { useRemote } from '../../app/useRemote'
import { PageHeader } from '../../components/layout/PageHeader'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States'
import { goodsApi, type GoodsCandidate } from './api'
import './goods.css'

export function GoodsAdminPage() {
  const [query,setQuery]=useState(''),[draft,setDraft]=useState(''),[page,setPage]=useState(0)
  const state=useRemote("features/goods/GoodsAdminPage:GoodsAdminPage:state", ()=>goodsApi.candidates(query,page),[query,page])
  const submit=(event:FormEvent)=>{event.preventDefault();setPage(0);setQuery(draft.trim())}
  return <div className="goods-admin-page"><PageHeader eyebrow="관리자 · POS 인기 굿즈" title="분야 화면의 인기 굿즈 노출" description="분야별 ‘많이 판매된 굿즈’를 관리합니다. 최근 30일 POS 판매수량순이며, 저장순 인기행사와는 별도입니다."/>
    <div className="goods-admin-note">판매량 숫자나 순위를 직접 입력하지 않습니다. 예약·취소·외부 추정 판매량은 제외하며, 정상 판매기록이 0건이면 허용해도 메인에 나오지 않습니다. 공개 상품에 한해 분류와 노출 여부를 설정합니다. 분류를 바꾸거나 노출을 해제하면 다음 조회에 반영됩니다.</div>
    <form className="search-panel" onSubmit={submit}><input className="input" value={draft} maxLength={100} onChange={e=>setDraft(e.target.value)} placeholder="상품명·부스명" aria-label="노출 상품 검색"/><button className="btn primary">검색</button></form>
    {state.loading?<LoadingState/>:state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:!state.data?.items.length?<EmptyState title="공개된 운영 상품이 없습니다" description="크리에이터의 공개 상품을 먼저 등록하세요. 외부 수집 상품은 실제 판매기록 연결 전까지 이 순위에 포함하지 않습니다."/>:
      <div className="table-wrap"><table><thead><tr><th>상품·부스</th><th>최근 30일 기록 수량</th><th>메인 분류·노출</th></tr></thead><tbody>{state.data.items.map(row=><GoodsSettingRow key={`${row.product_id}-${row.revision}`} row={row} reload={state.reload}/>)}</tbody></table></div>}
    <nav className="discovery-pagination" aria-label="노출 상품 페이지"><button className="btn secondary" disabled={page===0||state.loading} onClick={()=>setPage(p=>p-1)}>이전</button><span>{page+1}페이지</span><button className="btn secondary" disabled={!state.data?.hasNext||state.loading} onClick={()=>setPage(p=>p+1)}>다음</button></nav>
  </div>
}
function GoodsSettingRow({row,reload}:{row:GoodsCandidate;reload:()=>Promise<void>}) {
  const [category,setCategory]=useState(row.category||'SUBCULTURE'),[enabled,setEnabled]=useState(row.enabled)
  const busyRef=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const save=async()=>{
    if(busyRef.current)return
    if(!window.confirm('이 상품의 메인 노출 설정을 저장할까요? 이미 공개된 상품의 판매기록 순위에 반영됩니다.'))return
    busyRef.current=true;setBusy(true);setMessage('')
    try{await goodsApi.configure(row.product_id,category,enabled,row.revision);await reload();setMessage('저장했습니다.')}
    catch(error){setMessage(error instanceof Error?error.message:'저장하지 못했습니다.')}
    finally{busyRef.current=false;setBusy(false)}
  }
  return <tr><td><strong>{row.name}</strong><small>{row.booth_name} · {row.event_name}</small></td><td>{Number(row.units).toLocaleString('ko-KR')}개<small>취소 제외 · 결제 검증 아님</small></td><td><div className="goods-admin-setting">
    <select className="select" disabled={busy} value={category} onChange={e=>setCategory(e.target.value)} aria-label={`${row.name} 노출 분야`}><option value="SUBCULTURE">서브컬처</option><option value="EXHIBITION">박람회</option><option value="FESTIVAL">축제</option><option value="POPUP">팝업</option></select>
    <label><input type="checkbox" disabled={busy} checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> 메인 노출 허용</label><button className="btn primary" disabled={busy} onClick={()=>void save()}>{busy?'저장 중…':'저장'}</button></div>{message&&<p role="status">{message}</p>}</td></tr>
}
