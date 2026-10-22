import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { goalSavedBalancePaise } from '../data/savingsGoal.js'
import { readSavingsGoals } from '../data/savingsGoalStore.js'
import { readBudgets } from '../data/budgetStore.js'
import { readCategories } from '../data/categoryStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { categoryLabel } from '../transactions/categories.js'
import { formatInrFromPaise } from '../transactions/money.js'
import { CategoryExpenseIcon, DashboardMetricIcon, ShellNavIcon } from '../ui/shellIcons.jsx'
import { CashFlowBarChart, CategoryDonutChart, SavingsGoalProgressRing } from './DashboardCharts.jsx'
import { buildCategoryDonutSegments, buildDashboardCashFlow } from './dashboardVisuals.js'
import { goalProgressPercent, summarizeSavingsGoals } from './savingsGoalProgress.js'
import { selectPrimaryDashboardInsight, summarizeForMonth } from './analyze.js'
import {
  DASHBOARD_HEADER_SUBTITLE,
  formatDashboardHeaderDate,
  resolveDashboardGreetName,
  timeOfDayGreeting,
} from './dashboardGreeting.js'
import {
  clampDashboardMonth,
  currentDashboardMonth,
  dashboardNextMonth,
  dashboardPreviousMonth,
  hasTransactionsInMonth,
} from './dashboardMonth.js'
import { budgetStatusForMonth } from './budgetStatus.js'
import { safeToSpendForMonth } from './safeToSpend.js'
import { summarizeTransactions } from './summarize.js'
import './finance.css'
import './dashboardPremium.css'

const SAFE_TO_SPEND_FOOTNOTE = 'Saved data only · not your bank balance'

function storageErrorMessage(result) {
  if (result.error === 'unavailable') {
    return 'Browser storage is unavailable. Existing transactions were left unchanged.'
  }
  if (result.error === 'malformed') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `Saved transactions could not be read. They were left unchanged.${detail}`
  }
  return 'Saved transactions could not be read. They were left unchanged.'
}

function readStorageState() {
  const result = readTransactions()
  if (result.ok) return { records: result.transactions, loadError: null }
  return { records: null, loadError: result }
}

function monthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  )
}

function compareExpensesByDate(left, right) {
  if (left.date !== right.date) return right.date.localeCompare(left.date)
  if (left.createdAt !== right.createdAt) return right.createdAt.localeCompare(left.createdAt)
  return left.id.localeCompare(right.id)
}

function recentExpensesInMonth(transactions, monthKey, limit = 5) {
  if (!Array.isArray(transactions) || typeof monthKey !== 'string') return []
  return transactions
    .filter(
      (transaction) =>
        transaction.type === 'expense' &&
        typeof transaction.date === 'string' &&
        transaction.date.slice(0, 7) === monthKey,
    )
    .sort(compareExpensesByDate)
    .slice(0, limit)
}

function DashboardMonthToolbar({ activeMonth, currentMonth, onMonthChange }) {
  const previous = dashboardPreviousMonth(activeMonth)
  const next = dashboardNextMonth(activeMonth)
  const onCurrentMonth = activeMonth === currentMonth

  function handleInputChange(event) {
    onMonthChange(clampDashboardMonth(event.target.value))
  }

  return (
    <div className="page-banner__toolbar dashboard-month-toolbar">
      <div className="dashboard-month-nav" role="group" aria-label="Dashboard month">
        <div className="dashboard-month-nav__control">
          <button
            type="button"
            className="dashboard-month-nav__step dashboard-month-nav__step--leading"
            disabled={!previous}
            aria-label="Previous month"
            onClick={() => previous && onMonthChange(previous)}
          >
            ‹
          </button>
          <label className="dashboard-month-nav__field" htmlFor="dashboard-month">
            <span className="visually-hidden">Viewing month</span>
            <input
              id="dashboard-month"
              className="dashboard-month-nav__input"
              type="month"
              value={activeMonth}
              max={currentMonth}
              onChange={handleInputChange}
            />
          </label>
          <button
            type="button"
            className="dashboard-month-nav__step dashboard-month-nav__step--trailing"
            disabled={!next}
            aria-label="Next month"
            onClick={() => next && onMonthChange(next)}
          >
            ›
          </button>
        </div>
        {!onCurrentMonth ? (
          <button
            type="button"
            className="btn dashboard-month-nav__current"
            onClick={() => onMonthChange(currentMonth)}
          >
            Current month
          </button>
        ) : null}
      </div>
    </div>
  )
}

