import { useEffect, useRef } from 'react'
import type { PublicAsset, PublicParticipant } from './api'
import { BoothContent } from './BoothContent'
import { openCatalogDialog } from './dialogLifecycle'
import { dateLabel } from '../discovery/browse'

export function BoothDrawer({ row, assets, close, trigger, day='', hall='', onMap, shareUrl, eventNotice, eventId, viewedVersion }: {
  row: PublicParticipant; assets: PublicAsset[]; close: () => void; trigger: HTMLElement | null;
  eventId?:number;viewedVersion?:string;day?:string; hall?:string; onMap?:()=>void; shareUrl?:string; eventNotice?:string|null
}) {
  const dialog = useRef<HTMLDialogElement>(null),heading = useRef<HTMLHeadingElement>(null)
  const titleId = `catalog-booth-title-${row.id}`
  useEffect(() => {
    if (!dialog.current) return
    return openCatalogDialog(dialog.current, heading.current, trigger)
  }, [trigger, row.id])
  return <dialog ref={dialog} className="catalog-drawer" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close() }}>
    <div className="catalog-drawer-heading"><div><p className="eyebrow">참가 부스 · {day?dateLabel(day):'참가일 미확인'}{hall?` · ${hall}`:''}</p>
      <h2 id={titleId} ref={heading} tabIndex={-1}>{row.participant.registrationName}</h2></div>
      <button className="btn secondary" type="button" onClick={close} aria-label="판매정보 닫기">닫기</button></div>
    <BoothContent eventId={eventId} viewedVersion={viewedVersion} row={row} assets={assets} day={day} hall={hall} onMap={onMap} shareUrl={shareUrl} eventNotice={eventNotice}/>
  </dialog>
}
