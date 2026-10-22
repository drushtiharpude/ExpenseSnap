import { ShellNavIcon } from '../ui/shellIcons.jsx'
import { AuthDemoShieldIcon } from './authFieldIcons.jsx'
import './auth.css'

const AUTH_DEMO_FOOTNOTE =
  'Demo authentication only. Your financial data is not isolated between users.'

const AUTH_BRAND_SUB =
  'A calm fintech workspace for spending, budgets, and goals—stored on this device until you choose otherwise.'

const AUTH_BRAND_ILLUS_NOTE = 'Illustrations only — not your financial data.'

const AUTH_LOGIN_FEATURES = [
  { icon: 'transactions', lead: 'Track', rest: 'expenses' },
  { icon: 'budgets', lead: 'Plan', rest: 'budgets' },
  { icon: 'splitter', lead: 'Split', rest: 'bills' },
  { icon: 'savings', lead: 'Reach', rest: 'goals' },
]

function AuthWalletIcon() {
  return (
    <svg
      className="auth-brand__wallet-svg"
      width={32}
      height={32}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M3 7h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3V7z" />
      <circle cx="16" cy="13" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  )
}

function AuthBrandScene({ showDevice }) {
  return (
    <div className="auth-brand__scene" aria-hidden="true">
      {showDevice ? (
        <div className="auth-brand__device">
          <div className="auth-brand__device-bezel">
            <div className="auth-brand__device-screen">
              <span className="auth-brand__device-kpi" />
              <div className="auth-brand__device-chart" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <span className="auth-brand__device-bar auth-brand__device-bar--1" />
              <span className="auth-brand__device-bar auth-brand__device-bar--2" />
            </div>
          </div>
        </div>
      ) : null}
      <div className="auth-brand__orbit auth-brand__orbit--outer" />
      <div className="auth-brand__orbit auth-brand__orbit--inner" />
      <div className="auth-brand__core">
        <AuthWalletIcon />
      </div>

      <div className="auth-float-card auth-float-card--insight">
        <span className="auth-float-card__chip">Example</span>
        <span className="auth-float-card__icon">
          <ShellNavIcon name="analytics" />
        </span>
        <p className="auth-float-card__title">Spending Insight</p>
        <div className="auth-float-card__mini-chart auth-float-card__mini-chart--bars" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="auth-float-card__line">Steadier week-over-week rhythm</p>
      </div>

      <div className="auth-float-card auth-float-card--savings">
        <span className="auth-float-card__chip">Example</span>
        <span className="auth-float-card__icon">
          <ShellNavIcon name="savings" />
        </span>
        <p className="auth-float-card__title">Savings goal</p>
        <div className="auth-float-card__progress" role="presentation">
          <span className="auth-float-card__progress-fill" />
        </div>
        <p className="auth-float-card__line">Progress illustration only</p>
      </div>

      <div className="auth-float-card auth-float-card--budget">
        <span className="auth-float-card__chip">Example</span>
        <span className="auth-float-card__icon">
          <ShellNavIcon name="budgets" />
        </span>
        <p className="auth-float-card__title">Budget pulse</p>
        <div className="auth-float-card__mini-chart auth-float-card__mini-chart--ring" aria-hidden="true" />
        <p className="auth-float-card__line">Room to plan ahead this month</p>
      </div>
    </div>
  )
}

/**
 * @param {{ title: string, subtitle?: string, intent?: 'login' | 'register', children: import('react').ReactNode }} props
 */
export default function AuthPageLayout({ title, subtitle, intent = 'login', children }) {
  const isLogin = intent === 'login'

  return (
    <div className={`auth-split auth-split--${intent}`}>
      <div className="auth-split__ambient" aria-hidden="true" />
      {isLogin ? (
        <header className="auth-page-header">
          <div className="auth-page-header__brand">
            <span className="auth-page-header__logo" aria-hidden="true">
              <AuthWalletIcon />
            </span>
            <span className="auth-page-header__name">ExpenseSnap</span>
          </div>
          <p className="auth-page-header__tagline">{AUTH_BRAND_ILLUS_NOTE}</p>
        </header>
      ) : null}
      <div className="auth-split__columns">
        <aside className="auth-split__brand auth-brand" aria-label="ExpenseSnap">
          <div className="auth-brand__content">
            <p className="auth-brand__wordmark">
              <span className="auth-brand__wordmark-icon" aria-hidden="true">
                <AuthWalletIcon />
              </span>
              ExpenseSnap
            </p>
            <h2 className="auth-brand__headline">
              {isLogin ? (
                <>
                  <span className="auth-brand__headline-primary">Your money,</span>
                  <span className="auth-brand__headline-accent">in motion</span>
                </>
              ) : (
                <>
                  Your money, <span className="auth-brand__headline-accent">in motion</span>
                </>
              )}
            </h2>
            <p className="auth-brand__sub">{AUTH_BRAND_SUB}</p>
            {isLogin ? (
              <ul className="auth-brand__features">
                {AUTH_LOGIN_FEATURES.map(({ icon, lead, rest }) => (
                  <li key={`${lead}-${rest}`}>
                    <span className="auth-brand__feature-icon" aria-hidden="true">
                      <ShellNavIcon name={icon} />
                    </span>
                    <span className="auth-brand__feature-label">
                      <span className="auth-brand__feature-label-lead">{lead}</span> {rest}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <AuthBrandScene showDevice={false} />
            <p className="auth-brand__illus-note">{AUTH_BRAND_ILLUS_NOTE}</p>
          </div>
        </aside>

        <main className="auth-split__form">
          <div className={`auth-form-panel auth-form-panel--${intent}`} key={intent}>
            <div className="auth-heading">
              <h1 className="auth-heading__title">{title}</h1>
              {subtitle ? <p className="auth-heading__sub">{subtitle}</p> : null}
            </div>

            <div className="auth-form-panel__body">{children}</div>
            <p className="auth-demo-footnote" role="note">
              {isLogin ? (
                <span className="auth-demo-footnote__icon" aria-hidden="true">
                  <AuthDemoShieldIcon />
                </span>
              ) : null}
              <span className="auth-demo-footnote__text">{AUTH_DEMO_FOOTNOTE}</span>
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
