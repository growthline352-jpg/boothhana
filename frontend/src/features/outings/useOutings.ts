import { useEffect, useRef, useState } from 'react'
import { freshState, readState, storageKey, type OutingsState } from './model'

export function useOutings() {
  const [initial] = useState(() => { try { return { data: readState(localStorage), error: '' } } catch (e) { return { data: freshState(), error: e instanceof Error ? e.message : '기기 저장소를 사용할 수 없어요.' } } })
  const [state, setState] = useState(initial.data), [error, setError] = useState(initial.error), [savedAt, setSavedAt] = useState('')
  const history = useRef<OutingsState[]>([]), locked = useRef(!!initial.error), current = useRef(state)
  const raw = useRef<string | null>(null)
  useEffect(() => { try { raw.current = localStorage.getItem(storageKey) } catch { /* handled by initial read */ } }, [])
  function write(change: OutingsState | ((previous: OutingsState) => OutingsState), remember = true) {
    const next = typeof change === 'function' ? change(current.current) : change
    if (remember) history.current = [...history.current.slice(-19), current.current]
    current.current = next; setState(next)
    if (locked.current) return
    try {
      if (localStorage.getItem(storageKey) !== raw.current) { locked.current = true; setError('다른 탭에서 일정이 바뀌었어요. 현재 내용을 파일로 보관한 뒤 새로고침해 주세요.'); return }
      const value = JSON.stringify(next); localStorage.setItem(storageKey, value); raw.current = value
      setSavedAt(new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date())); setError('')
    } catch { setError('기기에 저장하지 못했어요. 현재 화면은 유지돼요. 일정 파일로 보관해 주세요.') }
  }
  function undo() { const previous = history.current.pop(); if (previous) write(previous, false) }
  return { state, write, error, savedAt, undo, canUndo: history.current.length > 0 }
}
