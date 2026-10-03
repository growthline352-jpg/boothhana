import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { publicPage, setMeasurement, pauseMeasurement, type Consent } from './measurement'
import { readConsent, saveConsent } from './consent'
import './analytics.css'

export function AnalyticsConsent() {
  const location = useLocation()
  const [consent, setConsent] = useState<Consent>(readConsent)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const current = readConsent()
    setConsent(current)
    setMeasurement(current, window.location.href)
  }, [consent, location.pathname, location.search])
  useEffect(() => {
    const sync = () => {
      const current = readConsent()
      setConsent(current)
      setMeasurement(current, window.location.href)
    }
    const visible = () => { if (document.visibilityState === 'visible') sync() }
    window.addEventListener('storage', sync)
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', visible)
      pauseMeasurement()
    }
  }, [])
  const choose = (value: Exclude<Consent, null>) => {
    saveConsent(value)
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
  return <div className="analytics-settings">
    <button type="button" aria-expanded={consent === null || open} aria-controls="analytics-notice" onClick={() => setOpen(!open)}>방문 통계 설정</button>
    {(consent === null || open) && <div id="analytics-notice" className="analytics-notice" role="region" aria-label="선택적 방문 통계">
      <strong>서비스 개선을 위한 방문 통계</strong>
      <p>동의하면 Google Analytics가 쿠키를 사용해 기기·브라우저 정보와 공개 페이지 방문을 측정합니다. 검색어, 문의 내용, 계정 정보는 보내지 않습니다. 광고 추적은 사용하지 않으며 거절해도 서비스 이용에 영향이 없습니다. 선택은 부스하나의 서브컬처·박람회·축제에서 함께 적용되며, 하단 설정에서 언제든 바꿀 수 있습니다.</p>
      <div><button type="button" className="btn secondary" onClick={() => choose('denied')}>거절</button><button type="button" className="btn primary" onClick={() => choose('granted')}>분석 허용</button></div>
    </div>}
  </div>
}
