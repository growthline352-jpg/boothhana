import { useEffect, useRef, useState } from 'react'
import { createImageUploadTask, type ImageUploadTask } from '../../api/image-upload'

interface ImageUploaderProps {
  currentUrl?: string | null
  previewFile?: File
  target: 'booth' | 'product'
  disabled?: boolean
  onUploaded: (objectKey: string, file: File) => void
  onBusyChange?: (busy: boolean) => void
}
export function ImageUploader({ currentUrl, previewFile, target, disabled = false, onUploaded, onBusyChange }: ImageUploaderProps) {
  const [preview, setPreview] = useState(previewFile ? '' : currentUrl ?? '')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const localUrl = useRef<string | null>(null)
  const alive = useRef(true)
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const selected = useRef<{ file: File; task: ImageUploadTask } | null>(null)
  const callbacks = useRef({ onBusyChange, onUploaded })
  callbacks.current = { onBusyChange, onUploaded }
  useEffect(() => {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current)
    // Keep only the File in a draft. Each mounted editor owns its own object URL.
    localUrl.current = previewFile ? URL.createObjectURL(previewFile) : null
    setPreview(localUrl.current ?? currentUrl ?? '')
  }, [currentUrl, previewFile])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false; controller.current?.abort()
      if (localUrl.current) URL.revokeObjectURL(localUrl.current)
      callbacks.current.onBusyChange?.(false)
    }
  }, [])
  const run = async () => {
    if (disabled || inFlight.current || !selected.current) return
    const selection = selected.current
    const abort = new AbortController(); controller.current = abort
    inFlight.current = true; callbacks.current.onBusyChange?.(true)
    setStatus('uploading'); setErrorMessage('')
    try {
      const key = await selection.task.run(abort.signal)
      if (!alive.current || selected.current !== selection) return
      if (localUrl.current) URL.revokeObjectURL(localUrl.current)
      localUrl.current = URL.createObjectURL(selection.file); setPreview(localUrl.current)
      callbacks.current.onUploaded(key, selection.file); selected.current = null; setStatus('idle')
    } catch (error) {
      if (!alive.current) return
      setErrorMessage(error instanceof Error ? error.message : '이미지를 업로드하지 못했습니다.')
      setStatus('error')
    } finally {
      inFlight.current = false; controller.current = null
      if (alive.current) callbacks.current.onBusyChange?.(false)
    }
  }
  return <div className="field full image-uploader">
    <span>대표 이미지</span><div className="image-uploader-row">
      {preview && <img src={preview} alt="선택한 대표 이미지 미리보기" />}
      <input aria-label="대표 이미지 파일" className="input" type="file" accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={disabled || status === 'uploading'} onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ''
          if (!file || disabled || inFlight.current) return
          try { selected.current = { file, task: createImageUploadTask(file, target) }; void run() }
          catch (error) { selected.current = null; setStatus('error'); setErrorMessage(error instanceof Error ? error.message : '파일을 확인해 주세요.') }
        }} />
    </div>
    <small role="status" aria-live="polite">{status === 'uploading' ? '이미지를 검증하고 저장하고 있습니다…'
      : status === 'error' ? errorMessage : 'JPG, PNG, WebP, GIF · 최대 10MiB'}</small>
    {status === 'uploading' && <button type="button" className="btn subtle" onClick={() => controller.current?.abort()}>업로드 취소</button>}
    {status === 'error' && selected.current && <button type="button" className="btn secondary" disabled={disabled} onClick={() => void run()}>같은 파일로 재시도</button>}
  </div>
}
