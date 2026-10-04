import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogEventDetail } from './CatalogPublicPage'
import { combineOperatingDetails } from './eventGroup'
import type { PublicEvent } from './api'

vi.mock('../../app/useAuth', () => ({ useAuth: () => ({ user: null, loading: false, loginUrl: '/login' }) }))
vi.mock('../../app/useRemote', () => ({ useRemote: () => ({ data: null, loading: true, error: null, reload: vi.fn() }) }))
vi.mock('../library/ShareQr', () => ({ ShareQr: () => null }))
afterEach(() => { vi.useRealTimers() })

const day = { startDate: '2026-10-10', endDate: '2026-10-10', startTime: '10:00', endTime: '18:00' }
const members = [101, 102].map((id, index): PublicEvent => ({
  id, mode: 'INFO_ONLY', participants: [], assets: [], publishedAt: '2026-10-04T00:00:00Z',
  event: {
    name: `팝업 운영 장소 ${index + 1}`, subcategory: 'POPUP_EXPERIENCE', organizer: '주최자', edition: '2026',
    region: 'SEOUL', venueName: index ? '연남 체험관' : '성수 체험관',
    address: index ? '서울 마포구 연남로 20' : '서울 성동구 성수로 10',
    description: '같은 회차의 두 운영 장소', admission: index ? '사전예약 필수' : '현장 무료 입장',
    subjects: [], occurrences: [day], sources: [{ kind: 'OFFICIAL', access: 'ORIGINAL', url: `https://example.com/venue-${id}`, evidence: '공식 행사 장소 안내' }],
    banners: [], warnings: [],
  },
}))
const group = { rootEventId: 101, name: '두 동네 체험 팝업', members: members.map(m => ({ eventId: m.id, name: m.event.name, venueName: m.event.venueName, occurrences: m.event.occurrences })) }
members.forEach(m => { m.operatingGroup = group })

function summaryAt(query = '') {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T03:00:00Z'))
  const value = combineOperatingDetails(members[0], members)
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/discover/101${query}`]}><CatalogEventDetail eventId="101" value={value} members={members}/></MemoryRouter>)
  return html.slice(html.indexOf('<header'), html.indexOf('</header>') + '</header>'.length)
}

describe('same-day operating venues in event information', () => {
  it('allows venue selection on the information tab when neither popup has booths', () => {
    const html = summaryAt()
    expect(html).toContain('운영 행사·전시장')
    expect(html).toContain('<option value="101" selected="">')
    expect(html).toContain('<option value="102">')
    expect(html).not.toContain('소개된 부스')
  })
  it('shows the selected venue address, admission and official guide in the summary', () => {
    const html = summaryAt('?day=2026-10-10&operatingEvent=102')
    expect(html).toContain('<option value="102" selected="">')
    expect(html).toContain('서울 마포구 연남로 20')
    expect(html).toContain('사전예약 필수')
    expect(html).toContain('href="https://example.com/venue-102"')
    expect(html).not.toContain('서울 성동구 성수로 10')
    expect(html).not.toContain('현장 무료 입장')
  })
})
