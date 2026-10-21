import { useState } from 'react'
import { readBudgets } from '../data/budgetStore.js'
import { readCategories } from '../data/categoryStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { categoryLabel, PREDEFINED_CATEGORIES } from '../transactions/categories.js'
import { formatInrFromPaise } from '../transactions/money.js'
import PageHeader from '../ui/PageHeader.jsx'
import { PAGE_TAGLINES } from '../ui/pageHeaderCopy.js'
import { CategoryExpenseIcon, DashboardMetricIcon } from '../ui/shellIcons.jsx'
import { safeToSpendForMonth } from './safeToSpend.js'
import { summarizeTransactions } from './summarize.js'
import './finance.css'

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

function recentExpenses(transactions, limit = 5) {
  if (!Array.isArray(transactions)) return []
  return transactions
    .filter((transaction) => transaction.type === 'expense')
    .sort(compareExpensesByDate)
    .slice(0, limit)
}

function compareBarWidth(paise, otherPaise) {
  const max = Math.max(paise, otherPaise, 1)
  return Math.max(4, Math.round((paise / max) * 100))
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

function categoryShareOfExpenses(amountPaise, totalExpensePaise) {
  if (totalExpensePaise <= 0) return 0
  return Math.round((amountPaise / totalExpensePaise) * 100)
}

function hasBuiltInCategoryIcon(categoryId) {
  return PREDEFINED_CATEGORIES.some((category) => category.id === categoryId)
}

function buildDashboardInsight(summary, customCategories) {
  if (!summary?.ok) return null

  const { monthExpensePaise, monthIncomePaise, month, expensePaise, categories } = summary
  const monthNet = monthIncomePaise - monthExpensePaise

  if (monthExpensePaise > 0 || monthIncomePaise > 0) {
    if (monthExpensePaise > 0 && monthIncomePaise === 0) {
      return {
        title: 'This month so far',
        body: `You have ${formatInrFromPaise(monthExpensePaise)} in expenses in ${monthLabel(month)} and no income recorded for this month yet.`,
      }
    }
    if (monthNet < 0) {
      return {
        title: 'This month so far',
        body: `In ${monthLabel(month)}, spending is ahead of income by ${formatInrFromPaise(-monthNet)} based on saved transactions.`,
      }
    }
    if (monthExpensePaise > 0 && monthNet >= 0) {
      return {
        title: 'This month so far',
        body: `In ${monthLabel(month)}, income covers expenses with ${formatInrFromPaise(monthNet)} remaining after spending.`,
      }
    }
    if (monthIncomePaise > 0 && monthExpensePaise === 0) {
      return {
        title: 'This month so far',
        body: `You have ${formatInrFromPaise(monthIncomePaise)} in income in ${monthLabel(month)} and no expenses recorded this month yet.`,
      }
    }
  }

  if (expensePaise <= 0) return null
  const top = categories[0]
  if (!top) return null
  const share = categoryShareOfExpenses(top.amountPaise, expensePaise)
  if (share < 1) return null
  const label = categoryLabel(top.categoryId, customCategories)
  return {
    title: 'Where spending adds up',
    body: `${label} is your largest expense category so far, at ${share}% of tracked spending (${formatInrFromPaise(top.amountPaise)}).`,
  }
}

function DashboardSection({ onNavigateToBudgets }) {
  const [storageState, setStorageState] = useState(readStorageState)
  const [categoryState, setCategoryState] = useState(() => {
    const result = readCategories()
    if (result.ok) return { categories: result.categories, error: null }
    return { categories: [], error: result }
  })
  const [viewedAt] = useState(() => new Date())
  const records = storageState.records
  const loadError = storageState.loadError
  const summary = records === null ? null : summarizeTransactions(records, viewedAt)
  const recentExpenseRows = records === null ? [] : recentExpenses(records)
  const hasTransactions = records !== null && records.length > 0

  function retry() {
    const result = readTransactions()
    setStorageState((current) =>
      result.ok
        ? { records: result.transactions, loadError: null }
        : { records: current.records, loadError: result },
    )
  }

  const netTone =
    summary?.ok && summary.netPaise < 0
      ? 'metric-card--negative'
      : summary?.ok && summary.netPaise > 0
        ? 'metric-card--positive'
        : ''

  const topCategoryPaise = summary?.ok ? (summary.categories[0]?.amountPaise ?? 0) : 0
  const totalCategoryExpense = summary?.ok ? summary.expensePaise : 0
  const insight = summary?.ok ? buildDashboardInsight(summary, categoryState.categories) : null
  const incomeBarWidth =
    summary?.ok ? compareBarWidth(summary.incomePaise, summary.expensePaise) : 0
  const expenseBarWidth =
    summary?.ok ? compareBarWidth(summary.expensePaise, summary.incomePaise) : 0

  let safeToSpend = null
  if (records !== null && summary?.ok) {
    const budgetRead = readBudgets(undefined, { customCategories: categoryState.categories })
    safeToSpend = budgetRead.ok
      ? safeToSpendForMonth(
          records,
          budgetRead.budgets,
          summary.month,
          categoryState.categories,
          viewedAt,
        )
      : { ok: false, error: 'budgets_unreadable' }
  }

  const safePresentation =
    safeToSpend?.ok && summary?.ok ? safeToSpendPresentation(safeToSpend) : null

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
      <PageHeader
        icon="dashboard"
        variant="hero"
        title="Dashboard"
        tagline={PAGE_TAGLINES.dashboard}
        description="Balance, spending patterns, and recent activity from your saved transactions."
      />

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

      {summary && !summary.ok && (
        <div className="form-alert" role="alert">
          <p>These totals cannot be calculated from the saved transactions.</p>
        </div>
      )}

      {summary?.ok && !hasTransactions && (
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

      {summary?.ok && hasTransactions && safePresentation && safeToSpend?.ok && (
        <section
          className={`dashboard-safe-to-spend dashboard-block dashboard-safe-to-spend--${safePresentation.cardTone}`}
          aria-labelledby="dashboard-safe-to-spend-title"
          aria-describedby="dashboard-safe-to-spend-desc"
        >
          <p id="dashboard-safe-to-spend-desc" className="visually-hidden">
            Estimate from saved transactions and budgets in ExpenseSnap. This is not your bank or
            wallet balance.
          </p>

          <div className="dashboard-sts-head">
            <div className="dashboard-sts-head-lead">
              <span className="dashboard-sts-icon" aria-hidden="true">
                <DashboardMetricIcon name="wallet" />
              </span>
              <div className="dashboard-sts-head-copy">
                <p className="dashboard-sts-eyebrow">{monthLabel(summary.month)}</p>
                <h2 id="dashboard-safe-to-spend-title" className="dashboard-sts-title">
                  {safePresentation.headlineLabel}
                </h2>
              </div>
            </div>
            {safeToSpend.dayOfMonth != null && safeToSpend.daysInMonth != null && (
              <p className="dashboard-sts-period" aria-label={`Day ${safeToSpend.dayOfMonth} of ${safeToSpend.daysInMonth}`}>
                <span className="dashboard-sts-period-day">
                  {safeToSpend.dayOfMonth}/{safeToSpend.daysInMonth}
                </span>
                <span className="dashboard-sts-period-label">days</span>
              </p>
            )}
          </div>

          <div className="dashboard-sts-hero">
            {safePresentation.value !== null ? (
              <p
                className={`dashboard-sts-amount amount${
                  safePresentation.valueTone === 'expense' ? ' amount--expense' : ' amount--balance'
                }`}
              >
                {safePresentation.valueTone === 'expense' && safePresentation.value < 0
                  ? `−${formatInrFromPaise(-safePresentation.value)}`
                  : formatInrFromPaise(safePresentation.value)}
              </p>
            ) : (
              <p className="dashboard-sts-amount dashboard-sts-amount--empty">—</p>
            )}
            <span
              className={`dashboard-sts-status dashboard-sts-status--${safePresentation.statusTone}`}
              role="status"
            >
              {safePresentation.statusLabel}
            </span>
          </div>

          {safePresentation.showBudgetProgress && safeToSpend.budgetLimitPaise > 0 && (
            <div className="dashboard-sts-budget">
              <div className="dashboard-sts-budget-labels">
                <span>
                  Spent{' '}
                  <strong className="amount amount--expense">
                    {formatInrFromPaise(safeToSpend.budgetSpentPaise)}
                  </strong>
                </span>
                <span>
                  Budget{' '}
                  <strong>{formatInrFromPaise(safeToSpend.budgetLimitPaise)}</strong>
                </span>
              </div>
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
            </div>
          )}

          {(safePresentation.showIncomeMetric ||
            safePresentation.showUnbudgetedMetric ||
            safePresentation.showExpenseMetric) && (
            <dl className="dashboard-sts-metrics">
              {safePresentation.showIncomeMetric && (
                <div>
                  <dt>Income</dt>
                  <dd className="amount amount--income">
                    {formatInrFromPaise(safeToSpend.monthIncomePaise)}
                  </dd>
                </div>
              )}
              {safePresentation.showExpenseMetric && (
                <div>
                  <dt>Expenses</dt>
                  <dd className="amount amount--expense">
                    {formatInrFromPaise(safeToSpend.monthExpensePaise)}
                  </dd>
                </div>
              )}
              {safePresentation.showUnbudgetedMetric && (
                <div>
                  <dt>Unbudgeted</dt>
                  <dd>{formatInrFromPaise(safeToSpend.unbudgetedExpensePaise)}</dd>
                </div>
              )}
            </dl>
          )}

          <footer className="dashboard-sts-foot">
            <p className="dashboard-sts-footnote">{SAFE_TO_SPEND_FOOTNOTE}</p>
            {typeof onNavigateToBudgets === 'function' &&
              (safePresentation.showBudgetCta || safePresentation.showBudgetLink) && (
                <div className="dashboard-sts-actions">
                  {safePresentation.showBudgetCta && (
                    <button type="button" className="btn btn--primary" onClick={onNavigateToBudgets}>
                      Set up budgets
                    </button>
                  )}
                  {safePresentation.showBudgetLink && !safePresentation.showBudgetCta && (
                    <button type="button" className="btn btn--primary" onClick={onNavigateToBudgets}>
                      View budgets
                    </button>
                  )}
                  {safePresentation.showBudgetLink && safePresentation.showBudgetCta && (
                    <button type="button" className="btn" onClick={onNavigateToBudgets}>
                      View budgets
                    </button>
                  )}
                </div>
              )}
          </footer>
        </section>
      )}

      {summary?.ok && hasTransactions && (
        <div className="dashboard-stack">
          <section className="dashboard-snapshot dashboard-block" aria-labelledby="dashboard-snapshot-title">
            <header className="section-head section-head--in-panel">
              <h2 id="dashboard-snapshot-title" className="section-head__title">
                Your financial picture
              </h2>
              <p className="section-head__sub">All saved transactions · updated when you add or edit entries</p>
            </header>

            <div className="dashboard-snapshot-grid">
              <article
                className={`dashboard-balance-anchor ${netTone}`.trim()}
                aria-labelledby="dashboard-balance-label"
              >
                <p id="dashboard-balance-label" className="dashboard-balance-label">
                  Net balance
                </p>
                <p className="dashboard-balance-value amount--balance">
                  {formatInrFromPaise(summary.netPaise)}
                </p>
                <p className="dashboard-balance-detail">
                  {summary.netPaise > 0
                    ? 'You are ahead overall—income exceeds expenses.'
                    : summary.netPaise < 0
                      ? 'Expenses exceed income across all saved entries.'
                      : 'Income and expenses are even across all saved entries.'}
                </p>
              </article>

              <div
                className="dashboard-compare"
                role="group"
                aria-label="Income compared with expenses, all time"
              >
                <div className="dashboard-compare-row">
                  <div className="dashboard-compare-label">
                    <span className="dashboard-compare-name">Income</span>
                    <span className="dashboard-compare-amount amount--income">
                      {formatInrFromPaise(summary.incomePaise)}
                    </span>
                  </div>
                  <div className="dashboard-compare-track">
                    <div
                      className="dashboard-compare-fill dashboard-compare-fill--income"
                      style={{ width: `${incomeBarWidth}%` }}
                    />
                  </div>
                </div>
                <div className="dashboard-compare-row">
                  <div className="dashboard-compare-label">
                    <span className="dashboard-compare-name">Expenses</span>
                    <span className="dashboard-compare-amount amount--expense">
                      {formatInrFromPaise(summary.expensePaise)}
                    </span>
                  </div>
                  <div className="dashboard-compare-track">
                    <div
                      className="dashboard-compare-fill dashboard-compare-fill--expense"
                      style={{ width: `${expenseBarWidth}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-month-compact" aria-label={`Current month: ${monthLabel(summary.month)}`}>
              <span className="dashboard-month-compact-title">{monthLabel(summary.month)}</span>
              <span className="dashboard-month-compact-stat">
                <span className="dashboard-month-compact-key">Income</span>
                <span className="dashboard-month-compact-val amount--income">
                  {formatInrFromPaise(summary.monthIncomePaise)}
                </span>
              </span>
              <span className="dashboard-month-compact-stat">
                <span className="dashboard-month-compact-key">Expenses</span>
                <span className="dashboard-month-compact-val amount--expense">
                  {formatInrFromPaise(summary.monthExpensePaise)}
                </span>
              </span>
            </div>
          </section>

          <section
            className="dashboard-block dashboard-block--spending"
            aria-labelledby="dashboard-spending-title"
          >
            <header className="section-head section-head--in-panel">
              <h2 id="dashboard-spending-title" className="section-head__title">
                Where your money goes
              </h2>
              <p className="section-head__sub">Expense categories by share of total spending</p>
            </header>
            {summary.categories.length === 0 ? (
              <p className="dashboard-empty-inline">
                No expenses recorded yet. Add an expense transaction to see category breakdown here.
              </p>
            ) : (
              <ul className="dashboard-category-list">
                {summary.categories.map((category) => {
                  const shareWidth =
                    topCategoryPaise > 0
                      ? Math.max(4, Math.round((category.amountPaise / topCategoryPaise) * 100))
                      : 0
                  const shareTotal = categoryShareOfExpenses(category.amountPaise, totalCategoryExpense)
                  const label = categoryLabel(category.categoryId, categoryState.categories)
                  const showIcon = hasBuiltInCategoryIcon(category.categoryId)
                  return (
                    <li key={category.categoryId} className="dashboard-category-item">
                      <div className="dashboard-category-row-head">
                        <span className="dashboard-category-name-wrap">
                          {showIcon ? (
                            <span className="dashboard-category-icon" aria-hidden="true">
                              <CategoryExpenseIcon categoryId={category.categoryId} />
                            </span>
                          ) : null}
                          <span className="dashboard-category-name">{label}</span>
                          <span className="dashboard-category-share">{shareTotal}%</span>
                        </span>
                        <span className="dashboard-category-amount amount amount--expense">
                          {formatInrFromPaise(category.amountPaise)}
                        </span>
                      </div>
                      <div
                        className="dashboard-category-track"
                        role="img"
                        aria-label={`${label}: ${formatInrFromPaise(category.amountPaise)}, ${shareTotal} percent of expenses`}
                      >
                        <div
                          className="dashboard-category-fill"
                          style={{ width: `${shareWidth}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {insight && (
            <aside className="dashboard-insight" aria-labelledby="dashboard-insight-title">
              <p id="dashboard-insight-title" className="dashboard-insight-title">
                {insight.title}
              </p>
              <p className="dashboard-insight-body">{insight.body}</p>
            </aside>
          )}

          <section className="dashboard-block dashboard-block--recent" aria-labelledby="dashboard-recent-expenses">
            <header className="section-head section-head--in-panel">
              <h2 id="dashboard-recent-expenses" className="section-head__title">
                Recent activity
              </h2>
              <p className="section-head__sub">Latest expense transactions</p>
            </header>
            {recentExpenseRows.length === 0 ? (
              <p className="dashboard-empty-inline">
                No expenses yet. Your five most recent expense entries will appear here.
              </p>
            ) : (
              <ul className="dashboard-activity-list">
                {recentExpenseRows.map((transaction) => {
                  const label = categoryLabel(transaction.categoryId, categoryState.categories)
                  const title = transaction.description?.trim() || label
                  return (
                    <li key={transaction.id} className="dashboard-activity-item">
                      <div className="dashboard-activity-main">
                        <span className="dashboard-activity-title">{title}</span>
                        <span className="dashboard-activity-meta">
                          {transaction.date}
                          {' · '}
                          {label}
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
        </div>
      )}
    </section>
  )
}

export default DashboardSection
