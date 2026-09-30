import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { PrivacyPage, TermsPage } from './LegalPages'

describe('legal drafts', () => {
  it('explains actual account, comment, storage and analytics flows without inventing an operator', () => {
    const html = renderToStaticMarkup(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    for (const value of ['카카오 로그인', '보관함·방문 기록', '댓글·후기', 'Google Analytics', '운영 주체명', '검토용 초안']) {
      expect(html).toContain(value)
    }
    expect(html).toContain('href="/support"')
  })

  it('separates external event listings from direct reservations and links to privacy', () => {
    const html = renderToStaticMarkup(<MemoryRouter><TermsPage /></MemoryRouter>)
    expect(html).toContain('외부 수집 행사')
    expect(html).toContain('예약 가능한 행사')
    expect(html).toContain('href="/privacy"')
    expect(html).toContain('검토용 초안')
  })
})
