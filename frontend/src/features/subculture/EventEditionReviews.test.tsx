import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach,describe,expect,it,vi } from 'vitest'
import { EventEditionReviews } from './EventEditionReviews'
const fixture=vi.hoisted(()=>({data:{items:[{id:12,name:'지난 행사',edition:'제2회',occurrences:[]}],total:1},error:null as Error|null,loading:false}))
vi.mock('../../app/useAuth',()=>({useAuth:()=>({user:{id:7}})}))
vi.mock('../../app/useRemote',()=>({useRemote:()=>({...fixture,reload:vi.fn()})}))
vi.mock('../catalog/EventComments',()=>({EventComments:({eventId,draft}:{eventId:number;draft?:string})=><div data-comment-event={eventId}>{draft}</div>}))
const render=(query='')=>renderToStaticMarkup(<MemoryRouter initialEntries={['/discover/13?section=reviews'+query]}><EventEditionReviews eventId={13} name="이번 행사"/></MemoryRouter>)
beforeEach(()=>{fixture.error=null;fixture.loading=false})
describe('reviews for the selected public edition',()=>{
 it('reads and writes to the selected linked edition rather than the current event',()=>{
  const html=render('&reviewEvent=12')
  expect(html).toContain('data-comment-event="12"')
  expect(html).toContain('value="12" selected=""')
  expect(html).toContain('이번 회차의 장소·운영·판매 정보와 다를 수 있어요')
 })
 it('does not send reviews to an arbitrary event injected into the address',()=>{
  const html=render('&reviewEvent=999')
  expect(html).toContain('data-comment-event="13"')
  expect(html).not.toContain('data-comment-event="999"')
 })
 it('does not expose the wrong edition composer before public history is verified',()=>{
  for(const state of [{loading:true,error:null},{loading:false,error:new Error('회차 확인 실패')}]){
   Object.assign(fixture,state)
   expect(render('&reviewEvent=12')).not.toContain('data-comment-event')
  }
 })
})
