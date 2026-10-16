import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const f=vi.hoisted(()=>({consent:'granted',emit:vi.fn()}))
vi.mock('./consent',()=>({readConsent:()=>f.consent}))
vi.mock('./measurement',async original=>({...await original<typeof import('./measurement')>(),emitPublicAction:f.emit}))
import { trackPublicAction,trackPublicLink } from './actions'
beforeEach(()=>{f.consent='granted';f.emit.mockClear()})
afterEach(()=>vi.restoreAllMocks())
it('respects a withdrawal at action time',()=>{f.consent='denied';trackPublicAction('save_item',{eventId:20});expect(f.emit).not.toHaveBeenCalled()})
it('distinguishes official exits, maps and itinerary starts without sending target URLs',()=>{
 const page='https://expo.boothana.kr/discover/20?private=1'
 trackPublicLink('https://map.kakao.com/?q=private',page,true)
 trackPublicLink('https://boothana.kr/itinerary?event=20&private=1',page)
 trackPublicLink('https://official.example/private',page,true)
 expect(f.emit.mock.calls).toEqual([['map_open',{eventId:20}],['itinerary_start',{eventId:20}],['official_link_click',{eventId:20}]])
 expect(JSON.stringify(f.emit.mock.calls)).not.toMatch(/private|official\.example/)
})
it('does not measure private routes, invalid URLs or ordinary internal links',()=>{
 trackPublicLink('/discover/9','https://expo.boothana.kr/')
 trackPublicLink('https://example.com','https://boothana.kr/library',true)
 trackPublicLink('javascript:alert(1)','https://boothana.kr/',true)
 expect(f.emit).not.toHaveBeenCalled()
})
