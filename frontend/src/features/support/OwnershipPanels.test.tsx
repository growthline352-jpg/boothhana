import { describe,it,expect,vi,beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { OwnershipPanel,EventHistory } from './OwnershipPanels'
vi.mock('../../app/useRemote',()=>({useRemote:vi.fn()}))
const remote=vi.mocked(useRemote)
const info={organizers:[{id:1,name:'검증 단체',officialUrl:'https://example.com',verifiedAt:'2026-09-29'}],exhibitors:[{id:2,name:'작가 A',participantId:20}],series:[{id:3,name:'반복 행사',edition:'2회'}]}
const state=(data:unknown)=>({data,loading:false,error:null,reload:vi.fn(),setData:vi.fn()})
describe('verified ownership UI',()=>{
 beforeEach(()=>remote.mockReset())
 it('shows event verification separately from quality guarantees and retains claim target',()=>{
  remote.mockReturnValue(state(info) as ReturnType<typeof useRemote>)
  const html=renderToStaticMarkup(<MemoryRouter><OwnershipPanel eventId={10}/></MemoryRouter>)
  expect(html).toContain('주최자 확인');expect(html).toContain('검증 단체');expect(html).toContain('보증하지 않습니다');expect(html).toContain('category=ORGANIZER');expect(html).toContain('/support/management')
 })
 it('never marks other members or another booth as verified',()=>{
  remote.mockReturnValue(state(info) as ReturnType<typeof useRemote>)
  const html=renderToStaticMarkup(<MemoryRouter><OwnershipPanel eventId={10} participantId={21}/></MemoryRouter>)
  expect(html).not.toContain('chip active');expect(html).not.toContain('작가 A')
 })
 it('labels only the verified member of a joint booth',()=>{
  remote.mockReturnValue(state(info) as ReturnType<typeof useRemote>)
  const html=renderToStaticMarkup(<MemoryRouter><OwnershipPanel eventId={10} participantId={20}/></MemoryRouter>)
  expect(html).toContain('운영자 확인');expect(html).toContain('작가 A');expect(html).toContain('표시된 업체만 확인')
 })
 it('labels direct registration without offering a collected-booth claim or verification badge',()=>{
  remote.mockReturnValue(state({...info,directParticipantIds:[20]}) as ReturnType<typeof useRemote>)
  const html=renderToStaticMarkup(<MemoryRouter><OwnershipPanel eventId={10} participantId={20}/></MemoryRouter>)
  expect(html).toContain('직접 등록');expect(html).not.toContain('chip active');expect(html).not.toContain('kind=CLAIM');expect(html).toContain('공식 안내')
 })
 it('links independent editions rather than merging their comments or booths',()=>{
  remote.mockReturnValueOnce(state(info) as ReturnType<typeof useRemote>).mockReturnValueOnce(state({items:[{id:9,name:'1회 행사',edition:'1회',occurrences:[{startDate:'2026-05-01',endDate:'2026-05-02'}]}],total:1}) as ReturnType<typeof useRemote>)
  const html=renderToStaticMarkup(<MemoryRouter><EventHistory eventId={10}/></MemoryRouter>)
  expect(html).toContain('/discover/9');expect(html).toContain('2026-05-01 ~ 2026-05-02');expect(html).toContain('다른 회차까지 보증하지는 않습니다')
 })
})
