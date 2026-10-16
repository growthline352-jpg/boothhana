import { readConsent } from './consent'
import { emitPublicAction, publicPage, type ActionContext, type PublicAction } from './measurement'

export function trackPublicAction(action: PublicAction, context: ActionContext = {}) {
  // Recheck saved consent at action time, including a withdrawal in another tab.
  try { if (readConsent() === 'granted') emitPublicAction(action, context) } catch { /* Measurement never interrupts the action. */ }
}

export function trackPublicLink(href: string, current: string, official = false) {
  if (!publicPage(current)) return
  try {
    const url = new URL(href, current)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return
    const page = new URL(current)
    const eventId = Number(page.pathname.match(/^\/discover\/([1-9]\d*)/)?.[1]) || undefined
    if (url.origin === 'https://boothana.kr' && url.pathname === '/itinerary' || url.origin === page.origin && url.pathname === '/itinerary')
      trackPublicAction('itinerary_start', { eventId })
    else if (['map.kakao.com', 'map.naver.com', 'maps.google.com'].includes(url.hostname)) trackPublicAction('map_open', { eventId })
    else if (official && url.origin !== page.origin) trackPublicAction('official_link_click', { eventId })
  } catch { /* Invalid or private links are not measured. */ }
}
