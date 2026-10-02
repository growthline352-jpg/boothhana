import type { InterestField, InterestOption } from '../interests/api'

const normalized=(value:string)=>value.trim().toLocaleLowerCase()
export function matchesInterest(option:InterestOption,subcategory:string,subjects:string[]) {
  return !!option.types?.includes(subcategory)||subjects.some(subject=>[option.code,...option.subjects||[]].some(alias=>normalized(alias)===normalized(subject)))
}
export function toggleEventInterest(subjects:string[],option:InterestOption,checked:boolean) {
  const without=subjects.filter(subject=>![option.code,...option.subjects||[]].some(alias=>normalized(alias)===normalized(subject)))
  return checked?[...without,option.code]:without
}
/** UI-written canonical codes belong to one field; source labels/aliases remain evidence. */
export function removeOtherCategoryInterestCodes(subjects:string[],category:string,fields:InterestField[]) {
  const current=fields.find(field=>field.code===category)
  if(!current)return subjects
  const allowed=new Set([...current.formats,...current.topics].map(option=>option.code))
  const otherCodes=new Set(fields.filter(field=>field.code!==category).flatMap(field=>[...field.formats,...field.topics].map(option=>option.code)))
  return subjects.filter(subject=>allowed.has(subject)||!otherCodes.has(subject))
}
