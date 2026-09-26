import { describe, expect, it } from 'vitest'
import { presentPublicParticipant, type PublicParticipant } from './api'

function participant(overrides: Partial<PublicParticipant> = {}): PublicParticipant {
 return {
  id: 1,
  participant: {
   sourceEntryId: 'source-1', registrationName: '.', kind: 'CIRCLE',
   members: [{name: '모나', kind: 'ARTIST', aliases: [], profileUrl: null}],
   locations: [], subjects: ['창작물'], officialLinks: [], sources: [], images: [], warnings: [],
  },
  sales: null,
  ...overrides,
 }
}

describe('presentPublicParticipant', () => {
 it('replaces a source placeholder name with the verified member name', () => {
  expect(presentPublicParticipant(participant()).participant.registrationName).toBe('모나')
 })

 it('keeps a meaningful registered booth name', () => {
  const row=participant({participant:{...participant().participant,registrationName:'한국효도협회'}})
  expect(presentPublicParticipant(row).participant.registrationName).toBe('한국효도협회')
 })

 it('uses event product names instead of collection evidence prose', () => {
  const row=participant({sales:{
   summary:'수집 확인용 긴 근거 문장', evidenceScope:'EVENT_LISTED', categories:['회지'], subjects:[], salesMethod:null,
   sources:[], images:[], warnings:[], products:[
    {sourceEntryId:'p1',name:'첫 번째 책',summary:'',memberName:null,categories:['회지'],subjects:[],evidenceScope:'EVENT_LISTED',price:null,saleState:'PLANNED',productUrl:null,sources:[],images:[],warnings:[]},
    {sourceEntryId:'p2',name:'두 번째 굿즈',summary:'',memberName:null,categories:['굿즈'],subjects:[],evidenceScope:'EVENT_SALE_CONFIRMED',price:null,saleState:'PLANNED',productUrl:null,sources:[],images:[],warnings:[]},
   ],
  }})
  expect(presentPublicParticipant(row).sales?.summary).toBe('첫 번째 책 · 두 번째 굿즈')
 })
})
