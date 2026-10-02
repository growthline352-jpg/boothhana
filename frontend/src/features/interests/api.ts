import { api, publicRead } from '../../api/client'
import type { PopularEventSummary } from '../catalog/api'

export interface InterestOption { code: string; label: string; types?: string[]; subjects?: string[]; works?: string[] }
export interface InterestField { code: string; label: string; formats: InterestOption[]; topics: InterestOption[] }
export interface InterestSelection { formats: string[]; topics: string[] }
export type InterestFields = Record<string, InterestSelection>
export interface InterestView { userId: number; revision: number; onboardingStatus: string; fields: InterestFields }
export interface FeaturedEvents { mode: 'POPULAR' | 'RECENT'; personalized: boolean; items: PopularEventSummary[] }
export const interestApi = {
  options: () => publicRead<InterestField[]>('/api/public/interests'),
  get: () => api<InterestView>('/api/me/interests', { cache: 'no-store' }),
  save: (view: InterestView, fields: InterestFields, skip = false) => api<InterestView>('/api/me/interests', {
    method: 'PUT', body: JSON.stringify({ expectedUserId: view.userId, revision: view.revision,
      onboardingStatus: skip ? 'SKIPPED' : 'DONE', fields }),
  }),
  featured: (category: string, region: string, personal: boolean) => {
    const query = new URLSearchParams({ category, region })
    return personal ? api<FeaturedEvents>(`/api/me/interests/featured?${query}`, { cache: 'no-store' })
      : publicRead<FeaturedEvents>(`/api/public/catalog/events/featured?${query}`)
  },
}

export function toggleInterest(fields: InterestFields, category: string, group: 'formats' | 'topics', code: string): InterestFields {
  const current = fields[category] ?? { formats: [], topics: [] }
  const codes = current[group]
  return { ...fields, [category]: { ...current, [group]: codes.includes(code) ? codes.filter(item => item !== code) : [...codes, code] } }
}

export function onboardingReturn(path: string | null): string {
  if (!path || path.length > 2000) return '/'
  try {
    let decoded = path
    for (let i = 0; i < 3; i++) {
      if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return '/'
      const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next
    }
    const url = new URL(path, 'https://boothhana.invalid')
    return url.origin === 'https://boothhana.invalid' && /^\/(?:|account|discover(?:\/[^/]+){0,3}|events(?:\/[^/]+)?|booths\/[^/]+(?:\/reserve)?|products\/[^/]+|reservations(?:\/[^/]+)?|library(?:\/[A-Za-z0-9_/-]+)?|support(?:\/[A-Za-z0-9_/-]+)?|creator(?:\/[A-Za-z0-9_/-]+)?|admin(?:\/[A-Za-z0-9_/-]+)?)$/.test(url.pathname) ? path : '/'
  } catch { return '/' }
}
