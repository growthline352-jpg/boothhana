import { api, ApiError } from './client'

export type ImageTarget = 'booth' | 'product' | 'profile'
export interface ImageUploadTask { run(signal?: AbortSignal): Promise<string> }
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
export function validateImageFile(file: File) {
  if (!TYPES.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024)
    throw new Error('10MiB 이하의 JPG, PNG, WebP, GIF 이미지를 선택해 주세요.')
}

export function createImageUploadTask(file: File, target: ImageTarget): ImageUploadTask {
  validateImageFile(file)
  const endpoint = target === 'profile' ? '/api/me/uploads' : '/api/creator/uploads'
  // Created once per selected file. Retry uses the SAME ticket and hash through every stage.
  const uploadId = crypto.randomUUID()
  let digest: string | undefined
  let running = false
  return {
    async run(external?: AbortSignal) {
      if (running) throw new Error('이미지 업로드가 이미 진행 중입니다.')
      running = true
      const controller = new AbortController()
      const cancel = () => controller.abort()
      if (external?.aborted) controller.abort()
      external?.addEventListener('abort', cancel, { once: true })
      const timer = setTimeout(() => controller.abort(), 90_000)
      try {
        controller.signal.throwIfAborted()
        if (!digest) {
          const buffer = await file.arrayBuffer()
          const hash = await crypto.subtle.digest('SHA-256', buffer)
          digest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')
        }
        const ticket = await api<{ uploadId: string; state: string }>(`${endpoint}/tickets`, {
          method: 'POST', signal: controller.signal,
          body: JSON.stringify({ uploadId, target, contentType: file.type, fileSize: file.size, sha256: digest }),
        })
        if (ticket.state === 'REGISTERED') await api<void>(`${endpoint}/tickets/${uploadId}/content`, {
          method: 'POST', signal: controller.signal, body: file, headers: { 'Content-Type': file.type },
        })
        const completed = await api<{ objectKey: string }>(`${endpoint}/tickets/${uploadId}/complete`, {
          method: 'POST', signal: controller.signal,
        })
        return completed.objectKey
      } catch (error) {
        if (controller.signal.aborted) throw new Error('업로드가 취소되었거나 제한시간을 초과했습니다. 같은 파일로 다시 시도할 수 있습니다.')
        if (error instanceof ApiError) throw new Error(error.message)
        throw error
      } finally {
        clearTimeout(timer); external?.removeEventListener('abort', cancel); running = false
      }
    },
  }
}
