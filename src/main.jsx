import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// HashRouter, not BrowserRouter — GitHub Pages serves static files with no
// server-side rewrite, so a direct navigation/refresh to a route like
// /browse would 404 without it. URLs look like .../#/planner/<id> instead.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
