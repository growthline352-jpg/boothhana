import { OfflinePrivacyGuard } from './features/offline/OfflinePrivacyGuard'
import './features/support/support.css'
import { LibraryProvider } from './features/library/LibraryProvider'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from './app/router'
import { AuthProvider } from './app/AuthContext'
import { canonicalProductionUrl } from './api/client'
import './styles/tokens.css'
import './styles/global.css'
// One final, scoped visual layer shared by public, creator and admin screens.
import './styles/polish.css'
import './features/library/library.css'
import './styles/usability.css'

const canonicalUrl = canonicalProductionUrl(window.location.href)
if (canonicalUrl) window.location.replace(canonicalUrl)
else createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider><LibraryProvider><OfflinePrivacyGuard/><RouterProvider router={router} /></LibraryProvider></AuthProvider>
  </StrictMode>,
)
