import { useEffect, useRef } from 'react'
import { useRemote } from '../../app/useRemote'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { TextListField } from '../../components/ui/TextListField'
import { interestApi } from '../interests/api'
import { categoryForType } from '../discovery/categories'
import { linkedByWork, matchesInterest, removeOtherCategoryInterestCodes, toggleEventInterest } from './eventInterestEditing'
import { eventTopicIssues } from '../interests/taxonomy'
export function EventInterestFields({subcategory,subjects,change,disabled}:{subcategory:string;subjects:string[];change:(value:string[])=>void;disabled:boolean}) {
  const data=useRemote(interestApi.options,[]),category=categoryForType(subcategory)
  const previousCategory=useRef(category.code)
  useEffect(()=>{
    if(previousCategory.current===category.code||!data.data)return
    previousCategory.current=category.code
    const next=removeOtherCategoryInterestCodes(subjects,category.code,data.data)
    if(next.length!==subjects.length)change(next)
  },[category.code,data.data,subjects,change])
  const field=data.data?.find(f=>f.code===category.code)
  const issues=eventTopicIssues(field,subcategory,subjects)
  return <fieldset className="visit-form-fields" disabled={disabled}><legend>관심분야 연결 · {category.label}</legend>
    <p>공식 안내에서 확인한 취향 주제를 선택하세요. 작품·캐릭터 이름도 함께 보존합니다. 기본 분류나 작품으로 연결된 항목은 해당 분류·원문 태그를 수정하면 바뀝니다.</p>
    {data.loading?<LoadingState/>:data.error?<ErrorState error={data.error} retry={()=>void data.reload()}/>:field&&(['formats','topics'] as const).map(group=><div key={group}><h4>{group==='formats'?'행사 유형':'취향 주제'}</h4><div className="row-actions">{field[group].map(option=><label className="check-field" key={option.code}><input type="checkbox" checked={matchesInterest(option,subcategory,subjects)} disabled={disabled||!!option.types?.includes(subcategory)||linkedByWork(option,subjects)} onChange={e=>change(toggleEventInterest(subjects,option,e.target.checked))}/>{option.label}{option.types?.includes(subcategory)?<small> · 기본 분류</small>:linkedByWork(option,subjects)&&<small> · 작품 연결</small>}</label>)}</div></div>)}
    {!!issues.length&&<div role="status" className="notice-banner">{issues.map(issue=><p key={issue}>{issue}</p>)}<p>원문을 확인해 보완하거나, 아직 확인되지 않은 이유를 검토 메모에 남겨 주세요.</p></div>}
    <label className="field"><span>취향 주제 코드와 작품·캐릭터 원문 태그 · 한 줄에 하나</span><TextListField className="textarea" value={subjects} change={change}/></label>
    {field&&<p role="status">노출되는 관심 항목: {[...field.formats,...field.topics].filter(o=>matchesInterest(o,subcategory,subjects)).map(o=>o.label).filter((v,i,a)=>a.indexOf(v)===i).join(' · ')||'개별 항목 없음 · 분야 전체에서 조회'}</p>}
  </fieldset>
}
