import { useState } from 'react'
import { readBudgets } from '../data/budgetStore.js'
import { readCategories } from '../data/categoryStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { categoryLabel, PREDEFINED_CATEGORIES } from '../transactions/categories.js'
import { formatInrFromPaise } from '../transactions/money.js'
import {
  buildAnalyticsInsights,
  buildSavingSuggestions,
  defaultAnalyticsMonth,
  listTransactionMonths,
  monthlyExpenseSeries,
  summarizeForMonth,
} from './analyze.js'
import PageHeader from '../ui/PageHeader.jsx'
import { PAGE_TAGLINES } from '../ui/pageHeaderCopy.js'
import { CategoryExpenseIcon } from '../ui/shellIcons.jsx'
import { budgetStatusForMonth, buildBudgetInsights } from './budgetStatus.js'
import './finance.css'

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
]

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

function chartMonthLabel(month, monthKeys) {
  const [year, monthNumber] = month.split('-').map(Number)
  const monthOnly = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(
    new Date(year, monthNumber - 1, 1),
  )
  const years = new Set(monthKeys.map((key) => key.slice(0, 4)))
  if (years.size === 1) return monthOnly
  return `${monthOnly} ${String(year).slice(-2)}`
}

function hasBuiltInCategoryIcon(categoryId) {
  return PREDEFINED_CATEGORIES.some((category) => category.id === categoryId)
}

function compareBarWidth(paise, otherPaise) {
  const max = Math.max(paise, otherPaise, 1)
  return Math.max(4, Math.round((paise / max) * 100))
}

