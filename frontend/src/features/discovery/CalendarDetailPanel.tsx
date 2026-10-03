import { BookingBadge } from '../catalog/BookingBadge'
import { eventSubjectLabels } from '../interests/taxonomy'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router'
import { ContentImage } from '../../components/ui/ContentImage'
import { acquireBodyScrollLock } from '../../components/ui/bodyScrollLock'
import type { PublicEventSummary } from '../catalog/api'
import { labels } from '../catalog/Shared'
import { eventStatus } from '../visit/eventStatus'
import { dateLabel } from './browse'
import { calendarEventRanges, calendarTone } from './calendar'
import { DiscoveryIcon } from './DiscoveryIcon'

export function CalendarDetailPanel({ day, rows, event, today, returnTo, loading, error, onClose, onSelect }: {
  day: string; rows: PublicEventSummary[]; event?: PublicEventSummary; today: string; returnTo: string
  loading: boolean; error: boolean; onClose: () => void; onSelect: (id: number | null) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const dayHeading = useRef<HTMLHeadingElement>(null), eventHeading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const selectedEventId = event?.id
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const focus = document.activeElement as HTMLElement | null
    let releaseScroll: (() => void) | null = null
    const media = window.matchMedia('(max-width: 1100px)')
    const show = () => {
      if (element.open) element.close()
      if (media.matches) { releaseScroll ??= acquireBodyScrollLock(); element.showModal() }
      else { releaseScroll?.(); releaseScroll = null; element.show() }
    }
    show(); media.addEventListener('change', show)
    return () => { media.removeEventListener('change', show); element.close(); releaseScroll?.(); if (focus?.isConnected) focus.focus() }
  }, [])
  useEffect(() => {
    const closeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog:modal')) { event.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', closeKey)
    return () => document.removeEventListener('keydown', closeKey)
  }, [onClose])
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = 0
    const focus = document.activeElement
    if (focus === document.body || dialog.current?.contains(focus)) (selectedEventId !== undefined ? eventHeading.current : dayHeading.current)?.focus({ preventScroll: true })
  }, [selectedEventId, day])
  const status = event && eventStatus(event.event, today)
  const subjects = event ? eventSubjectLabels(event.event.subcategory,event.event.subjects) : []
  const hours = event && [...new Set(event.event.occurrences.filter(value => value.startDate <= day && value.endDate >= day)
    .map(value => value.startTime ? `${value.startTime}${value.endTime ? ` ~ ${value.endTime}` : '부터'}` : '시간 확인 필요'))]
  return <dialog ref={dialog} className="calendar-detail-panel" aria-labelledby="calendar-panel-heading"
    onCancel={value => { value.preventDefault(); onClose() }} onKeyDown={value => {
      const element = dialog.current
      if (value.key !== 'Tab' || !element?.matches(':modal')) return
      const controls = [...element.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')]
      const first = controls[0], last = controls.at(-1)
      if (value.shiftKey && document.activeElement === first) { value.preventDefault(); last?.focus() }
      else if (!value.shiftKey && document.activeElement === last) { value.preventDefault(); first?.focus() }
    }}>
    <div className="calendar-panel-header"><div><p>선택한 날짜</p><h3 id="calendar-panel-heading" ref={dayHeading} tabIndex={-1}>{dateLabel(day)}</h3></div>
      <button type="button" aria-label="캘린더 상세 패널 닫기" onClick={onClose}><DiscoveryIcon name="close"/></button></div>
    <div className="calendar-panel-body" ref={body} aria-live="polite">
      {loading ? <p role="status">일정을 확인하고 있어요.</p> : error ? <p role="alert">일정을 불러오지 못했어요. 달력에서 다시 불러오기를 눌러 주세요.</p>
        : event && status ? <>
          <button type="button" className="calendar-panel-back" onClick={() => onSelect(null)}>‹ 이날 행사 {rows.length}개 보기</button>
          <div className="calendar-panel-image"><ContentImage url={event.banner?.url} kind="event" eventType={event.event.subcategory} alt={`${event.event.name} 대표 이미지`}/></div>
          <span className={`calendar-type-tag calendar-tone-${calendarTone(event.event.subcategory)}`}>{labels[event.event.subcategory] || '기타 행사'}</span>
          <h4 className="calendar-panel-event-name" ref={eventHeading} tabIndex={-1}>{event.event.name}</h4>
          <span className={`calendar-event-status is-${status.state}`}>{status.label}</span>
          <BookingBadge event={event.event} day={day}/>{status.notice && <p className="calendar-status-notice">{status.notice}</p>}
          <dl className="calendar-event-facts">
            <div><dt>일정</dt><dd>{calendarEventRanges(event).map(interval => <span key={interval.from}>{dateLabel(interval.from)}{interval.to !== interval.from && ` ~ ${dateLabel(interval.to)}`}</span>)}</dd></div>
            <div><dt>선택일 시간</dt><dd>{hours?.join(' · ') || '시간 확인 필요'}</dd></div>
            <div><dt>장소</dt><dd>{event.event.venueName || '장소 확인 필요'}{event.event.address && <small>{event.event.address}</small>}</dd></div>
            {event.event.admission && <div><dt>입장</dt><dd>{event.event.admission}</dd></div>}
          </dl>
          {!!subjects.length && <div className="calendar-subjects"><h5>주제</h5><div>{subjects.slice(0, 8).map(subject => <span key={subject}>{subject}</span>)}{subjects.length > 8 && <span>외 {subjects.length - 8}개</span>}</div></div>}
          {event.event.description && <p className="calendar-event-description">{event.event.description.slice(0, 600)}{event.event.description.length > 600 && '…'}</p>}
          <Link className="calendar-detail-link" to={`/discover/${event.id}?day=${day}`} state={{ catalogReturnTo: returnTo }}>행사 상세보기 <DiscoveryIcon name="arrow" size={17}/></Link>
        </> : <>
          <p className="calendar-panel-count">이날 공개 행사 <strong>{rows.length}개</strong></p>
          {rows.length ? <div className="calendar-panel-event-list">{rows.map(row => {
            const state = eventStatus(row.event, today)
            return <button type="button" className="calendar-panel-event" key={row.id} onClick={() => onSelect(row.id)}>
              <div className="calendar-event-image"><ContentImage url={row.banner?.url} kind="event" eventType={row.event.subcategory} alt=""/></div>
              <div><span className={`calendar-type-tag calendar-tone-${calendarTone(row.event.subcategory)}`}>{labels[row.event.subcategory] || '기타 행사'}</span><h4>{row.event.name}</h4>
                <p>{row.event.venueName || '장소 확인 필요'}</p><span className={`calendar-event-status is-${state.state}`}>{state.label}</span><BookingBadge event={row.event} day={day}/></div><DiscoveryIcon name="chevron" size={16}/>
            </button>
          })}</div> : <p className="calendar-day-empty">이 날짜에는 조건에 맞는 공개 행사가 없어요.</p>}
        </>}
    </div>
  </dialog>
}
