import { eventTypeLabels } from '../interests/taxonomy'
import { useState, type ReactNode } from 'react'
import { useRemote } from '../../app/useRemote'
import { useSubmission } from '../../app/useSubmission'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { collectionApi, type Detail, type ReviewState, type Subcategory } from './api'
import './collection.css'

const categories: Record<Subcategory, string> = eventTypeLabels
const reviews: Record<ReviewState, string> = { PENDING: '검토 대기', REVIEWED: '확인 완료 · 비공개', EXCLUDED: '제외' }
const runStatuses: Record<string, string> = { SUCCESS: '정상', PARTIAL: '일부 수집', NO_RESULTS: '검색 무결과', FAILED: '검색 실패', REJECTED_ALL: '전체 제외' }
function External({ url, children }: { url: string; children: ReactNode }) {
  // Defense in depth, including old DB rows. Never render a javascript/data link.
  try { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return <span>잘못된 링크</span> }
  catch { return <span>잘못된 링크</span> }
  return <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a>
}
function Paging({ page, total, change }: { page: number; total: number; change: (page: number) => void }) {
  return <nav className="collection-paging" aria-label="목록 페이지"><button className="btn secondary" disabled={page === 0} onClick={() => change(page - 1)}>이전</button><span>{page + 1} / {Math.max(1, Math.ceil(total / 20))} · {total}건</span><button className="btn secondary" disabled={(page + 1) * 20 >= total} onClick={() => change(page + 1)}>다음</button></nav>
}
export function SubcultureCollectionPage() {
  const [tab, setTab] = useState<'candidates' | 'runs'>('candidates')
  return <><PageHeader eyebrow="Admin · Subculture" title="서브컬처 수집함" description="CLI가 찾은 서울 서브컬처 행사와 배너 후보를 검토합니다." />
    <div className="notice-banner">수집 결과는 기존 공개 행사와 분리해 저장합니다. 확인 완료로 바꿔도 공개·부스 신청·예약이 활성화되지 않습니다.</div>
    <div className="collection-tabs"><button className={`btn ${tab === 'candidates' ? 'primary' : 'secondary'}`} onClick={() => setTab('candidates')}>행사 후보</button><button className={`btn ${tab === 'runs' ? 'primary' : 'secondary'}`} onClick={() => setTab('runs')}>실행 기록</button></div>
    {tab === 'candidates' ? <Candidates /> : <Runs />}
  </>
}
function Candidates() {
  const [state, setState] = useState<ReviewState | 'ALL'>('PENDING')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const data = useRemote("features/collection/SubcultureCollectionPage:Candidates:data", () => collectionApi.candidates(state, page), [state, page])
  return <>
    <div className="filter-bar"><label>검토 상태 <select className="select" value={state} onChange={e => { setState(e.target.value as ReviewState | 'ALL'); setPage(0); setSelected(null) }}><option value="ALL">전체</option>{Object.entries(reviews).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="btn secondary" onClick={() => void data.reload()}>새로고침</button></div>
    {data.loading ? <LoadingState /> : data.error ? <ErrorState error={data.error} retry={() => void data.reload()} /> : !data.data?.items.length ? <EmptyState title="수집 후보가 없습니다" description="수집 PC에서 collector/run.py를 실행하거나 필터를 변경하세요." /> : <div className="table-wrap"><table><thead><tr><th>행사</th><th>유형</th><th>일정 범위</th><th>장소</th><th>상태</th><th>확인</th></tr></thead><tbody>{data.data.items.map(row => <tr key={row.id}><td><strong>{row.name}</strong>{row.possibleDuplicateOf && <small>기존 후보 #{row.possibleDuplicateOf}와 중복/일정 변경 확인 필요</small>}</td><td>{categories[row.subcategory]}</td><td>{row.startsOn} ~ {row.endsOn}<small>휴무일은 상세 운영일 확인</small></td><td>{row.venueName || '확인 필요'}</td><td>{reviews[row.reviewState]}</td><td><button className="btn secondary" onClick={() => setSelected(row.id)}>상세</button></td></tr>)}</tbody></table></div>}
    {data.data && <Paging page={page} total={data.data.total} change={setPage} />}
    {selected !== null && <CandidatePanel key={selected} id={selected} close={() => setSelected(null)} changed={() => void data.reload()} open={setSelected} />}
  </>
}
function CandidatePanel({ id, close, changed, open }: { id: number; close: () => void; changed: () => void; open: (id: number) => void }) {
  const data = useRemote("features/collection/SubcultureCollectionPage:CandidatePanel:data", () => collectionApi.detail(id), [id])
  if (data.loading) return <LoadingState />
  if (data.error || !data.data) return <ErrorState error={data.error ?? new Error('후보를 찾을 수 없습니다.')} retry={() => void data.reload()} />
  return <ReviewForm key={`${id}:${data.data.revision}`} detail={data.data} close={close} open={open} saved={value => { data.setData(value); changed() }} />
}
function ReviewForm({ detail, close, saved, open }: { detail: Detail; close: () => void; saved: (value: Detail) => void; open: (id: number) => void }) {
  const submission = useSubmission()
  const [note, setNote] = useState(detail.reviewNote)
  const [error, setError] = useState('')
  const e = detail.event
  const sourceCoverage = detail.sourceCoverage ?? []
  const submit = async (state: ReviewState) => {
    if (!submission.begin()) return
    setError('')
    try { saved(await collectionApi.review(detail.id, detail.revision, state, note)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : '검토 저장 실패') }
    finally { submission.finish() }
  }
  return <section className="panel collection-detail" aria-label="행사 후보 상세"><div className="panel-header"><div><p className="eyebrow">후보 #{detail.id} · {reviews[detail.reviewState]}</p><h2>{e.name}</h2></div><button className="btn subtle" disabled={submission.pending} onClick={close}>닫기</button></div>
    {detail.possibleDuplicateOf && <div className="notice-banner">제목·회차·연도가 같은 후보가 있습니다. 날짜/장소 변경인지 별도 행사인지 확인하세요. <button className="btn subtle" disabled={submission.pending} onClick={() => open(detail.possibleDuplicateOf!)}>#{detail.possibleDuplicateOf} 보기</button></div>}
    <dl className="detail-list"><div><dt>분류 / 회차</dt><dd>{categories[e.subcategory]} / {e.edition || '미확인'}</dd></div><div><dt>주최</dt><dd>{e.organizer || '미확인'}</dd></div><div><dt>장소</dt><dd>{e.venueName || '미확인'}<br />{e.address || '주소 미확인/비공개'}</dd></div><div><dt>참여 조건</dt><dd>{e.admission || '미확인 — 무료로 추정하지 않음'}</dd></div><div><dt>관심 대상</dt><dd>{e.subjects.join(', ') || '없음'}</dd></div></dl>
    <h3>실제 운영일</h3><div className="collection-lines">{e.occurrences.map((o, i) => <p key={i}>{o.startDate}{o.endDate !== o.startDate ? ` ~ ${o.endDate}` : ''} · {o.startTime ?? '시작시간 미정'} ~ {o.endTime ?? '종료시간 미정'}</p>)}</div>
    <p className="collection-copy">{e.description}</p>
    <h3>검토 필요 항목</h3><ul>{detail.validationWarnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
    <h3>출처 · CLI가 보고한 확인 수준</h3><div className="collection-source-list">{e.sources.map((source, i) => <article key={i}><External url={source.url}>{source.url}</External><p>{source.kind} · {source.access === 'ORIGINAL' ? '원문 확인 보고' : source.access === 'SEARCH_SNIPPET' ? '검색 요약만 확인' : '접근 불가'}</p><blockquote>{source.evidence}</blockquote></article>)}</div>
    <h3>출처군 조사 기록</h3>{sourceCoverage.length ? <div className="collection-source-list">{sourceCoverage.map(row => <article key={row.channel}><strong>{row.channel}</strong><p>{row.status} · 검색어 {row.queries.length}개 · 확인 URL {row.checkedUrls.length}개</p>{row.notes && <p>{row.notes}</p>}{row.checkedUrls.map(url => <p key={url}><External url={url}>{url}</External></p>)}</article>)}</div> : <p>이 후보를 수집한 이전 배치에는 출처군 기록이 없습니다.</p>}
    <h3>배너 후보</h3><p>자동 다운로드·GCS 저장·공개 미리보기를 하지 않습니다. 원본 회차와 사용 조건을 먼저 확인하세요.</p>{e.banners.length ? e.banners.map((banner, i) => <article className="collection-banner" key={i}><External url={banner.imageUrl}>이미지 후보 열기</External> · <External url={banner.pageUrl}>게시 페이지 열기</External><p>사용 조건: {banner.rights === 'UNKNOWN' ? '미확인' : '허락 문구가 있다고 보고됨 — 직접 확인 필요'} / 해당 회차: {banner.matchesEdition === true ? '일치한다고 보고됨' : '확인 필요'}</p>{banner.rightsEvidence && <p>{banner.rightsEvidence}</p>}</article>) : <p>이미지 후보 없음</p>}
    {detail.reviewedEvent && <details><summary>이전에 확인한 내용 보존본</summary><pre className="collection-json">{JSON.stringify(detail.reviewedEvent, null, 2)}</pre></details>}
    <label className="field"><span>검토 메모 / 수정이 필요한 사실</span><textarea className="textarea" rows={4} maxLength={2000} disabled={submission.pending} value={note} onChange={event => setNote(event.target.value)} /></label>
    {error && <div className="form-alert" role="alert">{error}</div>}<div className="row-actions"><button className="btn secondary" disabled={submission.pending} onClick={() => void submit('PENDING')}>검토 대기</button><button className="btn primary" disabled={submission.pending} onClick={() => void submit('REVIEWED')}>확인 완료로 저장 · 비공개</button><button className="btn danger subtle" disabled={submission.pending} onClick={() => void submit('EXCLUDED')}>제외</button></div>
  </section>
}
function Runs() {
  const [page, setPage] = useState(0)
  const data = useRemote("features/collection/SubcultureCollectionPage:Runs:data", () => collectionApi.runs(page), [page])
  return <><p>예약 실행은 별도 수집 PC/서버에서 수행합니다. 이 화면은 결과를 조회하며 브라우저에서 CLI를 직접 실행하지 않습니다.</p><button className="btn secondary" onClick={() => void data.reload()}>새로고침</button>{data.loading ? <LoadingState /> : data.error ? <ErrorState error={data.error} retry={() => void data.reload()} /> : !data.data?.items.length ? <EmptyState title="실행 기록이 없습니다" description="첫 수집을 실행하면 기록이 표시됩니다." /> : data.data.items.map(run => <article className="panel collection-run" key={run.id}><h3>{runStatuses[run.status] ?? run.status} · {run.executionMode === 'CLI' ? 'CLI 검색' : '수동 JSON 가져오기'}</h3><p>{run.scope.startDate} ~ {run.scope.endDate} / {new Date(run.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p><p>신규 {run.receipt.inserted} · 변경 {run.receipt.changed} · 동일 {run.receipt.unchanged} · 제외 {run.receipt.rejected}</p><p className="collection-copy">{run.summary}</p><small className="mono">{run.id}</small>{run.receipt.rejections.length > 0 && <details><summary>제외 내역</summary>{run.receipt.rejections.map((item, i) => <p key={i}>{item.name || `항목 ${item.index + 1}`} — {item.reasons.join(', ')}</p>)}</details>}</article>)}{data.data && <Paging page={page} total={data.data.total} change={setPage} />}</>
}
