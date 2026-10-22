import { useEffect, useState } from 'react'
import { useAuth } from './auth/AuthProvider.jsx'
import './auth/auth.css'
import AnalyticsSection from './finance/AnalyticsSection.jsx'
import BillSplitter from './finance/BillSplitter.jsx'
import BudgetSection from './finance/BudgetSection.jsx'
import RecurringBillsSection from './finance/RecurringBillsSection.jsx'
import SavingsGoalsSection from './finance/SavingsGoalsSection.jsx'
import DashboardSection from './finance/DashboardSection.jsx'
import { FinanceDataGate, useFinanceData } from './finance/FinanceDataProvider.jsx'
import ProfilePage from './profile/ProfilePage.jsx'
import CategoriesSection from './settings/CategoriesSection.jsx'
import { profileAvatarInitials, profilePublicName } from './auth/userProfile.js'
import TransactionsSection from './transactions/TransactionsSection.jsx'
import NotificationCentre from './notifications/NotificationCentre.jsx'
import { useNotificationCentre } from './notifications/useNotificationCentre.js'
import { ShellNavIcon } from './ui/shellIcons.jsx'
import './App.css'
import './notifications/notificationCentre.css'

const SECTIONS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    summary: 'A summary of spending will appear here.',
    icon: 'dashboard',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    summary: 'Expense history will appear here.',
    icon: 'transactions',
  },
  {
    id: 'splitter',
    label: 'Bill Splitter',
    summary: 'Equal bill splits will be calculated here.',
    icon: 'splitter',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    summary: 'Spending patterns will appear here.',
    icon: 'analytics',
  },
  {
    id: 'budgets',
    label: 'Budgets',
    summary: 'Monthly category limits will appear here.',
    icon: 'budgets',
  },
  {
    id: 'bills',
    label: 'Recurring Bills',
    summary: 'Scheduled bills and due dates will appear here.',
    icon: 'bills',
  },
  {
    id: 'savings',
    label: 'Savings Goals',
    summary: 'Target amounts and progress will appear here.',
    icon: 'savings',
  },
  {
    id: 'settings',
    label: 'Settings',
    summary: 'App preferences will appear here.',
    icon: 'settings',
  },
]

const MOBILE_NAV_MQ = '(max-width: 900px)'

const BRAND_LOCKUP_ALT = 'ExpenseSnap — Your Personal Expense Tracker'

function BrandLockup({ decorative = false }) {
  const alt = decorative ? '' : BRAND_LOCKUP_ALT
  return (
    <div className="brand-lockup" aria-hidden={decorative || undefined}>
      <img
        className="brand-logo brand-logo--lockup brand-logo--theme-light"
        src="/expensesnap-logo-light.png"
        alt={alt}
        width={1024}
        height={346}
        decoding="async"
      />
      <img
        className="brand-logo brand-logo--lockup brand-logo--theme-dark"
        src="/expensesnap-logo-dark.png"
        alt={alt}
        width={1024}
        height={346}
        decoding="async"
      />
    </div>
  )
}

