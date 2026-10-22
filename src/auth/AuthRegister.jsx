import { useId, useState } from 'react'
import { useAuth } from './AuthProvider.jsx'
import AuthPageLayout from './AuthPageLayout.jsx'
import AuthPasswordField from './AuthPasswordField.jsx'

export default function AuthRegister({ onGoLogin }) {
  const { signUp, actionPending } = useAuth()
  const usernameId = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [feedback, setFeedback] = useState(null)

  async function handleRegister(event) {
    event.preventDefault()
    setFeedback(null)
    const data = new FormData(event.currentTarget)
    const registerUsername = String(data.get('username') ?? username).trim()
    const registerPassword = String(data.get('password') ?? password)
    const registerConfirm = String(data.get('confirmPassword') ?? confirmPassword)
    const result = await signUp(registerUsername, registerPassword, registerConfirm)
    if (!result.ok) {
      setFeedback(result.error)
    }
  }

  return (
    <AuthPageLayout
      intent="register"
      title="Create your account"
      subtitle="Choose a username for this browser demo. Your existing expense data stays right where it is."
    >
      <form className="auth-form" onSubmit={handleRegister} noValidate>
        {feedback ? (
          <div className="auth-form-error" role="alert">
            <p>{feedback}</p>
          </div>
        ) : null}

        <div className="auth-field">
          <label className="auth-field__label" htmlFor={usernameId}>
            Username
          </label>
          <input
            id={usernameId}
            className="auth-field__input"
            type="text"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="3–30 letters, numbers, . _ -"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            minLength={3}
            maxLength={30}
          />
          <p className="auth-field__hint">Letters, numbers, dots, hyphens, or underscores.</p>
        </div>

        <AuthPasswordField
          name="password"
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
        />

        <AuthPasswordField
          name="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength={8}
        />

        <div className="auth-form-actions">
          <button type="submit" className="btn btn--primary auth-submit" disabled={actionPending}>
            {actionPending ? 'Creating account…' : 'Create account'}
          </button>
        </div>
      </form>

      <p className="auth-switch">
        Already registered?{' '}
        <button type="button" className="auth-link-btn" onClick={onGoLogin}>
          Log in
        </button>
      </p>
    </AuthPageLayout>
  )
}
