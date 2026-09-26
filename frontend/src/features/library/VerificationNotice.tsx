import type { MemoryVerification } from './types'

/** Same approved-product verification vocabulary as the catalog card; never a live-stock claim. */
export function VerificationNotice({ verification }: { verification?: MemoryVerification | null }) {
  const state = verification?.state || 'LEGACY'
  const time = verification?.lastSeenAt ? new Date(verification.lastSeenAt) : null
  return <div className="memory-verification">
    {state === 'NOT_RECONFIRMED' && <p className="visit-warning">최근 수집에서 재확인되지 않음 · 현재 판매 여부 확인 필요</p>}
    {state === 'LEGACY' && <p className="visit-warning">이전 수집 정보 · 재확인 이력 없음</p>}
    {time && !Number.isNaN(time.getTime()) && <small>마지막 상품 확인: {time.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small>}
  </div>
}
