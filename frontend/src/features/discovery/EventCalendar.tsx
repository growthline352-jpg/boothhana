import { Link, useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { ContentImage } from '../../components/ui/ContentImage'
import { publicCatalogApi } from '../catalog/api'
import { eventStatus } from '../visit/eventStatus'
import { dateLabel, type BrowseState } from './browse'
import { calendarApiParams, calendarEventsByDay, calendarMonth, monthDays, monthRange, shiftMonth } from './calendar'
import './calendar.css'

export function EventCalendar({ state, today, returnTo, update }: { state: BrowseState; today: string; returnTo: string; update: (changes: Record<string, string>) => void }) {
  const [params] = useSearchParams()
  const month = calendarMonth(params.get('month'), today), range = monthRange(month)
  const candidate = params.get('day') || (today.startsWith(`${month}-`) ? today : range.from)
  const selected = candidate >= range.from && candidate <= range.to && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : range.from
  const query = calendarApiParams(state, month).toString()
  const events = useRemote(() => publicCatalogApi.calendar(query), [query])
  const rows = events.data ?? [], byDay = calendarEventsByDay(rows, month), cells = monthDays(month)
  const selectedRows = byDay.get(selected) ?? []
  const monthLabel = `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`
  const move = (next: string) => update({ month: next, day: '' })
  return <div className="event-calendar">
    <div className="calendar-heading"><h3 id="calendar-month">{monthLabel}</h3><nav aria-label="캘린더 월 이동"><button type="button" disabled={month === '1000-01'} aria-label="이전 달" onClick={() => move(shiftMonth(month, -1))}>‹</button><button type="button" onClick={() => update({ month: today.slice(0, 7), day: today })}>오늘</button><button type="button" disabled={month === '9998-12'} aria-label="다음 달" onClick={() => move(shiftMonth(month, 1))}>›</button></nav></div>
    <p className="calendar-summary" role="status">{events.loading ? '이달의 일정을 확인하고 있어요.' : events.error ? '일정을 불러오지 못했어요.' : `${monthLabel} 공개 행사 ${rows.length}개`}</p>
    {events.error ? <div className="calendar-error" role="alert"><p>{events.error.message}</p><button type="button" onClick={() => void events.reload()}>다시 불러오기</button></div>
      : <table className="calendar-grid" aria-labelledby="calendar-month" aria-busy={events.loading}><thead><tr>{['일', '월', '화', '수', '목', '금', '토'].map((name, index) => <th scope="col" key={name} className={index === 0 ? 'is-sunday' : index === 6 ? 'is-saturday' : ''}>{name}</th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{cells.slice(week * 7, week * 7 + 7).map(({ day, inMonth }) => {
        const entries = byDay.get(day) ?? []
        return <td key={day} className={`${inMonth ? '' : 'is-outside'}${day === selected ? ' is-selected' : ''}${day === today ? ' is-today' : ''}`}>
          <button type="button" disabled={!inMonth || events.loading} aria-label={`${dateLabel(day)}, ${events.loading ? '일정 확인 중' : `행사 ${entries.length}개`}`} aria-pressed={day === selected} aria-current={day === today ? 'date' : undefined} onClick={() => update({ day })}>
            <span className="calendar-day-number">{Number(day.slice(8))}</span>
            {!!entries.length && <span className="calendar-mobile-count">{entries.length}개</span>}
            <span className="calendar-cell-events">{entries.slice(0, 2).map(row => {
              const status = eventStatus(row.event, today), withdrawn = ['canceled', 'postponed', 'rescheduled'].includes(status.state)
              return <span key={row.id} className={withdrawn ? 'is-withdrawn' : ''}>{withdrawn ? `${status.label} · ` : ''}{row.event.name}</span>
            })}{entries.length > 2 && <span className="calendar-cell-more">+{entries.length - 2}개 더 보기</span>}</span>
          </button>
        </td>
      })}</tr>)}</tbody></table>}
    {!events.loading && !events.error && <section className="calendar-day-events" aria-labelledby="calendar-day-heading"><h3 id="calendar-day-heading">{dateLabel(selected)} <span>{selectedRows.length}개 행사</span></h3>
      {selectedRows.length ? <div className="calendar-event-list">{selectedRows.map(row => {
        const status = eventStatus(row.event, today)
        const hours = [...new Set(row.event.occurrences.filter(occurrence => occurrence.startDate <= selected && occurrence.endDate >= selected).map(occurrence => occurrence.startTime ? `${occurrence.startTime}${occurrence.endTime ? ` ~ ${occurrence.endTime}` : '부터'}` : '시간 확인 필요'))]
        return <Link key={row.id} to={`/discover/${row.id}?day=${selected}`} state={{ catalogReturnTo: returnTo }} className="calendar-event"><div className="calendar-event-image"><ContentImage url={row.banner?.url} kind="event" eventType={row.event.subcategory} alt={`${row.event.name} 대표 이미지`}/></div><div><span className={`calendar-event-status is-${status.state}`}>{status.label}</span><h4>{row.event.name}</h4><p>{hours.join(' · ')} · {row.event.venueName || '장소 확인 필요'}</p>{status.notice && <small>{status.notice}</small>}</div><span aria-hidden="true">→</span></Link>
      })}</div> : <p className="calendar-day-empty">이 날짜에는 조건에 맞는 공개 행사가 없어요.</p>}
    </section>}
  </div>
}
