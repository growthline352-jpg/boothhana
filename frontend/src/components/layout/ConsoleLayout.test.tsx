import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../app/useAuth'
import { ConsoleLayout } from './ConsoleLayout'

vi.mock('../../app/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../../app/PageMetadata', () => ({ PageMetadata: () => null }))

function render(role: 'CREATOR' | 'ADMIN', permissions: string[], ownership = false, signedIn = true) {
  vi.mocked(useAuth).mockReturnValue({ user: signedIn ? { id: 1, displayName: '테스트', permissions } : null, status: signedIn ? 'authenticated' : 'anonymous', loading: false, loginUrl: '/login' } as ReturnType<typeof useAuth>)
  const layout = role === 'ADMIN' ? <ConsoleLayout role="ADMIN" /> : <ConsoleLayout role="CREATOR" access={ownership ? 'ownership' : undefined} />
  return renderToStaticMarkup(<MemoryRouter initialEntries={['/support/management']}><Routes><Route element={layout}><Route path="/support/management" element={<p>관리 화면 본문</p>} /></Route></Routes></MemoryRouter>)
}

describe('ownership console access', () => {
  it('keeps signed-in non-creator owners able to manage their grants', () => {
    const html = render('CREATOR', ['FAN'], true)
    expect(html).toContain('관리 화면 본문')
    expect(html).not.toContain('href="/creator/pos"')
  })
  it('does not loosen normal creator or administrator access', () => {
    expect(render('CREATOR', ['FAN'])).toContain('접근 권한이 없습니다')
    expect(render('ADMIN', ['FAN'])).toContain('관리자 계정이 아닙니다')
  })
  it('still requires login for ownership management', () => {
    const html = render('CREATOR', [], true, false)
    expect(html).toContain('로그인이 필요합니다')
    expect(html).not.toContain('관리 화면 본문')
  })
  it('highlights management without also highlighting customer support', () => {
    const html = render('CREATOR', ['FAN', 'CREATOR'], true)
    expect(html).toContain('href="/creator/pos"')
    const activeLinks = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? []
    expect(activeLinks).toHaveLength(2)
    for (const link of activeLinks) expect(link).toContain('href="/support/management"')
  })
})
