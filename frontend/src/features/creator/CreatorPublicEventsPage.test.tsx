import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRemote } from '../../app/useRemote'
import { publicRead } from '../../api/client'
import { CreatorPublicEventsPage, registrationQuery } from './CreatorPublicEventsPage'
import { CreatorEventsPage } from './CreatorEventsPage'
import { CatalogBoothList } from './CreatorCatalogBoothPage'
import { creatorCatalogApi } from './catalogApi'

vi.mock('../../app/useRemote', () => ({ useRemote: vi.fn() }))
vi.mock('../../api/client', async original => ({ ...await original<typeof import('../../api/client')>(), publicRead: vi.fn() }))
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const remote = (data: unknown, error: Error | null = null) => ({ data, loading: false, error, reload: vi.fn(), setData: vi.fn() }) as ReturnType<typeof useRemote>
const event = (id: number, state = 'SCHEDULED') => ({ id, event: { name: `행사 ${id}`, venueName: '서울 전시장', operationStatus: { state }, occurrences: [{ startDate: '2026-10-10', endDate: '2026-10-11' }] } })
function render(items: unknown[], booths: unknown[] = [], error: Error | null = null) {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T03:00:00Z'))
  vi.mocked(useRemote).mockReturnValue(remote({ events: { items, page: 0, size: 20, total: items.length }, booths }, error))
  return renderToStaticMarkup(<MemoryRouter><CreatorPublicEventsPage /></MemoryRouter>)
}

describe('creator public event registration', () => {
  it('keeps both registration entry points in the creator workspace', () => {
    vi.mocked(useRemote).mockReturnValue(remote([]))
    for (const component of [<CreatorEventsPage />, <CatalogBoothList />]) {
      const html = renderToStaticMarkup(<MemoryRouter>{component}</MemoryRouter>)
      expect(html).toContain('href="/creator/catalog/events"')
      expect(html).not.toContain('href="/discover"')
    }
  })
  it.each([['subculture', 'SUBCULTURE'], ['exhibitions', 'EXHIBITION'], ['festivals', 'FESTIVAL']] as const)(
    'defaults to the %s site and queries exact event IDs, including ongoing events', (site, code) => {
      const query = registrationQuery(new URLSearchParams(), '2026-10-03', site)
      expect(query.get('category')).toBe(code)
      expect(query.get('from')).toBe('2026-10-03')
      expect(query.get('grouped')).toBe('false')
      expect(query.get('sort')).toBe('DATE_ASC')
    })
  it('supports explicit creator category selection and rejects malformed paging/search', () => {
    const query = registrationQuery(new URLSearchParams({ category: 'festivals', page: '-1', q: 'x'.repeat(150) }), '2026-10-03', 'subculture')
    expect(query.get('category')).toBe('FESTIVAL')
    expect(query.get('page')).toBe('0')
    expect(query.get('q')).toHaveLength(100)
    expect(registrationQuery(new URLSearchParams('page=2'), '2026-10-03', null).get('page')).toBe('2')
  })
  it('links each event directly to registration and existing registrations to management', () => {
    const html = render([event(10), event(11)], [{ eventId: 11, participantId: 99, reviewState: 'REVIEWED' }])
    expect(html).toContain('href="/creator/catalog/events/10/booths/new"')
    expect(html).toContain('href="/creator/catalog/events/11/booths/99"')
    expect(html).not.toContain('/11/booths/new')
    expect(html).toContain('부스 관리')
    expect(html).toContain('href="/support/management"')
  })
  it.each(['CANCELED', 'POSTPONED', 'RESCHEDULED'])('does not offer registration for %s events', state => {
    const html = render([event(10, state)])
    expect(html).toContain('등록 마감')
    expect(html).not.toContain('/10/booths/new')
  })
  it('does not route an excluded booth to a forbidden edit screen', () => {
    const html = render([event(10)], [{ eventId: 10, participantId: 99, reviewState: 'EXCLUDED' }])
    expect(html).toContain('/10/booths/new')
    expect(html).not.toContain('/10/booths/99')
  })
  it('shows an empty result or retryable error without exposing stale action links', () => {
    expect(render([])).toContain('조건에 맞는 공개 행사가 없습니다')
    const html = render([event(10)], [], new Error('통신 실패'))
    expect(html).toContain('다시 시도')
    expect(html).not.toContain('/10/booths/new')
  })
  it('passes through ungrouped API rows without customer edition consolidation', async () => {
    const page = { items: [event(10), event(11)], total: 2, page: 0, size: 20 }
    vi.mocked(publicRead).mockResolvedValue(page)
    const query = registrationQuery(new URLSearchParams(), '2026-10-03', 'subculture')
    expect(await creatorCatalogApi.events(query)).toBe(page)
    expect(publicRead).toHaveBeenCalledWith(`/api/public/catalog/events?${query}`)
  })
})
