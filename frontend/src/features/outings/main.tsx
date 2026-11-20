import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { OutingsApp } from './OutingsApp'
import './outings.css'
import './discovery-polish.css'
import './planner.css'

createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><OutingsApp/></HashRouter></StrictMode>)
