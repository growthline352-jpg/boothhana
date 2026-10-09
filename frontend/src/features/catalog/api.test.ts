import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLD_START_API_TIMEOUT_MS, COLD_START_RETRY_DELAY_MS, canonicalProductionUrl, resetCsrfToken } from '../../api/client'
import { presentPublicParticipant, publicCatalogApi, type PublicParticipant } from './api'

afterEach(() => { resetCsrfToken(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

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

describe('public catalog requests', () => {
 it('allows a sleeping production service enough time to wake up', async () => {
  const timeout=vi.spyOn(AbortSignal,'timeout')
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[],page:0,size:20,total:0}),{
   status:200,headers:{'Content-Type':'application/json'},
  })))

  await publicCatalogApi.events()

  expect(timeout).toHaveBeenCalledWith(COLD_START_API_TIMEOUT_MS)
  expect(COLD_START_API_TIMEOUT_MS).toBe(75_000)
 })

 it('retries one transient cold-start failure', async () => {
  vi.useFakeTimers()
  const fetch=vi.fn()
   .mockRejectedValueOnce(new DOMException('The operation timed out','TimeoutError'))
   .mockResolvedValueOnce(new Response(JSON.stringify({items:[],page:0,size:20,total:0}),{
    status:200,headers:{'Content-Type':'application/json'},
   }))
  vi.stubGlobal('fetch',fetch)

  const result=publicCatalogApi.events()
  await vi.advanceTimersByTimeAsync(COLD_START_RETRY_DELAY_MS)

  await expect(result).resolves.toMatchObject({items:[],total:0})
  expect(fetch).toHaveBeenCalledTimes(2)
 })

 it('does not retry permanent HTTP failures', async () => {
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({
   status:403,code:'FORBIDDEN',message:'접근 권한이 없습니다.',
  }),{status:403,headers:{'Content-Type':'application/json'}}))
  vi.stubGlobal('fetch',fetch)

  await expect(publicCatalogApi.events()).rejects.toMatchObject({status:403,code:'FORBIDDEN'})
  expect(fetch).toHaveBeenCalledTimes(1)
 })
})

describe('canonicalProductionUrl', () => {
 it('moves Vercel preview hosts to the production host without losing the route', () => {
  expect(canonicalProductionUrl('https://boothhana-git-fix-example.vercel.app/discover/13?view=map#booths',true))
   .toBe('https://boothhana.vercel.app/discover/13?view=map#booths')
 })

 it('leaves the production host, custom domains and local development alone', () => {
  expect(canonicalProductionUrl('https://boothhana.vercel.app/discover',true)).toBeNull()
  expect(canonicalProductionUrl('https://events.example.com/discover',true)).toBeNull()
  expect(canonicalProductionUrl('https://preview.vercel.app/discover',false)).toBeNull()
 })
})
