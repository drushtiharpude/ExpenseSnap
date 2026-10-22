import { useId, useState } from 'react'
import { useAuth } from './AuthProvider.jsx'
import AuthPageLayout from './AuthPageLayout.jsx'
import AuthPasswordField from './AuthPasswordField.jsx'
import { AuthFieldUserIcon } from './authFieldIcons.jsx'

export default function AuthLogin({ onGoRegister }) {
  const { signIn, actionPending } = useAuth()
  const usernameId = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [feedback, setFeedback] = useState(null)

  async function handleLogin(event) {
    event.preventDefault()
    setFeedback(null)
    const data = new FormData(event.currentTarget)
    const loginUsername = String(data.get('username') ?? username).trim()
    const loginPassword = String(data.get('password') ?? password)
    const result = await signIn(loginUsername, loginPassword)
    if (!result.ok) {
      setFeedback(result.error)
    }
  }

  return (
    <AuthPageLayout
      intent="login"
      title="Welcome back"
      subtitle="Sign in with the username you registered on this browser. First visit? Use Create account—there is no shared demo password."
    >
      <form className="auth-form" onSubmit={handleLogin} noValidate>
        {feedback ? (
          <div className="auth-form-error" role="alert">
            <p>{feedback}</p>
          </div>
        ) : null}

        <div className="auth-field auth-field--username">
          <label className="auth-field__label" htmlFor={usernameId}>
            Username
          </label>
          <div className="auth-field__control">
            <span className="auth-field__input-icon" aria-hidden="true">
              <AuthFieldUserIcon />
            </span>
            <input
            id={usernameId}
            className="auth-field__input auth-field__input--with-icon"
            type="text"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Enter your username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          </div>
        </div>

        <AuthPasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          withLeadingIcon
        />

        <div className="auth-form-actions">
          <button type="submit" className="btn btn--primary auth-submit" disabled={actionPending}>
            {actionPending ? 'Signing in…' : 'Log in'}
          </button>
        </div>
      </form>

      <p className="auth-switch">
        No account yet?{' '}
        <button type="button" className="auth-link-btn" onClick={onGoRegister}>
          Create account
        </button>
      </p>
    </AuthPageLayout>
  )
}
