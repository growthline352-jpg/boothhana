import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { AccountPage } from './AccountPage'
import { AuthStatusNotice } from '../app/AuthStatusNotice'
const state=vi.hoisted(()=>({status:'anonymous',loading:false,user:null as null|{displayName:string;profileImageUrl?:string;permissions:string[]},loginUrl:'/oauth2/authorization/kakao?returnTo=%2Faccount',logout:vi.fn(),refresh:vi.fn()}))
vi.mock('../app/useAuth',()=>({useAuth:()=>state}))
const render=()=>renderToStaticMarkup(<MemoryRouter><AccountPage/></MemoryRouter>)
describe('account hub',()=>{
 beforeEach(()=>{state.status='anonymous';state.loading=false;state.user=null})
 it('offers login and library flows to guests without a duplicate offline page',()=>{const html=render();expect(html).toContain('카카오로 로그인');expect(html).toContain('href="/library"');expect(html).toContain('오프라인 자료');expect(html).not.toContain('/library?offline=1');expect(html).not.toContain('관리자 작업 공간')})
 it('shows editable profile and photo for members',()=>{state.status='authenticated';state.user={displayName:'테스트 회원',permissions:['FAN']};const html=render();expect(html).toContain('테스트 회원님');expect(html).toContain('프로필 설정');expect(html).toContain('사진 선택');expect(html).toContain('변경사항 저장');expect(html).toContain('value="테스트 회원"');expect(html).toContain('로그아웃');expect(html).not.toContain('관리자 작업 공간');expect(html).not.toContain('프로필 변경·회원 탈퇴 기능은 아직 제공하지 않습니다.')})
 it('shows the saved profile image and removal action',()=>{state.status='authenticated';state.user={displayName:'테스트 회원',profileImageUrl:'https://assets.example.test/profile.png',permissions:['FAN']};const html=render();expect(html).toContain('src="https://assets.example.test/profile.png"');expect(html).toContain('사진 사용 안 함')})
 it('hides stale identity during errors and loading',()=>{state.user={displayName:'이전 사용자',permissions:['ADMIN']};state.status='error';let html=render();expect(html).not.toContain('이전 사용자');expect(html).not.toContain('관리자 작업 공간');expect(html).toContain('다시 확인');state.loading=true;expect(render()).toContain('계정 정보를 확인하고 있어요')})
 it('does not repeat the authentication error above the account page',()=>{state.status='error';const html=renderToStaticMarkup(<MemoryRouter initialEntries={['/account']}><AuthStatusNotice/><AccountPage/></MemoryRouter>);expect(html).not.toContain('auth-status-notice');expect(html).toContain('계정 정보를 확인하지 못했어요')})
 it('shows operations only for the corresponding permission',()=>{state.status='authenticated';state.user={displayName:'운영자',permissions:['ADMIN']};const html=render();expect(html).toContain('/admin/events');expect(html).not.toContain('크리에이터 작업 공간')})
})
