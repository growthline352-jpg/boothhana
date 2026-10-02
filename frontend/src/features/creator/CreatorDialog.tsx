import { useEffect, useId, useRef, type ReactNode } from 'react'
import { openCatalogDialog } from '../catalog/dialogLifecycle'

export function CreatorDialog({ title, close, children, busy = false, className = '' }: {
  title: string; close: () => void; children: ReactNode; busy?: boolean; className?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!dialog.current) return
    return openCatalogDialog(dialog.current, heading.current, document.activeElement as HTMLElement | null)
  }, [])
  return <dialog ref={dialog} className={`creator-dialog ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <div className="panel-header"><h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>
      <button type="button" className="btn secondary" disabled={busy} onClick={close}>닫기</button></div>
    {children}
  </dialog>
}
