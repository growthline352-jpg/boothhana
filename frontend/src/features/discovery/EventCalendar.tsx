import { eventBooking } from '../catalog/booking'
import { useBookingNow } from '../catalog/BookingBadge'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { publicCatalogApi } from '../catalog/api'
import { labels } from '../catalog/Shared'
import { eventStatus } from '../visit/eventStatus'
import { dateLabel, type BrowseState } from './browse'
import { calendarApiParams, calendarEventsByDay, calendarMonth, calendarSelectedEvent, calendarTone, calendarWeeks, monthRange, shiftMonth } from './calendar'
import { CalendarDetailPanel } from './CalendarDetailPanel'
import './calendar.css'

export function EventCalendar({ state, today, returnTo, update }: { state: BrowseState; today: string; returnTo: string; update: (changes: Record<string, string>) => void }) {
  const [params] = useSearchParams()
  const now=useBookingNow()
  const month = calendarMonth(params.get('month'), today), range = monthRange(month)
  const candidate = params.get('day') || ''
  const selected = candidate >= range.from && candidate <= range.to && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : ''
  const query = calendarApiParams(state, month).toString()
  const events = useRemote("features/discovery/EventCalendar:EventCalendar:events", () => publicCatalogApi.calendar(query), [query])
  const rows = !events.loading && !events.error ? events.data ?? [] : []
  const byDay = calendarEventsByDay(rows, month), weeks = calendarWeeks(rows, month)
  const selectedRows = byDay.get(selected) ?? []
  const selectedEvent = calendarSelectedEvent(selectedRows, selected, params.get('calendarEvent'))
  const monthLabel = `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`
  const move = (next: string) => update({ month: next, day: '', calendarEvent: '' })
  const pickDay = (day: string) => update({ day, calendarEvent: '' })
  return <div className="event-calendar">
    <div className="calendar-heading"><h3 id="calendar-month">{monthLabel}</h3><nav aria-label="캘린더 월 이동">
      <button type="button" disabled={month === '1000-01'} aria-label="이전 달" onClick={() => move(shiftMonth(month, -1))}>‹</button>
      <button type="button" onClick={() => update({ month: today.slice(0, 7), day: today, calendarEvent: '' })}>오늘</button>
      <button type="button" disabled={month === '9998-12'} aria-label="다음 달" onClick={() => move(shiftMonth(month, 1))}>›</button></nav></div>
    <p className="calendar-summary" role="status">{events.loading ? '이달의 일정을 확인하고 있어요.' : events.error ? '일정을 불러오지 못했어요.' : `${monthLabel} 공개 행사 ${rows.length}개`} <span>날짜나 행사 막대를 눌러 자세히 보세요.</span></p>
    <div className="calendar-legend" aria-label="행사 분류별 색상">{state.category.filters.filter(filter => filter.value).map(filter => <span key={filter.value}><i aria-hidden="true" className={`calendar-tone-${calendarTone(filter.value)}`}/>{filter.label}</span>)}</div>
    <div className={`calendar-workspace${selected ? ' has-panel' : ''}`}>
      <div className="calendar-month-view">
        {events.error ? <div className="calendar-error" role="alert"><p>{events.error.message}</p><button type="button" onClick={() => void events.reload()}>다시 불러오기</button></div>
          : <div className="calendar-grid" aria-labelledby="calendar-month" aria-busy={events.loading}>
            <div className="calendar-weekdays" aria-hidden="true">{['일', '월', '화', '수', '목', '금', '토'].map((name, index) => <span key={name} className={index === 0 ? 'is-sunday' : index === 6 ? 'is-saturday' : ''}>{name}</span>)}</div>
            {weeks.map((week, index) => <div className="calendar-week" key={index} style={{ '--calendar-lanes': Math.max(2, week.laneCount) } as CSSProperties}>
              <div className="calendar-week-days">{week.days.map(({ day, inMonth }, column) => {
                const entries = byDay.get(day) ?? []
                return <div key={day} className={`calendar-day-cell${inMonth ? '' : ' is-outside'}${day === selected ? ' is-selected' : ''}${day === today ? ' is-today' : ''}${column === 0 ? ' is-sunday' : column === 6 ? ' is-saturday' : ''}`}>
                  <button type="button" disabled={!inMonth || events.loading} className="calendar-day"
                  aria-label={`${dateLabel(day)}, ${events.loading ? '일정 확인 중' : `행사 ${entries.length}개`}`} aria-pressed={day === selected}
                  aria-current={day === today ? 'date' : undefined} onClick={() => pickDay(day)}><span className="calendar-day-number">{Number(day.slice(8))}</span></button></div>
              })}</div>
              <div className="calendar-week-bars">{week.segments.map(segment => {
                const status = eventStatus(segment.row.event, today), withdrawn = ['canceled', 'postponed', 'rescheduled'].includes(status.state)
                return <button type="button" key={segment.key}
                  className={`calendar-event-bar calendar-tone-${calendarTone(segment.row.event.subcategory)}${segment.continuesBefore ? ' continues-before' : ''}${segment.continuesAfter ? ' continues-after' : ''}${withdrawn ? ' is-withdrawn' : ''}${selectedEvent?.id === segment.row.id ? ' is-active' : ''}`}
                  style={{ gridColumn: `${segment.column} / span ${segment.span}`, gridRow: segment.lane + 1 }}
                  aria-label={`${segment.row.event.name}, ${labels[segment.row.event.subcategory] || '기타 행사'}, ${dateLabel(segment.from)}${segment.to !== segment.from ? `부터 ${dateLabel(segment.to)}까지` : ''}${withdrawn ? `, ${status.label}` : ''}${eventBooking(segment.row.event,'',now)?', '+eventBooking(segment.row.event,'',now)!.label:''}, 상세 보기`}
                  onClick={() => update({ day: selected >= segment.from && selected <= segment.to ? selected : segment.from, calendarEvent: String(segment.row.id) })}>
                  {segment.continuesBefore && <span aria-hidden="true">‹ </span>}{withdrawn && <span>{status.label} · </span>}{segment.row.event.name}{eventBooking(segment.row.event,'',now)&&<small> · {eventBooking(segment.row.event,'',now)!.label}</small>}{segment.continuesAfter && <span aria-hidden="true"> ›</span>}
                </button>
              })}</div>
              <div className="calendar-week-more">{week.hiddenCounts.map((count, column) => count > 0 && <button type="button" key={column} style={{ gridColumn: column + 1 }} onClick={() => pickDay(week.days[column].day)} aria-label={`${dateLabel(week.days[column].day)}, 행사 ${count}개 더 보기`}>+{count}개</button>)}</div>
            </div>)}
          </div>}
        {!events.loading && !events.error && !rows.length && <p className="calendar-day-empty">이달에는 조건에 맞는 공개 행사가 없어요.</p>}
      </div>
      {selected && <CalendarDetailPanel day={selected} rows={selectedRows} event={selectedEvent} today={today} returnTo={returnTo}
        loading={events.loading} error={!!events.error} onClose={() => update({ day: '', calendarEvent: '' })}
        onSelect={id => update({ calendarEvent: id === null ? '' : String(id) })}/>}
    </div>
  </div>
}
