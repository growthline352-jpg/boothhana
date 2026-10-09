import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterHomeHero } from './CharacterHomeHero'
import { SubcultureHeader, SubcultureMobileNav } from './SubcultureChrome'
import type { Interest, Subject } from './api'
const f = vi.hoisted(() => ({status: 'authenticated', entries: [] as Interest[], subjects: [] as Subject[]}))
vi.mock('../../app/useAuth', () => ({useAuth: () => ({status: f.status, loading: false, generation: 1})}))
vi.mock('../../app/useRemote', () => ({useRemote: () => ({data: f.subjects, loading: false, error: null})}))
vi.mock('./InterestProvider', () => ({useInterests: () => ({settings: {revision: 1, entries: f.entries}, loading: false, error: null})}))
vi.mock('./FollowButton', () => ({FollowButton: ({entry}: {entry: Interest}) => <button aria-label={entry.label + ' 관심 해제'}>♥</button>}))
vi.mock('../discovery/site', () => ({currentSiteCategory: () => 'subculture', currentSiteOrigin: () => 'https://subculture.boothana.kr', categorySitesActive: () => true, isLocalPreview: () => false}))
const character: Interest = {id: 'interest-1', subjectId: 'character-1', exhibitorId: null, customName: '', customWork: '', medium: '', customWorkId: null, label: '관심 캐릭터', workName: '게임 A', kind: 'CHARACTER', available: true}
const render = (url = '/') => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><CharacterHomeHero/></MemoryRouter>)
beforeEach(() => {f.status = 'authenticated'; f.entries = [character]; f.subjects = []})
describe('selected character hero', () => {
  it('shows saved identities with work context, hearts and detail links', () => {
    const html = render()
    expect(html).toContain('좋아하는 캐릭터부터,'); expect(html).toContain('게임 A')
    expect(html).toContain('href="/subculture/subjects/character-1"')
    expect(html).toContain('관심 캐릭터 관심 해제'); expect(html).not.toContain('관심등록됨')
    for (const label of ['작가·서클 둘러보기', '갈 행사부터 찾기', '내 방문 준비']) expect(html).toContain(label)
  })
  it('does not turn custom entries into public character links', () => {
    f.entries = [{...character, subjectId: null, kind: undefined, label: '', customName: '직접 입력', customWork: '직접 작품'}]
    const html = render(); expect(html).toContain('직접 입력 · 정보 연결 대기'); expect(html).toContain('href="/account/interests"'); expect(html).not.toContain('href="/subculture/subjects/character-1"')
  })
  it('filters by parent ID when only a work is followed', () => {
    f.entries = [{...character, subjectId: 'work-1', kind: 'WORK', label: '게임 A'}]
    f.subjects = [1, 2].map(id => ({id: 'c' + id, kind: 'CHARACTER', name: '캐릭터 ' + id, workId: 'work-' + id, workName: '게임 A', medium: '', sourceUrl: '', revision: 0}))
    const html = render('/?work=' + encodeURIComponent('게임 A')); expect(html).toContain('캐릭터 1'); expect(html).not.toContain('캐릭터 2')
  })
  it('never shows prior member interests to an anonymous visitor', () => {
    f.status = 'anonymous'; const html = render(); expect(html).not.toContain('href="/subculture/subjects/character-1"'); expect(html).toContain('등록된 캐릭터를 준비하고 있어요.')
  })
  it('clamps card pages without hiding the last character', () => {
    f.entries = [character, {...character, id: 'i2', subjectId: 'c2'}, {...character, id: 'i3', subjectId: 'c3', label: '마지막 캐릭터'}]
    const html = render('/?characterSlide=99999'); expect(html).toContain('마지막 캐릭터'); expect(html).not.toContain('href="/subculture/subjects/character-1"')
  })
  it('keeps unpublished identities out of public detail routes', () => {
    f.entries = [{...character, available: false}]; expect(render()).toContain('현재 비공개'); expect(render()).not.toContain('href="/subculture/subjects/character-1"')
  })
  it('restores the header and mobile navigation without category tabs', () => {
    const html = renderToStaticMarkup(<MemoryRouter><SubcultureHeader accountMenu={<button>계정</button>}/><SubcultureMobileNav/></MemoryRouter>)
    expect(html).toContain('/assets/categories/subculture-3d.webp')
    for (const label of ['캐릭터 탐색', '캐릭터·작가 검색', '알림', '내 방문', '마이']) expect(html).toContain(label)
    expect(html).not.toContain('박람회'); expect(html).not.toContain('일정 만들기')
  })
})
