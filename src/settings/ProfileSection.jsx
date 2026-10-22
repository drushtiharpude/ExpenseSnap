import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { validateDisplayName, validateMotto, MAX_MOTTO_LENGTH } from '../auth/userProfile.js'
import { buildDashboardWelcomeLine } from '../finance/dashboardGreeting.js'
import './ProfileSection.css'

/**
 * @param {{ layout?: 'page' | 'settings' }} props
 */
export default function ProfileDisplayNameForm({ layout = 'settings' }) {
  const { user, updateDisplayName, updateMotto, actionPending } = useAuth()
  const savedDisplayName = user?.displayName ?? ''
  const savedMotto = user?.motto ?? ''
  const username = user?.username ?? ''
  const [draft, setDraft] = useState(savedDisplayName)
  const [mottoDraft, setMottoDraft] = useState(savedMotto)
  const [previewAt] = useState(() => new Date())
  const [formError, setFormError] = useState(null)
  const [saveNotice, setSaveNotice] = useState(null)
  const [mottoError, setMottoError] = useState(null)
  const [mottoNotice, setMottoNotice] = useState(null)

  const dirty = draft !== savedDisplayName
  const mottoDirty = mottoDraft !== savedMotto
  const previewLine = buildDashboardWelcomeLine(username, previewAt, draft)

  function handleCancel() {
    setDraft(savedDisplayName)
    setFormError(null)
    setSaveNotice(null)
  }

  function handleMottoCancel() {
    setMottoDraft(savedMotto)
    setMottoError(null)
    setMottoNotice(null)
  }

  async function handleMottoSubmit(event) {
    event.preventDefault()
    setMottoError(null)
    setMottoNotice(null)
    const validated = validateMotto(mottoDraft)
    if (!validated.ok) {
      setMottoError(validated.error)
      return
    }
    const result = await updateMotto(validated.motto)
    if (!result.ok) {
      setMottoError(result.error)
      return
    }
    setMottoDraft(result.motto ?? '')
    setMottoNotice('Motto saved on this device.')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)
    setSaveNotice(null)
    const validated = validateDisplayName(draft)
    if (!validated.ok) {
      setFormError(validated.error)
      return
    }
    const result = await updateDisplayName(validated.displayName)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    setDraft(result.displayName ?? '')
    setSaveNotice('Profile saved on this device.')
  }

  if (!user?.id) {
    return null
  }

  const isPageLayout = layout === 'page'
  const formId = isPageLayout ? 'profile-display-name' : 'settings-profile-display-name'
  const mottoId = isPageLayout ? 'profile-motto' : 'settings-profile-motto'

  return (
    <div className={`profile-settings profile-settings--${layout}`}>
      {layout === 'settings' ? (
        <dl className="profile-settings-meta">
          <div className="profile-settings-meta__row">
            <dt>Username</dt>
            <dd>{username || '—'}</dd>
          </div>
        </dl>
      ) : null}

      <form className="profile-settings-form" onSubmit={handleSubmit} noValidate>
        <label className="profile-settings-field" htmlFor={formId}>
          Display name
          <input
            id={formId}
            name="displayName"
            type="text"
            maxLength={40}
            autoComplete="nickname"
            placeholder={isPageLayout ? 'Optional greeting name' : 'How you would like to be greeted'}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setFormError(null)
              setSaveNotice(null)
            }}
          />
        </label>
        {!isPageLayout ? (
          <p className="profile-settings-hint">
            Leave blank to use a friendly version of your username on the Dashboard. Up to 40 characters.
          </p>
        ) : null}

        <div className="profile-settings-preview" aria-live="polite">
          <p className="profile-settings-preview-label">Greeting preview</p>
          <p className="profile-settings-preview-line">{previewLine}</p>
        </div>

        {formError ? (
          <div className="profile-settings-alert" role="alert">
            <p>{formError}</p>
          </div>
        ) : null}
        {saveNotice ? (
          <div className="profile-settings-notice" role="status">
            <p>{saveNotice}</p>
          </div>
        ) : null}

        <div className="form-actions profile-settings-actions">
          <button type="submit" className="btn btn--primary" disabled={actionPending || !dirty}>
            {actionPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={actionPending || !dirty}
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      </form>

      {isPageLayout ? (
        <form className="profile-settings-form profile-settings-form--motto" onSubmit={handleMottoSubmit} noValidate>
          <label className="profile-settings-field" htmlFor={mottoId}>
            Personal motto
            <textarea
              id={mottoId}
              name="motto"
              rows={2}
              maxLength={MAX_MOTTO_LENGTH}
              placeholder="Optional — a short line on your profile"
              value={mottoDraft}
              onChange={(event) => {
                setMottoDraft(event.target.value)
                setMottoError(null)
                setMottoNotice(null)
              }}
            />
          </label>

          {mottoError ? (
            <div className="profile-settings-alert" role="alert">
              <p>{mottoError}</p>
            </div>
          ) : null}
          {mottoNotice ? (
            <div className="profile-settings-notice" role="status">
              <p>{mottoNotice}</p>
            </div>
          ) : null}

          <div className="form-actions profile-settings-actions">
            <button type="submit" className="btn btn--primary" disabled={actionPending || !mottoDirty}>
              {actionPending ? 'Saving…' : 'Save motto'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={actionPending || !mottoDirty}
              onClick={handleMottoCancel}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {!isPageLayout ? (
        <p className="profile-settings-footnote" role="note">
          Username and email cannot be changed here in local demo mode. Use Profile for photo and motto.
        </p>
      ) : null}
    </div>
  )
}
