import { useState } from 'react'
import type { AuthSnapshot } from '../../app/AuthSession'

type Viewer = number | 'guest' | 'pending'

/** Only for public event recommendations, never for permissions or private account data.
 * A focus-triggered identity check must not clear cards or reset the current slide.
 * Confirmed login/logout/account changes still replace the query scope immediately.
 */
export function useRecommendationViewer(auth: Pick<AuthSnapshot, 'status' | 'user'>): Viewer {
  const confirmed = auth.status === 'authenticated' && auth.user ? auth.user.id
    : auth.status === 'anonymous' ? 'guest' : null
  const [viewer, setViewer] = useState<Viewer>(confirmed ?? (auth.status === 'error' ? 'guest' : 'pending'))
  const next = confirmed ?? (viewer === 'pending' && auth.status === 'error' ? 'guest' : viewer)
  if (next !== viewer) setViewer(next)
  return next
}
