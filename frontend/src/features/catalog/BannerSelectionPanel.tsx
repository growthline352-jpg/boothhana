import { useState } from 'react'
import { useSubmission } from '../../app/useSubmission'
import { catalogApi, type Asset, type BannerSelection } from './api'
import { StoredImage, SafeLink } from './Shared'

export function BannerSelectionPanel({ eventId, assets, selection, saved }: {
  eventId: number; assets: Asset[]; selection: BannerSelection; saved: () => void
}) {
  const action = useSubmission()
  const [error, setError] = useState('')
  const [choice, setChoice] = useState(selection.assetId === null ? '' : String(selection.assetId))
  const banners = assets.filter(a => a.eventId === eventId && a.type === 'BANNER' && a.participantId === null && a.productId === null)
  const eligible = (a: Asset) => a.rightsState === 'APPROVED' && a.storageState === 'STORED' && Boolean(a.storedUrl)
  const selected = banners.find(a => a.id === selection.assetId)
  const chosen = banners.find(a => String(a.id) === choice)
  const invalidSelection = selection.assetId !== null && (!selected || !eligible(selected))
  const save = async () => {
    if (!action.begin()) return
    setError('')
    try {
      if (choice && (!chosen || !eligible(chosen))) throw new Error('사용 승인과 파일 저장이 완료된 배너를 선택하세요.')
      if (!window.confirm('대표 배너 변경은 이미 공개된 행사 목록과 상세 화면에도 반영됩니다. 저장할까요?')) return
      await catalogApi.selectBanner(eventId, selection, choice ? chosen! : null)
      saved()
    } catch (e) { setError(e instanceof Error ? e.message : '대표 배너를 변경하지 못했습니다.') }
    finally { action.finish() }
  }
  return <section className="catalog-banner-selection" aria-label="대표 배너 설정">
    <h3>대표 배너</h3><p>이미지 사용 승인과 대표 선택은 별개입니다. 승인·저장된 행사 배너만 선택할 수 있습니다.</p>
    <p>{selection.assetId === null ? '현재: 자동 선택 — 사용 가능한 배너 중 최초 등록 이미지' : `현재 지정: 이미지 #${selection.assetId}`}</p>
    {invalidSelection && <p className="notice-banner">지정 배너를 현재 사용할 수 없어 공개 화면에는 기본 이미지가 표시됩니다. 다른 배너를 지정하거나 자동 선택으로 변경하세요.</p>}
    <label className="field"><span>목록·상세에 표시할 이미지</span>
      <select className="select" value={choice} disabled={action.pending} onChange={e => setChoice(e.target.value)}>
        <option value="">자동 선택으로 되돌리기</option>
        {banners.map(a => <option key={a.id} value={String(a.id)} disabled={!eligible(a)}>
          #{a.id} · {a.caption || '배너'}{eligible(a) ? '' : ' · 승인/저장 필요'}
        </option>)}
        {selection.assetId !== null && !selected && <option value={String(selection.assetId)} disabled>#{selection.assetId} · 사용할 수 없음</option>}
      </select></label>
    {chosen && eligible(chosen) && <figure className="catalog-banner"><StoredImage url={chosen.storedUrl!} alt={chosen.caption || '선택할 대표 배너'}/>
      <figcaption>{chosen.credit} · <SafeLink url={chosen.pageUrl}>게시 원문</SafeLink></figcaption></figure>}
    <p className="item-meta">명시적으로 지정한 이미지의 승인이 철회되면 다른 포스터로 자동 교체하지 않습니다. 기본 이미지로 표시됩니다.</p>
    {error && <p className="form-alert" role="alert">{error} 최신 상태를 새로고침한 뒤 다시 선택하세요.</p>}
    <div className="row-actions"><button className="btn primary" type="button" disabled={action.pending || choice === (selection.assetId === null ? '' : String(selection.assetId)) || Boolean(choice && (!chosen || !eligible(chosen)))} onClick={() => void save()}>
      {action.pending ? '저장 중…' : '대표 배너 저장'}</button><button className="btn secondary" type="button" disabled={action.pending} onClick={saved}>최신 상태 새로고침</button></div>
  </section>
}
