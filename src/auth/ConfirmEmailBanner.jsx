import { useState } from 'react'
import { useAuth } from './AuthProvider.jsx'

export default function ConfirmEmailBanner() {
  const { email, resendConfirmationEmail, actionPending } = useAuth()
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  async function handleResend() {
    setMessage(null)
    setError(null)
    const result = await resendConfirmationEmail(email)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage('Confirmation email sent.')
  }

  return (
    <div className="alert alert--warning auth-account-banner" role="status">
      <p>
        <strong>Confirm your email</strong> ({email || 'your address'}) — check your inbox, then log
        in again. Your expenses on this device are unchanged.
      </p>
      {message && <p>{message}</p>}
      {error && <p>{error}</p>}
      <p>
        <button type="button" className="btn" onClick={handleResend} disabled={actionPending}>
          {actionPending ? 'Sending…' : 'Resend confirmation email'}
        </button>
      </p>
    </div>
  )
}
