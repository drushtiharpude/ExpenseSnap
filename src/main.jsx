import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { restoreThemeFromStorage } from './settings/themeStore.js'
import './index.css'
import App from './App.jsx'

restoreThemeFromStorage()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
