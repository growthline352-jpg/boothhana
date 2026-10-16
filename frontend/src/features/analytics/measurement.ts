// Public measurement identifier, not an authentication secret.
export const MEASUREMENT_ID = 'G-NBLNPS9QHV'
export const CONSENT_KEY = 'boothhana.analytics-consent.v1'
const hosts = ['boothana.kr', 'subculture.boothana.kr', 'expo.boothana.kr', 'festival.boothana.kr', 'popup.boothana.kr']
export type Consent = 'granted' | 'denied' | null
export function publicPage(href: string) {
  try {
    const url = new URL(href)
    if (url.protocol !== 'https:' || !hosts.includes(url.host)) return null
    if (!/^\/(?:discover(?:\/[1-9]\d*(?:\/booths\/[1-9]\d*)?)?|events(?:\/[1-9]\d*)?)?$/.test(url.pathname)) return null
    const section = url.hostname.split('.')[0]
    return { page_location: url.origin + url.pathname, page_title: url.pathname.includes('/booths/') ? '부스 상세' : /^\/discover\/\d/.test(url.pathname) ? '행사 상세' : url.pathname === '/discover' ? '행사 검색' : '부스하나', site_section: section === 'boothana' ? 'portal' : section }
  } catch { return null }
}
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; [key: `ga-disable-${string}`]: boolean }
let initialized = false
let lastPage = ''
let measuring = false
// Return a provider origin, never a referrer's path, search term, or arbitrary host.
export function referralOrigin(value: string): string {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return ''
    const host = url.hostname.toLowerCase()
    const providers: [RegExp, string][] = [
      [/^(?:(?:www|m|images|news)\.)?google\.(?:com|co\.kr|co\.jp|co\.uk)$/, 'https://www.google.com/'],
      [/(^|\.)naver\.com$/, 'https://www.naver.com/'],
      [/(^|\.)daum\.net$/, 'https://www.daum.net/'],
      [/(^|\.)bing\.com$/, 'https://www.bing.com/'],
      [/^(?:www\.|m\.|l\.)?instagram\.com$/, 'https://www.instagram.com/'],
      [/^(?:www\.|m\.)?(?:twitter\.com|x\.com|t\.co)$/, 'https://t.co/'],
      [/^(?:www\.)?(?:chatgpt\.com|chat\.openai\.com)$/, 'https://chatgpt.com/'],
    ]
    if (hosts.includes(host)) return url.origin + '/'
    return providers.find(([pattern]) => pattern.test(host))?.[1] || ''
  } catch { return '' }
}
export const publicActions = ['event_search', 'booth_list_open', 'floorplan_open', 'map_open', 'official_link_click', 'itinerary_start', 'save_item'] as const
export type PublicAction = typeof publicActions[number]
export type ActionContext = { eventId?: number; participantId?: number; itemType?: 'EVENT' | 'PARTICIPANT' | 'PRODUCT'; resultCount?: number }
export function emitPublicAction(action: PublicAction, context: ActionContext = {}) {
  const win = window as unknown as AnalyticsWindow
  const page = publicPage(window.location.href)
  if (!initialized || !measuring || !page || win[`ga-disable-${MEASUREMENT_ID}`] || !publicActions.includes(action)) return
  const fields: Record<string, string | number> = {}
  for (const [key, value] of [['event_id', context.eventId], ['participant_id', context.participantId]] as const)
    if (Number.isSafeInteger(value) && value! > 0) fields[key] = value!
  if (context.itemType && ['EVENT', 'PARTICIPANT', 'PRODUCT'].includes(context.itemType)) fields.item_type = context.itemType
  if (typeof context.resultCount === 'number' && Number.isFinite(context.resultCount) && context.resultCount >= 0)
    fields.result_bucket = context.resultCount === 0 ? '0' : context.resultCount <= 5 ? '1-5' : '6+'
  win.gtag?.('event', action, { ...page, ...fields, send_to: MEASUREMENT_ID })
}
export function pauseMeasurement() { (window as unknown as AnalyticsWindow)[`ga-disable-${MEASUREMENT_ID}`] = true }
export function setMeasurement(consent: Consent, href: string) {
  const win = window as unknown as AnalyticsWindow
  const page = publicPage(href)
  const allowed = consent === 'granted' && !!page
  measuring = allowed
  win[`ga-disable-${MEASUREMENT_ID}`] = !allowed
  if (!allowed) {
    lastPage = ''
    if (initialized) win.gtag?.('consent', 'update', { analytics_storage: 'denied' })
    return
  }
  if (!initialized) {
    win.dataLayer = win.dataLayer || []
    win.gtag = function (..._args: unknown[]) { win.dataLayer!.push(arguments) }
    win.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
    win.gtag('js', new Date())
    win.gtag('config', MEASUREMENT_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: page.page_location, page_referrer: referralOrigin(document.referrer), cookie_domain: 'boothana.kr', ...(new URL(href).searchParams.get('analytics_debug') === '1' ? { debug_mode: true } : {}) })
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
    script.id = 'boothhana-google-analytics'
    document.head.appendChild(script)
    initialized = true
  }
  win.gtag?.('consent', 'update', { analytics_storage: 'granted' })
  const referrer = lastPage || referralOrigin(document.referrer)
  win.gtag?.('set', { page_location: page.page_location, page_referrer: referrer, page_title: page.page_title })
  if (lastPage === page.page_location) return
  win.gtag?.('event', 'page_view', { ...page, page_referrer: referrer, send_to: MEASUREMENT_ID })
  lastPage = page.page_location
}
