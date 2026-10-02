import { describe, expect, it } from 'vitest'
import { matchesInterest, removeOtherCategoryInterestCodes, toggleEventInterest } from './eventInterestEditing'
import type { InterestField, InterestOption } from '../interests/api'

const vocaloid:InterestOption={code:'VOCALOID',label:'보컬로이드',subjects:['보컬로이드','하츠네 미쿠'],types:[]}
const comic:InterestOption={code:'COMIC_DOUJIN',label:'코믹·동인',subjects:[],types:['COMIC_DOUJIN']}
const fields:InterestField[]=[
  {code:'SUBCULTURE',label:'서브컬처',formats:[comic],topics:[vocaloid]},
  {code:'EXHIBITION',label:'박람회',formats:[{code:'FAIR',label:'박람회'}],topics:[{code:'DESIGN',label:'디자인'}]},
  {code:'FESTIVAL',label:'축제',formats:[{code:'LIVE',label:'공연'}],topics:[{code:'JAZZ',label:'재즈',subjects:['재즈']}]},
]

describe('administrator interest classification',()=>{
  it('uses reviewed subject aliases and the event subtype for automatic selections',()=>{
    expect(matchesInterest(vocaloid,'ONLY_EVENT',[' 하츠네 미쿠 '])).toBe(true)
    expect(matchesInterest(comic,'COMIC_DOUJIN',[])).toBe(true)
    expect(matchesInterest(vocaloid,'COMIC_DOUJIN',['행사 소개'])).toBe(false)
  })
  it('stores manual selections in canonical form without removing unrelated source tags',()=>{
    expect(toggleEventInterest(['행사 소개','하츠네 미쿠'],vocaloid,true)).toEqual(['행사 소개','VOCALOID'])
  })
  it('removes previous-field codes when changing field and retains descriptive source tags',()=>{
    expect(removeOtherCategoryInterestCodes(['VOCALOID','COMIC_DOUJIN','JAZZ','하츠네 미쿠','재즈','원작 생일 행사'],'FESTIVAL',fields))
      .toEqual(['JAZZ','하츠네 미쿠','재즈','원작 생일 행사'])
  })
  it('preserves codes valid in both fields and does not reinterpret arbitrary source words',()=>{
    const shared=[...fields,{code:'EXTRA',label:'기타',formats:[],topics:[vocaloid]}]
    expect(removeOtherCategoryInterestCodes(['VOCALOID','vocaloid','JAZZ'],'EXTRA',shared)).toEqual(['VOCALOID','vocaloid'])
    expect(removeOtherCategoryInterestCodes(['VOCALOID'],'NOT_LOADED',fields)).toEqual(['VOCALOID'])
  })
})
