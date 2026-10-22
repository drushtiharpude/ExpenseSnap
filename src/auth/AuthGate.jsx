import { useState } from 'react'
import { useAuth } from './AuthProvider.jsx'
import AuthLogin from './AuthLogin.jsx'
import AuthRegister from './AuthRegister.jsx'
import './auth.css'

export default function AuthGate({ children }) {
  const { viewState } = useAuth()
  const [authScreen, setAuthScreen] = useState('login')

  if (viewState === 'loading') {
    return (
      <div className="auth-loading" role="status" aria-live="polite">
        Loading…
      </div>
    )
  }

  if (viewState === 'signed_out') {
    if (authScreen === 'register') {
      return <AuthRegister onGoLogin={() => setAuthScreen('login')} />
    }
    return <AuthLogin onGoRegister={() => setAuthScreen('register')} />
  }

  return children
}