function budgetUsePercent(spentPaise, limitPaise) {
  if (limitPaise <= 0) return 0
  return Math.min(100, Math.floor((spentPaise * 100) / limitPaise))
}

function safeToSpendPresentation(result) {
  if (!result?.ok) return null
  const { mode, headlinePaise } = result

  if (mode === 'empty_month') {
    return {
      cardTone: 'neutral',
      headlineLabel: 'Money left',
      statusLabel: 'No activity yet',
      statusTone: 'neutral',
      value: null,
      showBudgetCta: !result.hasBudgets,
      showBudgetLink: result.hasBudgets,
    }
  }

  if (mode === 'empty_month_with_budgets') {
    return {
      cardTone: 'ok',
      headlineLabel: 'Budget room',
      statusLabel: 'Ready to spend',
      statusTone: 'ok',
      value: headlinePaise,
      valueTone: 'balance',
      showBudgetProgress: true,
      showBudgetLink: true,
    }
  }

  if (mode === 'combined' || mode === 'budget_only') {
    const over = headlinePaise < 0
    return {
      cardTone: over ? 'warn' : 'ok',
      headlineLabel: over ? 'Over plan' : 'Money left',
      statusLabel: over ? 'Over budget' : mode === 'combined' ? 'Income capped' : 'Budget only',
      statusTone: over ? 'warn' : 'ok',
      value: headlinePaise,
      valueTone: over ? 'expense' : 'balance',
      showBudgetProgress: true,
      showIncomeMetric: result.monthIncomePaise > 0,
      showUnbudgetedMetric: result.unbudgetedExpensePaise > 0,
      showBudgetLink: true,
    }
  }

  if (mode === 'income_only') {
    const negative = result.monthNetPaise < 0
    return {
      cardTone: negative ? 'warn' : 'neutral',
      headlineLabel: 'Month net',
      statusLabel: 'No budgets set',
      statusTone: 'neutral',
      value: result.monthNetPaise,
      valueTone: negative ? 'expense' : 'balance',
      showIncomeMetric: true,
      showExpenseMetric: result.monthExpensePaise > 0,
      showBudgetCta: true,
    }
  }

  if (mode === 'expenses_only') {
    return {
      cardTone: 'neutral',
      headlineLabel: 'Spending',
      statusLabel: 'No budgets or income',
      statusTone: 'neutral',
      value: null,
      showExpenseMetric: result.monthExpensePaise > 0,
      showBudgetCta: true,
    }
  }

  return null
}

function DashboardKpiCard({ label, value, tone, icon, hint, role }) {
  return (
    <article
      className={`dashboard-kpi-card dashboard-kpi-card--${tone}${
        role ? ` dashboard-kpi-card--role-${role}` : ''
      }`}
    >
      <span className="dashboard-kpi-icon" aria-hidden="true">
        {icon}
      </span>
      <p className="dashboard-kpi-label">{label}</p>
      <p className={`dashboard-kpi-value ${tone}`}>{value}</p>
      {hint ? <p className="dashboard-kpi-hint">{hint}</p> : null}
    </article>
  )
}

