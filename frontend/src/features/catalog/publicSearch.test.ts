import {describe,it,expect} from 'vitest'
import type {PublicParticipant} from './api'
import {matchesPublicParticipant,matchesParticipantFacet,normalizePublicSearch} from './publicSearch'
import {attendance} from '../visit/visit'
const row:PublicParticipant={id:1,participant:{registrationName:'판매 부스',sourceEntryId:null,kind:'CIRCLE',members:[],subjects:['블루아카이브','하츠네 미쿠'],locations:[{code:null,status:'UNKNOWN',hall:null,zone:null,startDate:'2026-10-24',endDate:'2026-10-25',floorPlanUrl:null}],officialLinks:[],sources:[],images:[],warnings:[]},sales:{summary:'크툴루 인형',categories:['인형'],subjects:['크툴루'],salesMethod:null,evidenceScope:'EVENT_LISTED',sources:[],images:[],products:[],warnings:[]}}
describe('public information discovery',()=>{
 it('finds public subjects by aliases without expanding another character name',()=>{
  expect(matchesPublicParticipant(row,'블아')).toBe(true)
  expect(matchesPublicParticipant(row,'미쿠')).toBe(true)
  expect(normalizePublicSearch('미쿠니')).toBe('미쿠니')
  expect(matchesParticipantFacet(row,'category','인형')).toBe(true)
  expect(matchesParticipantFacet(row,'subject','보컬로이드')).toBe(false)
 })
 it('does not confirm a copied event period, but applies a separately declared visit day',()=>{
  expect(attendance(row,'2026-10-24')).toBe('unknown')
  const declared={...row,participant:{...row.participant,locations:[{...row.participant.locations[0],startDate:'2026-10-25',endDate:'2026-10-25',dateEvidence:'DECLARED' as const}]}}
  expect(attendance(declared,'2026-10-24')).toBe('other')
  expect(attendance(declared,'2026-10-25')).toBe('confirmed')
 })
})
