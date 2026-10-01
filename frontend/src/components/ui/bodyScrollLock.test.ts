import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireBodyScrollLock } from './bodyScrollLock'

afterEach(() => vi.unstubAllGlobals())
describe('overlapping modal scroll locks', () => {
  const body = (overflow = '') => { const style = { overflow }; vi.stubGlobal('document', { body: { style } }); return style }
  it('keeps a feedback modal locked after the calendar releases its own lock', () => {
    const style = body()
    const calendar = acquireBodyScrollLock(), feedback = acquireBodyScrollLock()
    calendar(); expect(style.overflow).toBe('hidden')
    feedback(); expect(style.overflow).toBe('')
  })
  it('restores original styles after owners release in either order', () => {
    const style = body('auto')
    const calendar = acquireBodyScrollLock(), feedback = acquireBodyScrollLock()
    feedback(); expect(style.overflow).toBe('hidden')
    calendar(); expect(style.overflow).toBe('auto')
  })
  it('does not release another owner on repeated cleanup or resize', () => {
    const style = body('scroll')
    const calendar = acquireBodyScrollLock(), feedback = acquireBodyScrollLock()
    calendar(); calendar(); expect(style.overflow).toBe('hidden')
    const mobileCalendar = acquireBodyScrollLock()
    feedback(); expect(style.overflow).toBe('hidden')
    mobileCalendar(); mobileCalendar(); expect(style.overflow).toBe('scroll')
  })
})