function DashboardSection({
  headerActions,
  mobileNav,
  navOpen,
  onToggleNav,
  onNavigateToBudgets,
  onNavigateToSavings,
}) {
  const { user } = useAuth()
  const [greetingAt] = useState(() => new Date())
  const timeGreeting = timeOfDayGreeting(greetingAt)
  const greetName = resolveDashboardGreetName(user?.displayName, user?.username)
  const greetingHeadline = greetName ? `${timeGreeting}, ${greetName}!` : `${timeGreeting}!`
  const headerDateLabel = formatDashboardHeaderDate(greetingAt)
  const headerDateIso = greetingAt.toISOString().slice(0, 10)
  const [storageState, setStorageState] = useState(readStorageState)
  const [categoryState, setCategoryState] = useState(() => {
    const result = readCategories()
    if (result.ok) return { categories: result.categories, error: null }
    return { categories: [], error: result }
  })
  const [viewedAt] = useState(() => new Date())
  const currentMonth = currentDashboardMonth(viewedAt)
  const [selectedMonth, setSelectedMonth] = useState(() => currentDashboardMonth(viewedAt))
  const activeMonth = clampDashboardMonth(selectedMonth, viewedAt)
  const savingsRead = readSavingsGoals()
  const savingsGoals = savingsRead.ok ? savingsRead.goals : []
  const records = storageState.records
  const loadError = storageState.loadError
  const allTimeSummary = records === null ? null : summarizeTransactions(records, viewedAt)
  const hasAnyTransactions = records !== null && records.length > 0
  const monthSummary =
    records !== null ? summarizeForMonth(records, activeMonth) : null
  const hasMonthActivity =
    records !== null && hasTransactionsInMonth(records, activeMonth)
  const recentExpenseRows =
    records === null ? [] : recentExpensesInMonth(records, activeMonth)

  function retry() {
    const result = readTransactions()
    setStorageState((current) =>
      result.ok
        ? { records: result.transactions, loadError: null }
        : { records: current.records, loadError: result },
    )
  }

  let dashboardBudgetStatus = null
  if (records !== null && monthSummary?.ok && !categoryState.error) {
    const budgetRead = readBudgets(undefined, { customCategories: categoryState.categories })
    if (budgetRead.ok) {
      dashboardBudgetStatus = budgetStatusForMonth(
        budgetRead.budgets,
        records,
        activeMonth,
        categoryState.categories,
      )
    }
  }
  const insightForMonth =
    allTimeSummary?.ok && monthSummary?.ok
      ? {
          ...allTimeSummary,
          month: activeMonth,
          monthIncomePaise: monthSummary.incomePaise,
          monthExpensePaise: monthSummary.expensePaise,
        }
      : null
  const insight =
    insightForMonth
      ? selectPrimaryDashboardInsight({
          summary: insightForMonth,
          monthSummary,
          budgetStatus: dashboardBudgetStatus,
          customCategories: categoryState.categories,
        })
      : null
  const monthExpensePaise = monthSummary?.ok ? monthSummary.expensePaise : 0
  const monthIncomePaise = monthSummary?.ok ? monthSummary.incomePaise : 0
  const monthCategorySegments =
    monthSummary?.ok
      ? buildCategoryDonutSegments(monthSummary.categories, monthExpensePaise)
      : []
  const cashFlow =
    records !== null && monthSummary?.ok
      ? buildDashboardCashFlow(records, activeMonth, 4)
      : { ok: false, rows: [], maxPaise: 1 }
  const monthNetPaise = monthSummary?.ok ? monthSummary.netPaise : 0
  const selectedMonthLabel = monthLabel(activeMonth)
  const savingsSummary = summarizeSavingsGoals(savingsGoals)
  const savingsProgressPercent =
    savingsSummary.ok && savingsSummary.totalTargetPaise > 0
      ? goalProgressPercent(savingsSummary.totalSavedPaise, savingsSummary.totalTargetPaise)
      : null

  let safeToSpend = null
  if (records !== null && monthSummary?.ok) {
    const budgetRead = readBudgets(undefined, { customCategories: categoryState.categories })
    safeToSpend = budgetRead.ok
      ? safeToSpendForMonth(
          records,
          budgetRead.budgets,
          activeMonth,
          categoryState.categories,
          viewedAt,
        )
      : { ok: false, error: 'budgets_unreadable' }
  }

  const safePresentation =
    safeToSpend?.ok && monthSummary?.ok ? safeToSpendPresentation(safeToSpend) : null

  const budgetProgressPercent =
    safeToSpend?.ok && safePresentation?.showBudgetProgress && safeToSpend.budgetLimitPaise > 0
      ? budgetUsePercent(safeToSpend.budgetSpentPaise, safeToSpend.budgetLimitPaise)
      : 0

  const budgetProgressOver =
    safeToSpend?.ok &&
    safePresentation?.showBudgetProgress &&
    safeToSpend.budgetRemainingPaise < 0

  return (
    <section className="finance dashboard" aria-labelledby="section-title">
      <header className="dashboard-top-header">
        <div className="dashboard-top-header__lead">
          <div className="dashboard-top-header__date-row">
            <span className="dashboard-top-header__date-icon" aria-hidden="true">
              <ShellNavIcon name="calendar" />
            </span>
            <time className="dashboard-top-header__date" dateTime={headerDateIso}>
              {headerDateLabel}
            </time>
          </div>
          <h1 id="section-title" className="dashboard-top-header__greeting">
            {greetingHeadline}
          </h1>
          <p className="dashboard-top-header__subtitle">{DASHBOARD_HEADER_SUBTITLE}</p>
        </div>
        <div className="dashboard-top-header__tools">
          {mobileNav && onToggleNav ? (
            <button
              type="button"
              className="shell-menu-toggle shell-app-header__menu dashboard-top-header__menu"
              aria-controls="shell-sidebar"
              aria-expanded={navOpen}
              aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={onToggleNav}
            >
              <span className="shell-nav-icon">
                <ShellNavIcon name="menu" />
              </span>
            </button>
          ) : null}
          {headerActions ? (
            <div className="dashboard-top-header__notifications">{headerActions}</div>
          ) : null}
          {records !== null && !loadError ? (
            <DashboardMonthToolbar
              activeMonth={activeMonth}
              currentMonth={currentMonth}
              onMonthChange={(month) => setSelectedMonth(clampDashboardMonth(month, viewedAt))}
            />
          ) : null}
        </div>
      </header>

      {categoryState.error && (
        <div className="form-alert" role="alert">
          <p>
            Custom categories could not be read. Built-in names are still shown, and saved
            transactions were left unchanged.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const result = readCategories()
              setCategoryState((current) =>
                result.ok
                  ? { categories: result.categories, error: null }
                  : { categories: current.categories, error: result },
              )
            }}
          >
            Try again
          </button>
        </div>
      )}

      {loadError && (
        <div className="form-alert" role="alert">
          <p>{storageErrorMessage(loadError)}</p>
          <button type="button" className="btn" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {allTimeSummary && !allTimeSummary.ok && (
        <div className="form-alert" role="alert">
          <p>These totals cannot be calculated from the saved transactions.</p>
        </div>
      )}

      {allTimeSummary?.ok && !hasAnyTransactions && (
        <section className="dashboard-onboarding dashboard-block" aria-labelledby="dashboard-onboarding-title">
          <div className="dashboard-onboarding-lead">
            <span className="dashboard-onboarding-icon" aria-hidden="true">
              <DashboardMetricIcon name="wallet" />
            </span>
            <div className="dashboard-onboarding-copy">
              <h2 id="dashboard-onboarding-title" className="dashboard-onboarding-title">
                Start with your first transaction
              </h2>
              <p className="dashboard-onboarding-desc">
                ExpenseSnap works best once you record a little income or spending. Your dashboard
                will show balance, category breakdown, and recent activity here—nothing is sent to a
                server.
              </p>
            </div>
          </div>
          <ol className="dashboard-onboarding-steps">
            <li>Open <strong>Transactions</strong> from the menu.</li>
            <li>Add an expense or income entry with amount, date, and category.</li>
            <li>Return here to see totals and where your money goes.</li>
          </ol>
        </section>
      )}

      {allTimeSummary?.ok && hasAnyTransactions && (
        <div className="dashboard-stack dashboard-stack--v2">
          {!hasMonthActivity ? (
            <section
              className="dashboard-block dashboard-month-empty"
              aria-labelledby="dashboard-month-empty-title"
            >
              <h2 id="dashboard-month-empty-title" className="dashboard-month-empty-title">
                No transactions in {selectedMonthLabel}
              </h2>
              <p className="dashboard-month-empty-body">
                Nothing is dated in this month in your saved data. Choose another month above or
                add transactions with dates in {selectedMonthLabel}.
              </p>
              {activeMonth !== currentMonth ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setSelectedMonth(currentMonth)}
                >
                  Go to current month
                </button>
              ) : null}
            </section>
          ) : null}

          {hasMonthActivity ? (
          <section className="dashboard-block dashboard-overview" aria-labelledby="dashboard-overview-title">
            <header className="dashboard-overview-head">
              <h2 id="dashboard-overview-title" className="dashboard-overview-title">
                Financial overview
              </h2>
            </header>
            <div className="dashboard-kpi-grid">
              <DashboardKpiCard
                label="Income"
                role="income"
                tone="amount--income"
                value={formatInrFromPaise(monthIncomePaise)}
                icon={<DashboardMetricIcon name="trend-up" />}
                hint={selectedMonthLabel}
              />
              <DashboardKpiCard
                label="Expenses"
                role="expense"
                tone="amount--expense"
                value={formatInrFromPaise(monthExpensePaise)}
                icon={<DashboardMetricIcon name="trend-down" />}
                hint={selectedMonthLabel}
              />
              <DashboardKpiCard
                label="Net balance"
                role="net"
                tone={monthNetPaise < 0 ? 'amount--expense' : 'amount--balance'}
                value={formatInrFromPaise(monthNetPaise)}
                icon={<DashboardMetricIcon name="wallet" />}
                hint={`Income minus expenses · ${selectedMonthLabel}`}
              />
              <DashboardKpiCard
                label="Savings progress"
                role="savings"
                tone="amount--balance"
                value={
                  savingsProgressPercent === null
                    ? '—'
                    : `${savingsProgressPercent}%`
                }
                icon={<DashboardMetricIcon name="wallet" />}
                hint={
                  savingsSummary.ok && savingsSummary.goalCount > 0
                    ? `${formatInrFromPaise(savingsSummary.totalSavedPaise)} of ${formatInrFromPaise(savingsSummary.totalTargetPaise)} across goals`
                    : 'Separate from transactions'
                }
              />
            </div>
            <p className="dashboard-overview-footnote">
              All-time net from saved transactions:{' '}
              <span className="amount amount--balance">{formatInrFromPaise(allTimeSummary.netPaise)}</span>
            </p>
          </section>
          ) : null}

          {safePresentation && safeToSpend?.ok && (
            <section
              className={`dashboard-block dashboard-budget-compact dashboard-safe-to-spend--${safePresentation.cardTone}`}
              aria-labelledby="dashboard-safe-to-spend-title"
            >
              <div className="dashboard-budget-compact-head">
                <p id="dashboard-safe-to-spend-title" className="dashboard-budget-compact-eyebrow">
                  {safePresentation.headlineLabel}
                </p>
                <span
                  className={`dashboard-sts-status dashboard-sts-status--${safePresentation.statusTone}`}
                  role="status"
                >
                  {safePresentation.statusLabel}
                </span>
              </div>
              {safePresentation.value !== null && (
                <div className="dashboard-budget-compact-hero">
                  <p
                    className={`dashboard-budget-compact-value amount${
                      safePresentation.valueTone === 'expense' ? ' amount--expense' : ' amount--balance'
                    }`}
                  >
                    {safePresentation.valueTone === 'expense' && safePresentation.value < 0
                      ? `−${formatInrFromPaise(-safePresentation.value)}`
                      : formatInrFromPaise(safePresentation.value)}
                  </p>
                </div>
              )}
              {(safePresentation.showBudgetProgress ||
                safePresentation.showIncomeMetric ||
                safePresentation.showExpenseMetric ||
                safePresentation.showUnbudgetedMetric) && (
                <div className="dashboard-budget-compact-details">
                  {safePresentation.showBudgetProgress && safeToSpend.budgetLimitPaise > 0 && (
                    <div className="dashboard-sts-budget">
                      <div
                        className={`dashboard-sts-progress${
                          budgetProgressOver ? ' dashboard-sts-progress--over' : ''
                        }`}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={budgetProgressPercent}
                        aria-label={`${budgetProgressPercent}% of combined category budget used`}
                      >
                        <div
                          className="dashboard-sts-progress-fill"
                          style={{ width: `${budgetProgressPercent}%` }}
                        />
                      </div>
                      <div className="dashboard-sts-budget-labels">
                        <span>
                          Spent{' '}
                          <strong className="amount amount--expense">
                            {formatInrFromPaise(safeToSpend.budgetSpentPaise)}
                          </strong>{' '}
                          of{' '}
                          <strong>{formatInrFromPaise(safeToSpend.budgetLimitPaise)}</strong>
                        </span>
                        <span>{budgetProgressPercent}% used</span>
                      </div>
                    </div>
                  )}
                  {(safePresentation.showIncomeMetric ||
                    safePresentation.showExpenseMetric ||
                    safePresentation.showUnbudgetedMetric) && (
                    <dl className="dashboard-sts-metrics">
                      {safePresentation.showIncomeMetric ? (
                        <div>
                          <dt>Month income</dt>
                          <dd className="amount amount--income">
                            {formatInrFromPaise(safeToSpend.monthIncomePaise)}
                          </dd>
                        </div>
                      ) : null}
                      {safePresentation.showExpenseMetric ? (
                        <div>
                          <dt>Month expenses</dt>
                          <dd className="amount amount--expense">
                            {formatInrFromPaise(safeToSpend.monthExpensePaise)}
                          </dd>
                        </div>
                      ) : null}
                      {safePresentation.showUnbudgetedMetric ? (
                        <div>
                          <dt>Outside budgets</dt>
                          <dd className="amount amount--expense">
                            {formatInrFromPaise(safeToSpend.unbudgetedExpensePaise)}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  )}
                </div>
              )}
              <footer className="dashboard-sts-foot dashboard-budget-compact-foot">
                <p className="dashboard-sts-footnote">{SAFE_TO_SPEND_FOOTNOTE}</p>
                {typeof onNavigateToBudgets === 'function' &&
                  (safePresentation.showBudgetCta || safePresentation.showBudgetLink) && (
                    <div className="dashboard-sts-actions">
                      {safePresentation.showBudgetCta && (
                        <button type="button" className="btn btn--primary" onClick={onNavigateToBudgets}>
                          Set up budgets
                        </button>
                      )}
                      {safePresentation.showBudgetLink && (
                        <button type="button" className="btn" onClick={onNavigateToBudgets}>
                          View budgets
                        </button>
                      )}
                    </div>
                  )}
              </footer>
            </section>
          )}

          <div className="dashboard-charts-grid">
            {hasMonthActivity ? (
              <section
                className="dashboard-block dashboard-chart-card dashboard-chart-card--spending"
                aria-labelledby="dashboard-spending-title"
              >
                <header className="section-head section-head--in-panel">
                  <h2 id="dashboard-spending-title" className="section-head__title">
                    Spending by category
                  </h2>
                  <p className="section-head__sub">{selectedMonthLabel} expenses</p>
                </header>
                <CategoryDonutChart
                  segments={monthCategorySegments}
                  totalExpensePaise={monthExpensePaise}
                  customCategories={categoryState.categories}
                  emptyMessage={`No expenses in ${selectedMonthLabel}. Category breakdown appears when you record spending for this month.`}
                />
              </section>
            ) : null}

            <section
              className={`dashboard-block dashboard-chart-card dashboard-chart-card--cashflow${
                hasMonthActivity ? '' : ' dashboard-chart-card--wide'
              }`}
              aria-labelledby="dashboard-cashflow-title"
            >
              <header className="section-head section-head--in-panel">
                <h2 id="dashboard-cashflow-title" className="section-head__title">
                  Monthly cash flow
                </h2>
                <p className="section-head__sub">
                  Income vs expenses · four months ending {selectedMonthLabel}
                </p>
              </header>
              {cashFlow.ok && cashFlow.rows.length > 0 ? (
                <CashFlowBarChart rows={cashFlow.rows} maxPaise={cashFlow.maxPaise} />
              ) : (
                <p className="dashboard-empty-inline">Not enough data to chart cash flow yet.</p>
              )}
            </section>
          </div>

          <section className="dashboard-block dashboard-savings" aria-labelledby="dashboard-savings-title">
            <header className="section-head section-head--in-panel">
              <h2 id="dashboard-savings-title" className="section-head__title">
                Savings goals
              </h2>
              <p className="section-head__sub">
                {savingsGoals.length > 0
                  ? `Tracked separately from transactions · ${formatInrFromPaise(savingsSummary.ok ? savingsSummary.totalSavedPaise : 0)} saved`
                  : 'Create a goal to track deposits and progress here.'}
              </p>
            </header>
            {savingsGoals.length === 0 ? (
              <p className="dashboard-empty-inline">
                No savings goals yet. Add one in Savings Goals to see progress on your dashboard.
              </p>
            ) : (
              <ul className="dashboard-savings-list">
                {savingsGoals.slice(0, 3).map((goal) => {
                  const saved = goalSavedBalancePaise(goal.entries) ?? 0
                  return (
                    <li key={goal.id} className="dashboard-savings-item">
                      <SavingsGoalProgressRing
                        savedPaise={saved}
                        targetPaise={goal.targetPaise}
                        goalName={goal.name}
                      />
                      <div className="dashboard-savings-details">
                        <p className="dashboard-savings-name">{goal.name}</p>
                        <p className="dashboard-savings-amount">
                          <span className="dashboard-savings-amount-saved">
                            {formatInrFromPaise(saved)}
                          </span>
                          <span className="dashboard-savings-amount-sep" aria-hidden="true">
                            {' / '}
                          </span>
                          <span className="dashboard-savings-amount-target">
                            {formatInrFromPaise(goal.targetPaise)}
                          </span>
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {typeof onNavigateToSavings === 'function' && (
              <footer className="dashboard-sts-foot">
                <button type="button" className="btn btn--primary" onClick={onNavigateToSavings}>
                  {savingsGoals.length > 0 ? 'View savings goals' : 'Set up savings goals'}
                </button>
              </footer>
            )}
          </section>

          {hasMonthActivity && insight ? (
            <aside
              className={`dashboard-insight${
                insight.title === 'Budget watch' ? ' dashboard-insight--budget-watch' : ''
              }`}
              aria-labelledby="dashboard-insight-title"
            >
              <p id="dashboard-insight-title" className="dashboard-insight-title">
                {insight.title}
              </p>
              <p className="dashboard-insight-body">{insight.body}</p>
            </aside>
          ) : null}

          {hasMonthActivity ? (
          <section className="dashboard-block dashboard-block--recent" aria-labelledby="dashboard-recent-expenses">
            <header className="section-head section-head--in-panel">
              <h2 id="dashboard-recent-expenses" className="section-head__title">
                Recent activity
              </h2>
              <p className="section-head__sub">Latest expenses in {selectedMonthLabel}</p>
            </header>
            {recentExpenseRows.length === 0 ? (
              <p className="dashboard-empty-inline">
                No expenses in {selectedMonthLabel}. Up to five expense entries from this month appear here.
              </p>
            ) : (
              <ul className="dashboard-activity-list">
                {recentExpenseRows.map((transaction) => {
                  const label = categoryLabel(transaction.categoryId, categoryState.categories)
                  const title = transaction.description?.trim() || label
                  return (
                    <li key={transaction.id} className="dashboard-activity-item">
                      <span className="dashboard-activity-icon" aria-hidden="true">
                        <CategoryExpenseIcon
                          categoryId={transaction.categoryId}
                          customCategories={categoryState.categories}
                        />
                      </span>
                      <div className="dashboard-activity-main">
                        <span className="dashboard-activity-title">{title}</span>
                        <span className="dashboard-activity-meta">
                          <time dateTime={transaction.date}>{transaction.date}</time>
                          <span className="dashboard-activity-meta-sep" aria-hidden="true">
                            ·
                          </span>
                          <span className="dashboard-activity-category">{label}</span>
                        </span>
                      </div>
                      <span className="dashboard-activity-amount amount amount--expense">
                        {formatInrFromPaise(transaction.amountPaise)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          ) : null}
        </div>
      )}
    </section>
  )
}

export default DashboardSection