function App() {
  const { user, username, signOut, actionPending } = useAuth()
  const { dataRevision, reloadAfterLocalRestore } = useFinanceData()
  const [sectionId, setSectionId] = useState(SECTIONS[0].id)
  const [signOutError, setSignOutError] = useState(null)
  const [navOpen, setNavOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_NAV_MQ).matches : false,
  )
  const section = SECTIONS.find((item) => item.id === sectionId) ?? SECTIONS[0]
  const onProfilePage = sectionId === 'profile'
  const profileNavName = profilePublicName(user?.displayName, username)
  const profileNavInitials = profileAvatarInitials(user?.displayName, username)
  const [storageRevision, setStorageRevision] = useState(0)
  const contentKey = `${storageRevision}-${dataRevision}`
  const notification = useNotificationCentre(contentKey)

  function handleStorageRestored() {
    setStorageRevision((revision) => revision + 1)
    reloadAfterLocalRestore()
  }

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_NAV_MQ)
    const sync = () => {
      setMobileNav(mq.matches)
      if (!mq.matches) setNavOpen(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!navOpen || !mobileNav) return
    function onKeyDown(event) {
      if (event.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navOpen, mobileNav])

  useEffect(() => {
    document.body.classList.toggle('shell-nav-open', navOpen && mobileNav)
    return () => document.body.classList.remove('shell-nav-open')
  }, [navOpen, mobileNav])

  function selectSection(id) {
    setSectionId(id)
    setNavOpen(false)
  }

  function toggleNav() {
    setNavOpen((open) => !open)
  }

  async function handleSignOut() {
    setSignOutError(null)
    const result = await signOut()
    if (!result.ok) {
      setSignOutError(result.error)
    }
  }

  const sidebarHidden = mobileNav && !navOpen

  const notificationCentre = (
    <NotificationCentre
      items={notification.items}
      unreadCount={notification.unreadCount}
      panelOpen={notification.panelOpen}
      onTogglePanel={() => notification.setPanelOpen((open) => !open)}
      onClosePanel={() => notification.setPanelOpen(false)}
      onMarkRead={notification.markRead}
      onDismiss={notification.dismiss}
      onMarkAllRead={notification.markAllRead}
    />
  )

  return (
    <div className="shell">
      <div
        className={`shell-overlay${navOpen && mobileNav ? ' is-visible' : ''}`}
        aria-hidden="true"
        onClick={() => setNavOpen(false)}
      />

      <aside
        id="shell-sidebar"
        className={`shell-sidebar${navOpen && mobileNav ? ' is-open' : ''}`}
        aria-label="Application"
        aria-hidden={sidebarHidden || undefined}
        inert={sidebarHidden || undefined}
      >
        <div className="shell-sidebar-brand">
          <BrandLockup decorative={mobileNav && navOpen} />
        </div>

        <nav className="shell-nav" aria-label="Primary">
          <ul className="shell-nav-list">
            {SECTIONS.map((item) => {
              const selected = !onProfilePage && item.id === section.id
              return (
                <li key={item.id} className="shell-nav-item">
                  <button
                    type="button"
                    className="shell-nav-link"
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => selectSection(item.id)}
                  >
                    <span className="shell-nav-icon">
                      <ShellNavIcon name={item.icon} />
                    </span>
                    <span className="shell-nav-label">{item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="shell-sidebar-footer">
          <button
            type="button"
            className="shell-nav-link shell-sidebar-footer__profile"
            aria-current={onProfilePage ? 'page' : undefined}
            onClick={() => selectSection('profile')}
          >
            {user?.profilePhotoUrl ? (
              <img
                className="shell-nav-profile-avatar shell-nav-profile-avatar--photo"
                src={user.profilePhotoUrl}
                alt=""
                decoding="async"
              />
            ) : (
              <span className="shell-nav-profile-avatar" aria-hidden="true">
                {profileNavInitials}
              </span>
            )}
            <span className="shell-nav-profile-text">
              <span className="shell-nav-profile-name" title={profileNavName}>
                {profileNavName}
              </span>
              {username ? (
                <span className="shell-nav-profile-username" title={username}>
                  @{username}
                </span>
              ) : null}
            </span>
            <span className="shell-nav-profile-chevron" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            type="button"
            className="shell-sidebar-footer__signout"
            onClick={handleSignOut}
            disabled={actionPending}
            aria-label="Log out of your account"
          >
            Log out
          </button>
          {signOutError ? (
            <p className="shell-sidebar-footer__error" role="alert">
              {signOutError}
            </p>
          ) : null}
        </div>
      </aside>

      <div className="shell-content">
        {section.id !== 'dashboard' ? (
          <header className="shell-app-header">
            {mobileNav ? (
              <button
                type="button"
                className="shell-menu-toggle shell-app-header__menu"
                aria-controls="shell-sidebar"
                aria-expanded={navOpen}
                aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
                onClick={toggleNav}
              >
                <span className="shell-nav-icon">
                  <ShellNavIcon name="menu" />
                </span>
              </button>
            ) : null}
            <div className="shell-app-header__brand">
              <BrandLockup />
            </div>
            <div className="shell-app-header__spacer" aria-hidden="true" />
            <div className="shell-app-header__actions">{notificationCentre}</div>
          </header>
        ) : null}

        <main className="shell-main">
        <FinanceDataGate>
          {onProfilePage ? (
            <ProfilePage key={contentKey} onNavigate={selectSection} />
          ) : section.id === 'transactions' ? (
            <TransactionsSection key={contentKey} />
          ) : section.id === 'dashboard' ? (
            <DashboardSection
              key={contentKey}
              headerActions={notificationCentre}
              mobileNav={mobileNav}
              navOpen={navOpen}
              onToggleNav={toggleNav}
              onNavigateToBudgets={() => selectSection('budgets')}
              onNavigateToSavings={() => selectSection('savings')}
            />
          ) : section.id === 'splitter' ? (
            <BillSplitter key={contentKey} />
          ) : section.id === 'analytics' ? (
            <AnalyticsSection key={contentKey} />
          ) : section.id === 'budgets' ? (
            <BudgetSection key={contentKey} />
          ) : section.id === 'bills' ? (
            <RecurringBillsSection key={contentKey} />
          ) : section.id === 'savings' ? (
            <SavingsGoalsSection key={contentKey} />
          ) : section.id === 'settings' ? (
            <CategoriesSection
              key={contentKey}
              onStorageRestored={handleStorageRestored}
            />
          ) : (
            <section aria-labelledby="section-title">
              <h1 id="section-title">{section.label}</h1>
              <p>{section.summary}</p>
            </section>
          )}
        </FinanceDataGate>
        </main>
      </div>
    </div>
  )
}

export default App
