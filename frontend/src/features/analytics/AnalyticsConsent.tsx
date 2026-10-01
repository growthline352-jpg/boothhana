import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { CONSENT_KEY, publicPage, setMeasurement, pauseMeasurement, type Consent } from './measurement'
import './analytics.css'

function readConsent(): Consent {
  try { const value = localStorage.getItem(CONSENT_KEY); return value === 'granted' || value === 'denied' ? value : null } catch { return null }
}
export function AnalyticsConsent() {
  const location = useLocation()
  const [consent, setConsent] = useState<Consent>(readConsent)
  const [open, setOpen] = useState(false)
  useEffect(() => { setMeasurement(consent, window.location.href) }, [consent, location.pathname, location.search])
  useEffect(() => {
    const sync = () => setConsent(readConsent())
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener('storage', sync); pauseMeasurement() }
  }, [])
  const choose = (value: Consent) => {
    try { localStorage.setItem(CONSENT_KEY, value!) } catch { /* In-memory consent still works. */ }
    setConsent(value); setOpen(false)
    if (value === 'denied') {
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.trim().split('=')[0]
        if (name === '_ga' || name.startsWith('_ga_')) {
          document.cookie = `${name}=; Max-Age=0; Path=/; Domain=boothana.kr; Secure; SameSite=Lax`
          document.cookie = `${name}=; Max-Age=0; Path=/; Secure; SameSite=Lax`
        }
      }
    }
  }
  if (!publicPage(window.location.href)) return null
  return <aside className="analytics-settings" aria-label="방문 통계 설정">
    <button type="button" onClick={() => setOpen(!open)}>방문 통계 설정</button>
    {(consent === null || open) && <div className="analytics-notice" role="region" aria-label="선택적 방문 통계">
      <strong>서비스 개선을 위한 방문 통계</strong>
      <p>동의하면 Google Analytics가 쿠키를 사용해 기기·브라우저 정보와 공개 페이지 방문을 측정합니다. 검색어, 문의 내용, 계정 정보는 보내지 않습니다. 광고 추적은 사용하지 않으며 거절해도 서비스 이용에 영향이 없습니다. 이 설정에서 언제든 철회할 수 있습니다.</p>
      <div><button type="button" className="btn secondary" onClick={() => choose('denied')}>거절</button><button type="button" className="btn primary" onClick={() => choose('granted')}>분석 허용</button></div>
    </div>}
  </aside>
}
