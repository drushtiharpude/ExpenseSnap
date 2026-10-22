import { useId, useState } from 'react'
import { AuthFieldLockIcon } from './authFieldIcons.jsx'

export default function AuthPasswordField({
  name,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  required = true,
  minLength,
  withLeadingIcon = false,
}) {
  const id = useId()
  const [visible, setVisible] = useState(false)

  return (
    <div className="auth-field auth-field--password">
      <label className="auth-field__label" htmlFor={id}>
        {label}
      </label>
      <div
        className={`auth-field__control${withLeadingIcon ? ' auth-field__control--password' : ''}`}
      >
        {withLeadingIcon ? (
          <span className="auth-field__input-icon" aria-hidden="true">
            <AuthFieldLockIcon />
          </span>
        ) : null}
        <div className="auth-password-wrap">
        <input
          id={id}
          className={`auth-field__input auth-password-wrap__input${withLeadingIcon ? ' auth-field__input--with-icon' : ''}`}
          type={visible ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-label={label}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((show) => !show)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
        </div>
      </div>
    </div>
  )
}
