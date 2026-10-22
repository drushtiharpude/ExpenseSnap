import { useId, useRef, useState } from 'react'

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}

/**
 * @param {{
 *   photoUrl: string | null,
 *   initials: string,
 *   disabled?: boolean,
 *   variant?: 'default' | 'hero',
 *   onUpload: (file: File) => Promise<{ ok: boolean, error?: string }>,
 *   onRemove: () => Promise<{ ok: boolean, error?: string }>,
 * }} props
 */
export default function ProfilePhotoControl({
  photoUrl,
  initials,
  disabled,
  variant = 'default',
  onUpload,
  onRemove,
}) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [statusError, setStatusError] = useState(null)
  const [busy, setBusy] = useState(false)
  const isHero = variant === 'hero'

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setStatusError(null)
    setBusy(true)
    try {
      const result = await onUpload(file)
      if (!result.ok) {
        setStatusError(result.error ?? 'Photo could not be saved.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setStatusError(null)
    setBusy(true)
    try {
      const result = await onRemove()
      if (!result.ok) {
        setStatusError(result.error ?? 'Photo could not be removed.')
      }
    } finally {
      setBusy(false)
    }
  }

  const controlsDisabled = disabled || busy
  const editLabel = busy ? 'Updating photo…' : photoUrl ? 'Change profile photo' : 'Upload profile photo'

  return (
    <div className={`profile-photo${isHero ? ' profile-photo--hero' : ''}`}>
      <div className="profile-photo__frame">
        {photoUrl ? (
          <img className="profile-photo__image" src={photoUrl} alt="" decoding="async" />
        ) : (
          <span className="profile-photo__initials" aria-hidden="true">
            {initials}
          </span>
        )}
        <label
          className="profile-photo__edit"
          htmlFor={inputId}
          aria-label={editLabel}
          title={editLabel}
        >
          <CameraIcon />
          <span className="visually-hidden">{editLabel}</span>
        </label>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        className="profile-photo__input visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={controlsDisabled}
        onChange={handleFileChange}
      />

      {isHero ? (
        photoUrl ? (
          <button
            type="button"
            className="profile-photo__remove-link"
            disabled={controlsDisabled}
            onClick={handleRemove}
          >
            Remove photo
          </button>
        ) : null
      ) : (
        <div className="profile-photo__actions">
          <label className="btn btn--primary profile-photo__upload" htmlFor={inputId}>
            {busy ? 'Working…' : photoUrl ? 'Change photo' : 'Upload photo'}
          </label>
          {photoUrl ? (
            <button
              type="button"
              className="btn profile-photo__remove"
              disabled={controlsDisabled}
              onClick={handleRemove}
            >
              Remove
            </button>
          ) : null}
        </div>
      )}

      {statusError ? (
        <p className="profile-photo__error" role="alert">
          {statusError}
        </p>
      ) : null}
    </div>
  )
}
