import { useRef, useState } from 'react'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { interestApi, toggleInterest, type InterestFields, type InterestView } from './api'
import './interests.css'

export function InterestSettings({ onboarding = false, onComplete }: { onboarding?: boolean; onComplete?: () => void }) {
  const auth = useAuth()
  const [saved, setSaved] = useState(false)
  const options = useRemote(interestApi.options)
  const preferences = useRemote(interestApi.get, [auth.user?.id, auth.generation])
  const view = preferences.data
  return <section className="interest-settings" aria-labelledby="interest-title">
    <header><h2 id="interest-title">{onboarding ? '어떤 행사를 좋아하세요?' : '관심분야 설정'}</h2>
      <p>서브컬처·박람회·축제마다 행사 유형과 취향 주제를 골라주세요. 여러 개를 선택할 수 있어요.</p></header>
    {preferences.error || options.error ? <div role="alert"><p>관심 설정을 불러오지 못했어요.</p><button type="button" onClick={() => { void preferences.reload(); void options.reload() }}>다시 불러오기</button></div>
      : !view || !options.data ? <p role="status">관심 설정을 불러오고 있어요.</p>
        : view.userId !== auth.user?.id ? <p role="alert">로그인 계정을 다시 확인해 주세요.</p>
          : <InterestForm key={`${view.userId}:${auth.generation}:${view.revision}`} view={view} options={options.data} onboarding={onboarding}
            onSaved={async result => {
              preferences.setData(result); setSaved(true)
              if (onboarding) {
                await auth.refresh()
                const current = auth.getSnapshot()
                if (current.status === 'authenticated' && current.user?.id === result.userId && !current.user.onboardingRequired) onComplete?.()
              }
            }} />}
    {saved && !onboarding && <p role="status">관심분야를 저장했습니다.</p>}
  </section>
}

function InterestForm({ view, options, onboarding, onSaved }: {
  view: InterestView; options: Awaited<ReturnType<typeof interestApi.options>>; onboarding: boolean; onSaved: (result: InterestView) => Promise<void>
}) {
  const auth = useAuth()
  const [fields, setFields] = useState<InterestFields>(view.fields)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const lock = useRef(false)
  const save = async (skip = false) => {
    if (lock.current) return
    const before = auth.getSnapshot()
    if (before.user?.id !== view.userId || before.status !== 'authenticated') return
    lock.current = true; setBusy(true); setMessage(''); setFailed(false)
    try {
      const result = await interestApi.save(view, skip ? {} : fields, skip)
      const now = auth.getSnapshot()
      if (now.user?.id !== before.user?.id || now.generation !== before.generation) return
      await onSaved(result)
      setMessage('관심분야를 저장했습니다.')
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해 주세요.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); void save() }}>
    <fieldset disabled={busy} className="interest-fieldset">
      <legend className="discovery-sr-only">분야별 관심 항목</legend>
      {options.map(field => <section className="interest-category" key={field.code}>
        <label className="interest-category-label"><input type="checkbox" checked={field.code in fields} onChange={event => {
          const next = { ...fields }; if (event.target.checked) next[field.code] = { formats: [], topics: [] }; else delete next[field.code]; setFields(next); setMessage('')
        }}/><strong>{field.label}</strong><small>{field.code in fields ? '선택됨' : '선택하기'}</small></label>
        {field.code in fields && <div className="interest-category-options">
          {(['formats', 'topics'] as const).map(group => <fieldset key={group} className="interest-option-group"><legend>{group === 'formats' ? '행사 유형' : '취향 주제'}</legend>
            <div className="interest-chips">{field[group].map(option => <label key={option.code} className={fields[field.code][group].includes(option.code) ? 'is-selected' : ''}>
              <input type="checkbox" checked={fields[field.code][group].includes(option.code)} onChange={() => { setFields(current => toggleInterest(current, field.code, group, option.code)); setMessage('') }}/>{option.label}
            </label>)}</div></fieldset>)}
          <p className="interest-hint">세부 항목을 고르지 않으면 이 분야 전체를 보여드려요. 선택한 항목 중 하나에 해당하면 포함됩니다.</p>
        </div>}
      </section>)}
    </fieldset>
    <p className="interest-hint">각 사이트에서는 해당 분야의 설정만 적용해 저장 인원순으로 소개합니다. 내 정보에서 언제든 바꿀 수 있어요.</p>
    <div className="interest-actions"><button type="submit" disabled={busy}>{busy ? '저장 중…' : onboarding ? '선택 완료' : '관심분야 저장'}</button>
      {onboarding && <button className="interest-skip" type="button" disabled={busy} onClick={() => void save(true)}>나중에 선택하기</button>}</div>
    {message && <p role={failed ? 'alert' : 'status'}>{message}{failed && ' 최신 설정은 페이지를 새로고침해 확인할 수 있어요.'}</p>}
  </form>
}
