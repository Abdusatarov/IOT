import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DesignPreview from './DesignPreview.tsx'
import './design-system.css'
import './shell.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).has('design-system') ? <DesignPreview /> : <App />}
  </StrictMode>,
)
