import {Link} from 'react-router'
import type {PublicEventSummary} from '../catalog/api'
import {categories,categoryForType} from '../discovery/categories'
import {ContentImage} from '../../components/ui/ContentImage'
import {DiscoveryIcon} from '../discovery/DiscoveryIcon'
import {TopicPicker} from './TopicPicker'
import {emptyTopics,type TopicSelection} from './topics'
import {useState} from 'react'

export function EventPicker({rows,allRows,field,setField,query,setQuery,anchor,choose,topics,interests,changeTopics,topicLoading,topicError,retryTopics,day}:{
 rows:PublicEventSummary[];allRows:PublicEventSummary[];field:string;setField:(field:string)=>void;query:string;setQuery:(query:string)=>void;
 anchor:PublicEventSummary|null;choose:(row:PublicEventSummary)=>void;topics:PublicEventSummary[];interests?:TopicSelection;changeTopics:(selection:TopicSelection)=>void;
 topicLoading:boolean;topicError:string|null;retryTopics:()=>void;day:string;
}){
 // Reset the page when the user changes a lookup key, without hiding the chosen event.
 const [page,setPage]=useState({key:'',size:18}),key=`${day}:${field}:${query}:${JSON.stringify(interests)}`
 const limit=page.key===key?page.size:18
 const total=(code:string)=>allRows.filter(r=>code==='ALL'||categoryForType(r.event.subcategory).code===code).length
 return <div className="it-event-browser">
  <div className="it-category-tabs" role="group" aria-label="행사 분야">{[{code:'ALL',label:'전체'},...categories].map(c=><button type="button" key={c.code} aria-pressed={field===c.code} onClick={()=>setField(c.code)}>{c.label}<span>{total(c.code)}</span></button>)}</div>
  <label className="it-wizard-search"><DiscoveryIcon name="search" size={18}/><input className="input" value={query} onChange={e=>setQuery(e.target.value)} aria-label="행사 이름 검색" placeholder="행사 이름으로 찾아보세요"/></label>
  {field==='SUBCULTURE'&&<TopicPicker rows={topics} selection={interests||emptyTopics()} change={changeTopics} loading={topicLoading} error={topicError} retry={retryTopics}/>}
  <p className="it-event-results-count">{rows.length}개의 행사 <span>한 곳을 선택해 코스를 시작하세요</span></p>
  <div className="it-event-cards">{rows.slice(0,limit).map(row=>{
   const occurrence=row.event.occurrences.find(o=>o.startDate<=day&&o.endDate>=day)
   return <article key={row.id} className={anchor?.id===row.id?'is-selected':''}>
    <button type="button" className="it-event-select" aria-pressed={anchor?.id===row.id} onClick={()=>choose(row)}>
     <ContentImage url={row.banner?.url} kind="event" eventType={row.event.subcategory} alt=""/>
     <span className="it-event-card-body"><small>{categoryForType(row.event.subcategory).label}</small><strong>{row.event.name}</strong><span>{row.event.venueName||'장소 확인 필요'}</span><span>{occurrence?.startTime?`${occurrence.startTime.slice(0,5)}${occurrence.endTime?'–'+occurrence.endTime.slice(0,5):'부터'}`:'운영 시간 확인 필요'}</span></span>
     <span className="it-event-select-mark">{anchor?.id===row.id?<><DiscoveryIcon name="check" size={16}/>선택됨</>:'이 행사 선택'}</span>
    </button>
    <Link to={`/discover/${row.id}?day=${day}`} target="_blank" rel="noopener noreferrer" aria-label={`${row.event.name} 상세 보기 (새 창)`}>상세 보기 <span aria-hidden="true">↗</span></Link>
   </article>
  })}</div>
  {!rows.length&&<div className="it-wizard-empty"><DiscoveryIcon name="calendar" size={26}/><h3>{allRows.length?'검색 조건에 맞는 행사가 없어요':'이 날짜에 공개된 행사가 없어요'}</h3><p>{allRows.length?'검색어나 행사 분야, 관심 주제를 바꿔보세요.':'다른 날짜나 가까운 지역을 선택해보세요.'}</p>{allRows.length>0&&<button className="btn secondary" onClick={()=>{setQuery('');setField('ALL');changeTopics(emptyTopics())}}>전체 행사 보기</button>}</div>}
  {rows.length>limit&&<button className="it-event-more btn secondary" onClick={()=>setPage({key,size:limit+18})}>행사 더 보기 ({rows.length-limit}개)</button>}
 </div>
}
