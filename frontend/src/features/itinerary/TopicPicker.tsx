import {useState} from 'react'
import type {PublicEventSummary} from '../catalog/api'
import {emptyTopics,subcultureTopics,subjectOptions,type TopicSelection} from './topics'

export function TopicPicker({rows,selection,change,loading,error,retry}:{rows:PublicEventSummary[];selection:TopicSelection;change:(next:TopicSelection)=>void;loading:boolean;error:string|null;retry:()=>void}){
 const [query,setQuery]=useState('')
 const options=subjectOptions(rows,selection),visible=options.filter(o=>o.value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
 const toggle=(group:keyof TopicSelection,value:string)=>change({...selection,[group]:selection[group].includes(value)?selection[group].filter(v=>v!==value):[...selection[group],value].slice(0,10),...(group==='topics'?{subjects:[]}: {})})
 return <div className="it-topics">
  <div className="it-section-title"><h3>좋아하는 주제로 찾기</h3>{!!(selection.topics.length+selection.subjects.length)&&<button type="button" onClick={()=>change(emptyTopics())}>선택 초기화</button>}</div>
  <div className="it-topic-chips" role="group" aria-label="서브컬처 취향 주제"><button type="button" aria-pressed={!selection.topics.length} onClick={()=>change(emptyTopics())}>전체 주제</button>{subcultureTopics.map(t=><button type="button" key={t.code} aria-pressed={selection.topics.includes(t.code)} onClick={()=>toggle('topics',t.code)}>{t.label}</button>)}</div>
  <details className="it-subjects" open={selection.subjects.length>0||undefined}><summary>작품·캐릭터 등 세부 주제 {selection.subjects.length>0&&<strong>{selection.subjects.join(' · ')}</strong>}</summary>
   <input className="input" aria-label="작품·캐릭터 주제 검색" placeholder="수집된 주제에서 검색 · 예: 은혼, 긴토키" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)}/>
   {loading?<p role="status">앞으로 열리는 행사의 주제를 확인하고 있어요.</p>:error?<p role="alert">주제를 불러오지 못했어요. <button type="button" onClick={retry}>다시 확인</button></p>:<div className="it-topic-chips">{visible.slice(0,40).map(o=><button type="button" key={o.value} aria-pressed={selection.subjects.includes(o.value)} onClick={()=>toggle('subjects',o.value)}>{o.value}<small>{o.count}</small></button>)}{!visible.length&&<p>확인된 주제가 없어요. 다른 주제로 찾거나 행사 이름으로 검색해 보세요.</p>}</div>}
   <small>앞으로 90일 동안 공개된 행사 태그예요. 여러 개를 고르면 선택한 주제 중 하나에 맞는 행사를 찾아요.</small>
  </details>
 </div>
}
