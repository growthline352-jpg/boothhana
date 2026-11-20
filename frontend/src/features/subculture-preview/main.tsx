import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { SubculturePreview } from './App'
import './preview.css'
import './editorial.css'
import './interests.css'
import './brand.css'
import './home-discovery.css'
import './ux-review.css'

createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><SubculturePreview /></HashRouter></StrictMode>)

import './home-results.css'

import './selected-version.css'
