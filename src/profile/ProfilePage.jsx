import { useAuth } from '../auth/AuthProvider.jsx'
import { LOCAL_DEMO_AUTH_NOTICE } from '../auth/localDemoAuth.js'
import { profileAvatarInitials, profilePublicName } from '../auth/userProfile.js'
import ProfileDisplayNameForm from '../settings/ProfileSection.jsx'
import PageHeader from '../ui/PageHeader.jsx'
import { PAGE_TAGLINES } from '../ui/pageHeaderCopy.js'
import { ShellNavIcon } from '../ui/shellIcons.jsx'
import ProfilePhotoControl from './ProfilePhotoControl.jsx'
import './ProfilePage.css'

function formatMemberSince(iso) {
  if (typeof iso !== 'string' || iso.trim() === '' || Number.isNaN(Date.parse(iso))) {
    return null
  }
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(iso))
}

function AccountFactIcon({ name }) {
  return (
    <span className="profile-account-fact__icon" aria-hidden="true">
      <ShellNavIcon name={name} />
    </span>
  )
}

/**
 * @param {{ onNavigate?: (sectionId: string) => void }} props
 */
export default function ProfilePage({ onNavigate }) {
  const { user, actionPending, uploadProfilePhoto, removeProfilePhoto } = useAuth()

  if (!user?.id) {
    return null
  }

  const displayName = profilePublicName(user.displayName, user.username)
  const initials = profileAvatarInitials(user.displayName, user.username)
  const memberSince = formatMemberSince(user.createdAt)

  return (
    <section className="finance-page profile-page" aria-labelledby="section-title">
      <PageHeader
        icon="profile"
        variant="standard"
        title="Profile"
        tagline={PAGE_TAGLINES.profile}
        description="Your identity and greeting on this device."
      />

      <div className="profile-page-stack">
        <header className="profile-hero" aria-labelledby="profile-hero-title">
          <div className="profile-hero__ambient" aria-hidden="true">
            <span className="profile-hero__orb profile-hero__orb--teal" />
            <span className="profile-hero__orb profile-hero__orb--navy" />
            <span className="profile-hero__grid" />
          </div>
          <div className="profile-hero__inner">
            <ProfilePhotoControl
              variant="hero"
              photoUrl={user.profilePhotoUrl ?? null}
              initials={initials}
              disabled={actionPending}
              onUpload={uploadProfilePhoto}
              onRemove={removeProfilePhoto}
            />
            <div className="profile-hero__copy">
              <p id="profile-hero-title" className="profile-hero__eyebrow">
                Signed in
              </p>
              <h2 className="profile-hero__name">{displayName}</h2>
              <p className="profile-hero__username">@{user.username}</p>
              {user.motto ? (
                <blockquote className="profile-hero__motto">
                  <p>{user.motto}</p>
                </blockquote>
              ) : null}
            </div>
          </div>
        </header>

        <div className="profile-page-columns">
          <section className="profile-sheet profile-sheet--personalize" aria-labelledby="profile-personalize-title">
            <header className="profile-sheet__head">
              <h2 id="profile-personalize-title" className="profile-sheet__title">
                Personalization
              </h2>
              <p className="profile-sheet__subtitle">How the Dashboard greets you</p>
            </header>
            <div className="profile-sheet__body">
              <ProfileDisplayNameForm layout="page" />
            </div>
          </section>

          <section className="profile-sheet profile-sheet--account" aria-labelledby="profile-account-title">
            <header className="profile-sheet__head">
              <h2 id="profile-account-title" className="profile-sheet__title">
                Account &amp; data
              </h2>
              <p className="profile-sheet__subtitle profile-sheet__subtitle--spacer" aria-hidden="true">
                &nbsp;
              </p>
            </header>
            <div className="profile-sheet__body">
          <ul className="profile-account-facts">
            <li className="profile-account-fact">
              <AccountFactIcon name="profile" />
              <div className="profile-account-fact__copy">
                <p className="profile-account-fact__label">Account type</p>
                <p className="profile-account-fact__value">Local demo on this device</p>
              </div>
            </li>
            <li className="profile-account-fact">
              <AccountFactIcon name="settings" />
              <div className="profile-account-fact__copy">
                <p className="profile-account-fact__label">Finance data</p>
                <p className="profile-account-fact__value">Stored in this browser only</p>
              </div>
            </li>
            <li className="profile-account-fact">
              <AccountFactIcon name="analytics" />
              <div className="profile-account-fact__copy">
                <p className="profile-account-fact__label">Cloud sync</p>
                <p className="profile-account-fact__value">Not synced — local records stay on this device</p>
              </div>
            </li>
            {memberSince ? (
              <li className="profile-account-fact">
                <AccountFactIcon name="bills" />
                <div className="profile-account-fact__copy">
                  <p className="profile-account-fact__label">Member since</p>
                  <p className="profile-account-fact__value">{memberSince}</p>
                </div>
              </li>
            ) : null}
          </ul>
          <p className="profile-account__privacy">
            Demo users on the same device share one browser storage area — profiles and finance data are
            not isolated from each other.
          </p>
          <hr className="profile-account__rule" />
          <p className="profile-account__legal">{LOCAL_DEMO_AUTH_NOTICE}</p>
          {onNavigate ? (
            <button
              type="button"
              className="btn btn--primary profile-account__settings"
              onClick={() => onNavigate('settings')}
            >
              <span className="profile-account__settings-icon" aria-hidden="true">
                <ShellNavIcon name="settings" />
              </span>
              Open Settings
            </button>
          ) : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}