function CategoryExpenseChart({ categories, customCategories, chartId, monthKey }) {
  if (categories.length === 0) {
    return (
      <div className="analytics-empty analytics-empty--inline">
        <p className="analytics-empty-title">No expenses this month</p>
        <p className="analytics-empty-body">
          There are no expense transactions in {monthLabel(monthKey)} to compare by category. Try
          another month or add expenses from Transactions.
        </p>
      </div>
    )
  }

  const total = categories.reduce((sum, item) => sum + item.amountPaise, 0)
  const max = categories[0]?.amountPaise ?? 1

  return (
    <div className="analytics-chart-block">
      <p className="analytics-chart-lead">
        Each bar shows how much of {monthLabel(monthKey)} spending went to that category.
        Amounts and percentages are listed beside every bar and in the table below.
      </p>
      <figure className="category-chart" aria-labelledby={`${chartId}-title`}>
        <figcaption id={`${chartId}-title`} className="visually-hidden">
          Expense distribution by category for {monthLabel(monthKey)}
        </figcaption>
        <ul className="category-bars">
          {categories.map((category, index) => {
            const label = categoryLabel(category.categoryId, customCategories)
            const width = `${Math.max(4, Math.round((category.amountPaise / max) * 100))}%`
            const share =
              total > 0 ? ((category.amountPaise / total) * 100).toFixed(1) : null
            const showIcon = hasBuiltInCategoryIcon(category.categoryId)
            return (
              <li key={category.categoryId}>
                <span className="category-bar-label">
                  {showIcon ? (
                    <span className="category-bar-icon" aria-hidden="true">
                      <CategoryExpenseIcon categoryId={category.categoryId} />
                    </span>
                  ) : null}
                  <span className="category-bar-label-text">
                    {label}
                    {share !== null ? (
                      <span className="category-bar-share-inline"> · {share}%</span>
                    ) : null}
                  </span>
                </span>
                <div
                  className="category-bar-track"
                  role="img"
                  aria-label={`${label}: ${formatInrFromPaise(category.amountPaise)}${
                    share !== null ? `, ${share} percent of month expenses` : ''
                  }`}
                >
                  <div
                    className="category-bar-fill"
                    style={{
                      width,
                      background:
                        index === 0 ? 'var(--chart-2)' : CHART_COLORS[index % CHART_COLORS.length],
                    }}
                  />
                </div>
                <span className="category-bar-meta">
                  <span className="category-bar-value amount amount--expense">
                    {formatInrFromPaise(category.amountPaise)}
                  </span>
                  {share !== null && <span className="category-bar-share">{share}%</span>}
                </span>
              </li>
            )
          })}
        </ul>
      </figure>
      <table className="analytics-data-table">
        <caption>Category amounts for {monthLabel(monthKey)}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" className="col-amount">
              Amount
            </th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const label = categoryLabel(category.categoryId, customCategories)
            const share = total > 0 ? ((category.amountPaise / total) * 100).toFixed(1) : '0.0'
            return (
              <tr key={category.categoryId}>
                <td>{label}</td>
                <td className="amount amount--expense col-amount">
                  {formatInrFromPaise(category.amountPaise)}
                </td>
                <td>{share}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MonthlyExpenseChart({ months, chartId, highlightMonth }) {
  if (months.length === 0) {
    return (
      <div className="analytics-empty analytics-empty--inline">
        <p className="analytics-empty-title">Not enough expense history</p>
        <p className="analytics-empty-body">
          Monthly trends need at least one expense transaction. When you have expenses across more
          than one month, bars will compare totals side by side.
        </p>
      </div>
    )
  }

  if (months.length === 1) {
    const only = months[0]
    return (
      <div className="analytics-chart-block">
        <p className="analytics-chart-lead">
          You only have expenses recorded in one month so far. Add transactions in another month to
          see how spending changes over time.
        </p>
        <p className="analytics-single-month-stat">
          <span className="analytics-single-month-label">{monthLabel(only.month)}</span>
          <span className="analytics-single-month-value amount amount--expense">
            {formatInrFromPaise(only.expensePaise)} in expenses
          </span>
        </p>
        <table className="analytics-data-table">
          <caption>Monthly expense total</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col" className="col-amount">
                Expenses
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{monthLabel(only.month)}</td>
              <td className="amount amount--expense col-amount">
                {formatInrFromPaise(only.expensePaise)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  const max = Math.max(...months.map((item) => item.expensePaise))
  const barGap = 8
  const barWidth = 28
  const minSlotWidth = 56
  const slotWidth = Math.max(barWidth + barGap, minSlotWidth)
  const chartHeight = 160
  const valueBand = 22
  const labelBand = 40
  const plotBottom = valueBand + chartHeight
  const chartWidth = barGap + months.length * slotWidth
  const monthKeys = months.map((item) => item.month)

  return (
    <div className="analytics-chart-block">
      <p className="analytics-chart-lead">
        Taller bars mean higher total expenses that month. The highlighted bar matches the month you
        selected above; other bars use a neutral tone. Amounts on the bars show when there is room.
      </p>
      {highlightMonth && (
        <p className="analytics-chart-legend">
          <span className="analytics-chart-legend-swatch analytics-chart-legend-swatch--selected" />
          Selected month ({monthLabel(highlightMonth)})
          <span className="analytics-chart-legend-swatch analytics-chart-legend-swatch--other" />
          Other months
        </p>
      )}
      <div className="monthly-chart-scroll">
        <figure aria-labelledby={`${chartId}-monthly-title`}>
          <figcaption id={`${chartId}-monthly-title`} className="visually-hidden">
            Monthly expense totals
          </figcaption>
          <svg
            className="monthly-chart"
            role="img"
            viewBox={`0 0 ${chartWidth} ${plotBottom + labelBand}`}
            width={chartWidth}
            height={plotBottom + labelBand}
            aria-describedby={`${chartId}-monthly-summary`}
          >
            <title>Monthly expense comparison</title>
            <line
              x1={0}
              y1={plotBottom}
              x2={chartWidth}
              y2={plotBottom}
              className="monthly-chart-axis"
            />
            {months.map((item, index) => {
              const barHeight = max > 0 ? Math.round((item.expensePaise / max) * chartHeight) : 0
              const slotX = barGap + index * slotWidth
              const x = slotX + (slotWidth - barWidth) / 2
              const labelX = slotX + slotWidth / 2
              const y = plotBottom - barHeight
              const showAmount = barHeight >= 28 && item.expensePaise > 0 && slotWidth >= 52
              const isSelected = highlightMonth && item.month === highlightMonth
              return (
                <g
                  key={item.month}
                  role="img"
                  aria-label={`${monthLabel(item.month)}: ${formatInrFromPaise(item.expensePaise)} in expenses${
                    isSelected ? ', selected month' : ''
                  }`}
                >
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx="4"
                    fill={isSelected ? 'var(--chart-2)' : 'var(--chart-8)'}
                    className={`monthly-chart-bar${
                      isSelected ? ' monthly-chart-bar--selected' : ''
                    }`}
                  />
                  {showAmount && (
                    <text
                      x={x + barWidth / 2}
                      y={y - 6}
                      textAnchor="middle"
                      className="monthly-chart-amount"
                    >
                      {formatInrFromPaise(item.expensePaise)}
                    </text>
                  )}
                  <text
                    x={labelX}
                    y={plotBottom + 16}
                    textAnchor="middle"
                    className={`monthly-chart-label${
                      isSelected ? ' monthly-chart-label--selected' : ''
                    }`}
                  >
                    {chartMonthLabel(item.month, monthKeys)}
                  </text>
                </g>
              )
            })}
          </svg>
        </figure>
      </div>
      <ul id={`${chartId}-monthly-summary`} className="analytics-monthly-sr-summary">
        {months.map((item) => {
          const isSelected = highlightMonth && item.month === highlightMonth
          return (
            <li key={item.month}>
              {monthLabel(item.month)}: {formatInrFromPaise(item.expensePaise)} in expenses
              {isSelected ? ' (selected month)' : ''}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function formatInsight(insight, customCategories, monthKey) {
  if (insight.id === 'top-category') {
    const label = categoryLabel(insight.categoryId, customCategories)
    return `${label} was your highest spending category in ${monthLabel(monthKey)} at ${formatInrFromPaise(insight.amountPaise)}.`
  }
  if (insight.id === 'expense-vs-previous') {
    const previous = monthLabel(insight.previousMonth)
    const current = monthLabel(monthKey)
    const amount = formatInrFromPaise(Math.abs(insight.diffPaise))
    const percentPart =
      typeof insight.percentChange === 'number'
        ? ` (${insight.percentChange > 0 ? '+' : ''}${insight.percentChange}%)`
        : ''
    if (insight.diffPaise > 0) {
      return `Expenses in ${current} were ${amount} higher than ${previous}${percentPart}.`
    }
    return `Expenses in ${current} were ${amount} lower than ${previous}${percentPart}.`
  }
  if (insight.id.startsWith('category-mom-up:')) {
    const label = categoryLabel(insight.categoryId, customCategories)
    const previous = monthLabel(insight.previousMonth)
    return `${label} spending rose by ${formatInrFromPaise(insight.deltaPaise)} compared with ${previous}.`
  }
  if (insight.id.startsWith('budget-exceeded:')) {
    const label = categoryLabel(insight.categoryId, customCategories)
    return `${label} is over its ${monthLabel(monthKey)} budget by ${formatInrFromPaise(insight.overPaise)}.`
  }
  if (insight.id.startsWith('budget-approaching:')) {
    const label = categoryLabel(insight.categoryId, customCategories)
    if (insight.atLimit) {
      return `${label} is at its ${monthLabel(monthKey)} budget limit.`
    }
    return `${label} has used ${insight.percentUsed}% of its ${monthLabel(monthKey)} budget (${formatInrFromPaise(insight.remainingPaise)} remaining).`
  }
  if (insight.id.startsWith('suggestion-budget-exceeded:')) {
    const label = categoryLabel(insight.categoryId, customCategories)
    return `Slow ${label} spending to move back under your ${monthLabel(monthKey)} budget (currently over by ${formatInrFromPaise(insight.overPaise)}).`
  }
  if (insight.id.startsWith('suggestion-budget-approaching:')) {
    const label = categoryLabel(insight.categoryId, customCategories)
    if (insight.atLimit) {
      return `${label} is at its budget limit for ${monthLabel(monthKey)}; new spending will exceed the budget.`
    }
    return `Watch ${label} spending in ${monthLabel(monthKey)} (${insight.percentUsed}% of budget used, ${formatInrFromPaise(insight.remainingPaise)} left).`
  }
  if (insight.id.startsWith('suggestion-mom-up:')) {
    const label = categoryLabel(insight.categoryId, customCategories)
    return `${label} spending increased ${formatInrFromPaise(insight.deltaPaise)} versus last month; review recent ${label.toLowerCase()} expenses.`
  }
  if (insight.id === 'month-net') {
    if (insight.netPaise >= 0) {
      return `Income exceeded expenses by ${formatInrFromPaise(insight.netPaise)} in ${monthLabel(monthKey)}.`
    }
    return `Expenses exceeded income by ${formatInrFromPaise(-insight.netPaise)} in ${monthLabel(monthKey)}.`
  }
  return ''
}

function AnalyticsSection() {
  const [storageState, setStorageState] = useState(readStorageState)
  const [categoryState, setCategoryState] = useState(() => {
    const result = readCategories()
    if (result.ok) return { categories: result.categories, error: null }
    return { categories: [], error: result }
  })
  const records = storageState.records
  const loadError = storageState.loadError
  const [selectedMonth, setSelectedMonth] = useState(() =>
    defaultAnalyticsMonth(records ?? []),
  )

  const monthOptions = records === null ? [] : listTransactionMonths(records)
  const activeMonth =
    monthOptions.includes(selectedMonth) ? selectedMonth : defaultAnalyticsMonth(records ?? [])
  const monthSummary = records === null ? null : summarizeForMonth(records, activeMonth)
  const expenseSeries = records === null ? null : monthlyExpenseSeries(records)
  const transactionInsights =
    records === null || !monthSummary?.ok ? [] : buildAnalyticsInsights(records, activeMonth)
  let smartInsights = transactionInsights
  if (
    !categoryState.error &&
    records !== null &&
    monthSummary?.ok &&
    records.length > 0
  ) {
    const budgetRead = readBudgets(undefined, { customCategories: categoryState.categories })
    if (budgetRead.ok) {
      const budgetStatus = budgetStatusForMonth(
        budgetRead.budgets,
        records,
        activeMonth,
        categoryState.categories,
      )
      if (budgetStatus.ok) {
        const budgetInsights = buildBudgetInsights(budgetStatus)
        const savingSuggestions = buildSavingSuggestions(budgetStatus, transactionInsights)
        smartInsights = [...transactionInsights, ...budgetInsights, ...savingSuggestions]
      }
    }
  }

  const insightLines = smartInsights
    .map((insight) => ({
      id: insight.id,
      text: formatInsight(insight, categoryState.categories, activeMonth),
    }))
    .filter((item) => item.text)

  function retry() {
    const result = readTransactions()
    setStorageState((current) =>
      result.ok
        ? { records: result.transactions, loadError: null }
        : { records: current.records, loadError: result },
    )
  }

  const netTone =
    monthSummary?.ok && monthSummary.netPaise < 0
      ? 'metric-card--negative'
      : monthSummary?.ok && monthSummary.netPaise > 0
        ? 'metric-card--positive'
        : ''

  const incomeBarWidth =
    monthSummary?.ok ? compareBarWidth(monthSummary.incomePaise, monthSummary.expensePaise) : 0
  const expenseBarWidth =
    monthSummary?.ok ? compareBarWidth(monthSummary.expensePaise, monthSummary.incomePaise) : 0

  return (
    <section className="finance analytics" aria-labelledby="section-title">
      <PageHeader
        icon="analytics"
        variant="hero"
        title="Analytics"
        tagline={PAGE_TAGLINES.analytics}
        description="Patterns from your saved transactions. Pick a month to explore—limits and edits live on Budgets."
      >
        {records !== null && !loadError && (
          <div className="page-banner__toolbar">
            <label className="page-banner__field" htmlFor="analytics-month">
              Viewing month
              <select
                id="analytics-month"
                value={activeMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                disabled={monthOptions.length === 0}
              >
                {monthOptions.length === 0 ? (
                  <option value={activeMonth}>{monthLabel(activeMonth)}</option>
                ) : (
                  monthOptions.map((month) => (
                    <option key={month} value={month}>
                      {monthLabel(month)}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        )}
      </PageHeader>

      <p className="analytics-budgets-note" role="note">
        To set or change monthly category limits, open <strong>Budgets</strong> in the menu.
      </p>

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

      {records !== null && !loadError && (
        <>
          {records.length === 0 && (
            <div className="analytics-empty analytics-empty--page">
              <h2 className="analytics-empty-title">No data to analyze yet</h2>
              <p className="analytics-empty-body">
                Add income and expense transactions first. Analytics will summarize spending by
                category, compare months, and surface insights when there is enough history.
              </p>
            </div>
          )}

          {monthSummary && !monthSummary.ok && (
            <div className="form-alert" role="alert">
              <p>Analytics cannot be calculated from the saved transactions.</p>
            </div>
          )}

          {monthSummary?.ok && records.length > 0 && (
            <div className="analytics-stack">
              <section
                className="dashboard-block analytics-summary-panel"
                aria-labelledby="analytics-month-summary"
              >
                <header className="section-head section-head--in-panel">
                  <h2 id="analytics-month-summary" className="section-head__title">
                    {monthLabel(activeMonth)} at a glance
                  </h2>
                  <p className="section-head__sub">
                    Net cash flow and how income compares to spending this month
                  </p>
                </header>
                <div className="analytics-snapshot-grid">
                  <article
                    className={`analytics-net-card ${netTone}`.trim()}
                    aria-labelledby="analytics-net-label"
                  >
                    <p id="analytics-net-label" className="analytics-net-label">
                      Net cash flow
                    </p>
                    <p className="analytics-net-value amount--balance">
                      {formatInrFromPaise(monthSummary.netPaise)}
                    </p>
                    <p className="analytics-net-detail">
                      {monthSummary.netPaise > 0
                        ? 'Income exceeded expenses this month.'
                        : monthSummary.netPaise < 0
                          ? 'Expenses exceeded income this month.'
                          : 'Income and expenses balanced this month.'}
                    </p>
                  </article>
                  <div
                    className="analytics-flow-compare"
                    role="group"
                    aria-label={`Income and expenses for ${monthLabel(activeMonth)}`}
                  >
                    <div className="analytics-flow-row">
                      <div className="analytics-flow-label">
                        <span>Income</span>
                        <span className="amount amount--income">
                          {formatInrFromPaise(monthSummary.incomePaise)}
                        </span>
                      </div>
                      <div className="analytics-flow-track">
                        <div
                          className="analytics-flow-fill analytics-flow-fill--income"
                          style={{ width: `${incomeBarWidth}%` }}
                        />
                      </div>
                    </div>
                    <div className="analytics-flow-row">
                      <div className="analytics-flow-label">
                        <span>Expenses</span>
                        <span className="amount amount--expense">
                          {formatInrFromPaise(monthSummary.expensePaise)}
                        </span>
                      </div>
                      <div className="analytics-flow-track">
                        <div
                          className="analytics-flow-fill analytics-flow-fill--expense"
                          style={{ width: `${expenseBarWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="analytics-charts-grid">
                <section
                  className="finance-panel analytics-chart-section"
                  aria-labelledby="analytics-distribution-title"
                >
                  <header className="section-head section-head--in-panel">
                    <h2 id="analytics-distribution-title" className="section-head__title">
                      Spending by category
                    </h2>
                    <p className="section-head__sub">
                      Where your expense money went in {monthLabel(activeMonth)}
                    </p>
                  </header>
                  <CategoryExpenseChart
                    chartId="category-expense"
                    categories={monthSummary.categories}
                    customCategories={categoryState.categories}
                    monthKey={activeMonth}
                  />
                </section>

                <section
                  className="finance-panel analytics-chart-section"
                  aria-labelledby="analytics-monthly-title"
                >
                  <header className="section-head section-head--in-panel">
                    <h2 id="analytics-monthly-title" className="section-head__title">
                      Expense trend by month
                    </h2>
                    <p className="section-head__sub">Total expenses each month you have recorded</p>
                  </header>
                  {expenseSeries && !expenseSeries.ok && (
                    <div className="form-alert" role="alert">
                      <p>Monthly comparisons cannot be calculated from the saved transactions.</p>
                    </div>
                  )}
                  {expenseSeries?.ok && (
                    <MonthlyExpenseChart
                      chartId="monthly-expense"
                      months={expenseSeries.months}
                      highlightMonth={activeMonth}
                    />
                  )}
                </section>

                {insightLines.length > 0 && (
                  <section
                    className="finance-panel analytics-insights-panel"
                    aria-labelledby="analytics-insights-title"
                  >
                    <header className="section-head section-head--in-panel">
                      <h2 id="analytics-insights-title" className="section-head__title">
                        What stands out
                      </h2>
                      <p className="section-head__sub">
                        Short notes from your saved data for {monthLabel(activeMonth)}
                        {!categoryState.error ? ' (including budget status when available)' : ''}
                      </p>
                    </header>
                    <ul className="analytics-insights">
                      {insightLines.map((item) => (
                        <li key={item.id}>{item.text}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default AnalyticsSection
