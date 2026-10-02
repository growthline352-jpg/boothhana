import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router'
import {describe,it,expect,vi} from 'vitest'
import {useRemote} from '../../app/useRemote'
import {CreatorCatalogBoothPage} from './CreatorCatalogBoothPage'
vi.mock('../../app/useRemote',()=>({useRemote:vi.fn()}))
vi.mock('react-router',async original=>({...await original<typeof import('react-router')>(),useParams:()=>({eventId:'10',participantId:'new'})}))
const render=(canRegister:boolean,booths:unknown[]=[])=>{
 vi.mocked(useRemote).mockReturnValue({loading:false,error:null,reload:vi.fn(),setData:vi.fn(),data:{value:{event:{name:'공개 행사'}},booths,availability:{canRegister,eventOpen:true,existingParticipantIds:canRegister?[]:[21]},existing:null}} as ReturnType<typeof useRemote>)
 return renderToStaticMarkup(<MemoryRouter><CreatorCatalogBoothPage/></MemoryRouter>)
}
describe('direct event registration UI',()=>{
 it('blocks duplicate registration and links to existing booth management',()=>{const html=render(false,[{id:1,name:'다른 기본 부스'}]);expect(html).toContain('이미 내 부스가 연결된 행사');expect(html).toContain('/support/management');expect(html).not.toContain('등록하고 공개하기')})
 it('preserves the event destination while creating a missing base booth',()=>{const html=render(true);expect(html).toContain('기본 부스 만들기');expect(html).toContain('returnTo=%2Fcreator%2Fcatalog%2Fevents%2F10%2Fbooths%2Fnew')})
 it('offers immediate publication with event-specific fields',()=>{const html=render(true,[{id:1,name:'기본 공방',intro:'소개'}]);expect(html).toContain('등록하고 공개하기');expect(html).toContain('이번 행사에서 사용할 부스명');expect(html).toContain('참가 시작일');expect(html).toContain('주최 측 참가 승인')})
})
