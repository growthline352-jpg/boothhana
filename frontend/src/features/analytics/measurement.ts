// Public measurement identifier, not an authentication secret.
export const MEASUREMENT_ID = 'G-NBLNPS9QHV'
export const CONSENT_KEY = 'boothhana.analytics-consent.v1'
const hosts = ['boothana.kr', 'subculture.boothana.kr', 'expo.boothana.kr', 'festival.boothana.kr']
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
export function pauseMeasurement() { (window as unknown as AnalyticsWindow)[`ga-disable-${MEASUREMENT_ID}`] = true }
export function setMeasurement(consent: Consent, href: string) {
  const win = window as unknown as AnalyticsWindow
  const page = publicPage(href)
  const allowed = consent === 'granted' && !!page
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
    win.gtag('config', MEASUREMENT_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: page.page_location, page_referrer: '', cookie_domain: 'boothana.kr' })
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
    script.id = 'boothhana-google-analytics'
    document.head.appendChild(script)
    initialized = true
  }
  win.gtag?.('consent', 'update', { analytics_storage: 'granted' })
  win.gtag?.('set', { page_location: page.page_location, page_referrer: lastPage, page_title: page.page_title })
  if (lastPage === page.page_location) return
  win.gtag?.('event', 'page_view', { ...page, page_referrer: lastPage, send_to: MEASUREMENT_ID })
  lastPage = page.page_location
}
