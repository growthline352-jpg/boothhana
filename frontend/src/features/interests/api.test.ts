import { describe, expect, it } from 'vitest'
import { onboardingReturn, toggleInterest } from './api'

describe('category interests', () => {
  it('keeps format and topic changes inside their own category', () => {
    const input = { SUBCULTURE: { formats: ['BIRTHDAY_CAFE'], topics: ['VOCALOID'] }, FESTIVAL: { formats: ['LIVE'], topics: ['JAZZ'] } }
    const changed = toggleInterest(input, 'FESTIVAL', 'topics', 'ROCK')
    expect(changed.SUBCULTURE).toEqual(input.SUBCULTURE)
    expect(changed.FESTIVAL).toEqual({ formats: ['LIVE'], topics: ['JAZZ', 'ROCK'] })
    expect(input.FESTIVAL.topics).toEqual(['JAZZ'])
    expect(toggleInterest(changed, 'FESTIVAL', 'topics', 'JAZZ').FESTIVAL.topics).toEqual(['ROCK'])
  })
  it('returns to the interrupted public route and rejects external destinations', () => {
    expect(onboardingReturn('/discover/224?from=home')).toBe('/discover/224?from=home')
    expect(onboardingReturn('/account')).toBe('/account')
    for (const path of ['/subculture/subjects/character-1?q=blue', '/subculture/creators/42', '/subculture/products/abc-123', '/subculture/following', '/account/notifications']) expect(onboardingReturn(path)).toBe(path)
    for (const path of ['/subculture/unknown', '/subculture//bad.test', '/subculture/subjects/%2f%2fbad.test', '/subculture/subjects/%5cbad.test']) expect(onboardingReturn(path)).toBe('/')
    for (const path of ['https://bad.test', '//bad.test', '/\\bad.test', '/onboarding', '/discover/2\n']) expect(onboardingReturn(path)).toBe('/')
  })
})
