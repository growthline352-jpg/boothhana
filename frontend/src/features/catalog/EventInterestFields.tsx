import { useEffect, useRef } from 'react'
import { useRemote } from '../../app/useRemote'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { TextListField } from '../../components/ui/TextListField'
import { interestApi } from '../interests/api'
import { categoryForType } from '../discovery/categories'
import { matchesInterest, removeOtherCategoryInterestCodes, toggleEventInterest } from './eventInterestEditing'
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
  return <fieldset className="visit-form-fields" disabled={disabled}><legend>관심분야 연결 · {category.label}</legend>
    <p>회원이 선택하는 분류와 같은 기준입니다. 기본 세부 분류로 연결된 항목은 위의 행사 분류를 변경하면 함께 바뀝니다.</p>
    {data.loading?<LoadingState/>:data.error?<ErrorState error={data.error} retry={()=>void data.reload()}/>:field&&(['formats','topics'] as const).map(group=><div key={group}><h4>{group==='formats'?'행사 유형':'취향 주제'}</h4><div className="row-actions">{field[group].map(option=><label className="check-field" key={option.code}><input type="checkbox" checked={matchesInterest(option,subcategory,subjects)} disabled={disabled||!!option.types?.includes(subcategory)} onChange={e=>change(toggleEventInterest(subjects,option,e.target.checked))}/>{option.label}{option.types?.includes(subcategory)&&<small> · 기본 분류</small>}</label>)}</div></div>)}
    <label className="field"><span>주제 코드·원문 태그 · 한 줄에 하나</span><TextListField className="textarea" value={subjects} change={change}/></label>
    {field&&<p role="status">노출되는 관심 항목: {[...field.formats,...field.topics].filter(o=>matchesInterest(o,subcategory,subjects)).map(o=>o.label).filter((v,i,a)=>a.indexOf(v)===i).join(' · ')||'개별 항목 없음 · 분야 전체에서 조회'}</p>}
  </fieldset>
}
