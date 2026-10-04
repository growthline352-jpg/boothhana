import {useEffect,useRef,useState} from 'react'
import {DiscoveryIcon} from '../discovery/DiscoveryIcon'
import {itineraryRegions,regionArea,type Province} from './regionCatalog'

export function RegionPicker({value,counts,choose}:{value:string;counts:Record<string,number>;choose:(id:string)=>void}){
 const [province,setProvince]=useState<Province>(()=>regionArea(value)?.province||'SEOUL')
 const mobile=()=>typeof window!=='undefined'&&window.matchMedia('(max-width:640px)').matches
 const [zoom,setZoom]=useState(mobile)
 const scroll=useRef<HTMLDivElement>(null)
 const rows=itineraryRegions.filter(r=>r.province===province)
 const total=rows.reduce((n,r)=>n+(counts[r.id]||0),0)
 const selected=regionArea(value)
 useEffect(()=>{const element=scroll.current;if(!element)return;const label=selected?.province===province?selected.label:[330,300];element.scrollLeft=Math.max(0,element.scrollWidth*label[0]/660-element.clientWidth/2);element.scrollTop=Math.max(0,element.scrollHeight*label[1]/600-element.clientHeight/2)},[province,zoom,selected])
 return <div className="it-region-picker">
  <div className="it-region-toolbar"><div className="it-region-tabs" role="group" aria-label="지도 권역">{([['SEOUL','서울'],['GYEONGGI','경기']] as const).map(([id,name])=><button type="button" key={id} aria-pressed={province===id} onClick={()=>{setProvince(id);setZoom(mobile())}}>{name}<span>{itineraryRegions.filter(r=>r.province===id).reduce((n,r)=>n+(counts[r.id]||0),0)}</span></button>)}</div><span>{province==='SEOUL'?'구별':'시·군별'} 행사 <strong>{total}개</strong></span></div>
  <div className={`it-region-map${zoom?' is-zoomed':''}`}>
   <button type="button" className="it-region-zoom" onClick={()=>setZoom(!zoom)} aria-pressed={zoom} aria-label={zoom?'지도 축소':'지도 확대'}>{zoom?'−':'＋'}</button>
   <div ref={scroll} className="it-region-map-scroll"><svg viewBox="0 0 660 600" aria-label={`${province==='SEOUL'?'서울':'경기'} 지역별 행사 지도`} role="group">
    <title>지역을 선택하면 행사 목록을 볼 수 있어요</title>
    {rows.map(r=><path key={r.id} d={r.path} className={`it-region-shape${counts[r.id]?' has-events':''}${value===r.id?' is-selected':''}`} onClick={()=>choose(r.id)} aria-hidden="true"/>)}
    {rows.map(r=><line key={r.id} x1={r.anchor[0]} y1={r.anchor[1]} x2={r.label[0]} y2={r.label[1]} className="it-region-leader" aria-hidden="true"/>)}
    {rows.map(r=><g key={r.id} className={`it-region-label${value===r.id?' is-selected':''}${counts[r.id]?' has-events':''}`} role="button" tabIndex={0} aria-label={`${r.name} 행사 ${counts[r.id]||0}개`} aria-pressed={value===r.id} onClick={()=>choose(r.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(r.id)}}} transform={`translate(${r.label[0]},${r.label[1]})`}><rect x={-(r.short.length*14+30)/2} y={-16} width={r.short.length*14+30} height={32} rx={9}/><text textAnchor="middle" dominantBaseline="central">{r.short}({counts[r.id]||0})</text></g>)}
   </svg></div>
   <span className="it-region-map-hint"><DiscoveryIcon name="pin" size={14}/> {zoom?'가로·세로로 움직여 지역을 선택하세요':'지역 이름을 눌러보세요'}</span>
  </div>
  <div className="it-region-selection" role="status">{selected?<><DiscoveryIcon name="check" size={16}/><strong>{selected.name}</strong><span>행사 {counts[selected.id]||0}개</span></>:<><DiscoveryIcon name="pin" size={16}/><span>가보고 싶은 지역을 선택하세요</span></>}</div>
  <details className="it-region-list"><summary>지역 목록으로 선택하기 <span>{rows.length}곳</span></summary><div>{rows.map(r=><button type="button" key={r.id} aria-pressed={value===r.id} onClick={()=>choose(r.id)}>{r.name}<span>{counts[r.id]||0}</span></button>)}</div></details>
  <small className="it-region-credit">지도: <a href="https://github.com/southkorea/southkorea-maps/tree/master/kostat/2018/json" target="_blank" rel="noopener noreferrer">통계청 SGIS(2018) · 공공누리 제1유형</a> · 지역 선택용 간략 지도</small>
 </div>
}
