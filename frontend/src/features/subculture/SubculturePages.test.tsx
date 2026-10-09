import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach,describe,expect,it,vi } from 'vitest'
import { SubcultureBrowse,SubcultureResults } from './SubculturePages'
import type { Creator,Feed } from './api'

const fixture=vi.hoisted(()=>({data:null as unknown}))
vi.mock('../../app/useAuth',()=>({useAuth:()=>({status:'anonymous',loading:false})}))
vi.mock('../../app/useRemote',()=>({useRemote:()=>({data:fixture.data,loading:false,error:null})}))
vi.mock('./InterestProvider',()=>({useInterests:()=>({settings:{entries:[]},loading:false})}))
vi.mock('./FollowButton',()=>({FollowButton:()=>null}))
vi.mock('./CreatorProductPages',()=>({CreatorProductList:()=>null}))

const creator:Creator={id:1,name:'플레인요거트',kind:'CIRCLE',profileUrl:null}
const feed:Feed={personalized:true,unlinked:false,events:[],goods:[],creators:[creator],page:0,hasMore:false}
const render=(child:React.ReactNode,url='/subculture')=>renderToStaticMarkup(<MemoryRouter initialEntries={[url]}>{child}</MemoryRouter>)
beforeEach(()=>{fixture.data={...feed}})
describe('subculture discovery context',()=>{
 it('omits self recommendation and its empty section on creator detail',()=>{
  const html=render(<SubcultureResults creatorId="1"/>)
  expect(html).not.toContain('이 취향을 그리는 작가')
  expect(html).not.toContain('/subculture/creators/1')
  expect(html).toContain('다음 참가 행사')
 })
 it('keeps other related creators on a creator detail',()=>{
  fixture.data={...feed,creators:[creator,{...creator,id:2,name:'다른 작가'}]}
  const html=render(<SubcultureResults creatorId="1"/>)
  expect(html).not.toContain('/subculture/creators/1')
  expect(html).toContain('/subculture/creators/2')
 })
 it('keeps creator discovery on home and character detail even with matching numeric ids',()=>{
  for(const props of [{},{subjectId:'1'}])expect(render(<SubcultureResults {...props}/>)).toContain('/subculture/creators/1')
 })
 it('offers relevant recovery for an empty creator search',()=>{
  fixture.data=[]
  const html=render(<SubcultureBrowse kind="creators"/>,'/subculture/creators?q=없는작가')
  expect(html).toContain('다른 이름이나 서클명')
  expect(html).toContain('작가 전체 보기')
  expect(html).not.toContain('관심 설정에서 직접 입력')
 })
 it('distinguishes an empty creator catalog from a failed query',()=>{
  fixture.data=[]
  const html=render(<SubcultureBrowse kind="creators"/>)
  expect(html).toContain('아직 공개된 작가·서클이 없어요.')
  expect(html).not.toContain('작가 전체 보기')
 })
 it('retains manual character entry when no catalog character matches',()=>{
  fixture.data=[]
  expect(render(<SubcultureBrowse kind="subjects"/>)).toContain('관심 설정에서 직접 입력')
 })
})
