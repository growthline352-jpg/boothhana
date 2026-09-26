import type { ReactNode } from 'react'

export function LoadingState({ label = '화면을 준비하고 있습니다' }: { label?: string }) {
  return <div className="state-panel" role="status"><span className="spinner" aria-hidden="true" /><h2>{label}</h2><p>잠시만 기다려 주세요.</p></div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="state-panel empty-state"><span className="state-symbol" aria-hidden="true">○</span><h2>{title}</h2><p>{description}</p>{action}</div>
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return <div className="state-panel error-state" role="alert"><span className="state-symbol" aria-hidden="true">!</span><h2>화면을 불러오지 못했습니다</h2><p>{error.message}</p>{retry && <button className="btn secondary" onClick={retry}>다시 시도</button>}</div>
}

export function FieldError({ children }: { children?: ReactNode }) {
  return children ? <p className="field-error">{children}</p> : null
}
