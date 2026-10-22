import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AuthGate from './auth/AuthGate.jsx'
import { AuthProvider } from './auth/AuthProvider.jsx'
import { FinanceDataProvider } from './finance/FinanceDataProvider.jsx'
import { restoreThemeFromStorage } from './settings/themeStore.js'
import './index.css'
import './ui/expensesnapPremium.css'
import './ui/cardHover.css'
import './ui/pageCanvas.css'
import App from './App.jsx'

restoreThemeFromStorage()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <FinanceDataProvider>
          <App />
        </FinanceDataProvider>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
