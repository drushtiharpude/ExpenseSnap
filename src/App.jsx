import { useEffect, useState } from 'react'
import AnalyticsSection from './finance/AnalyticsSection.jsx'
import BillSplitter from './finance/BillSplitter.jsx'
import DashboardSection from './finance/DashboardSection.jsx'
import CategoriesSection from './settings/CategoriesSection.jsx'
import TransactionsSection from './transactions/TransactionsSection.jsx'
import { ShellNavIcon } from './ui/shellIcons.jsx'
import './App.css'

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
  const [sectionId, setSectionId] = useState(SECTIONS[0].id)
  const [navOpen, setNavOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_NAV_MQ).matches : false,
  )
  const section = SECTIONS.find((item) => item.id === sectionId) ?? SECTIONS[0]

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

  const sidebarHidden = mobileNav && !navOpen

  return (
    <div className="shell">
      <div className="shell-mobile-bar">
        <button
          type="button"
          className="shell-menu-toggle"
          aria-controls="shell-sidebar"
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={toggleNav}
        >
          <span className="shell-nav-icon">
            <ShellNavIcon name="menu" />
          </span>
        </button>
        <div className="shell-mobile-bar-brand">
          <BrandLockup />
        </div>
      </div>

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
              const selected = item.id === section.id
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
      </aside>

      <main className="shell-main">
        {section.id === 'transactions' ? (
          <TransactionsSection />
        ) : section.id === 'dashboard' ? (
          <DashboardSection />
        ) : section.id === 'splitter' ? (
          <BillSplitter />
        ) : section.id === 'analytics' ? (
          <AnalyticsSection />
        ) : section.id === 'settings' ? (
          <CategoriesSection />
        ) : (
          <section aria-labelledby="section-title">
            <h1 id="section-title">{section.label}</h1>
            <p>{section.summary}</p>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
