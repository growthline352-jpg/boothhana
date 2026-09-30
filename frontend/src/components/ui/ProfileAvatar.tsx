import { useEffect, useState } from 'react'

export function ProfileAvatar({ name, imageUrl, className }: { name: string; imageUrl?: string | null; className: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [imageUrl])
  const initial = Array.from(name.trim())[0] || '나'
  return <span className={className} aria-hidden="true">
    {imageUrl && !failed ? <img src={imageUrl} alt="" onError={() => setFailed(true)} /> : initial}
  </span>
}
