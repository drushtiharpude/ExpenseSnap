import { useState } from 'react'
import { readCategories } from '../data/categoryStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { categoryLabel } from '../transactions/categories.js'
import { formatInrFromPaise } from '../transactions/money.js'
import {
  buildAnalyticsInsights,
  defaultAnalyticsMonth,
  listTransactionMonths,
  monthlyExpenseSeries,
  summarizeForMonth,
} from './analyze.js'
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

/** Compact x-axis label: month only when every bar is in the same calendar year. */
function chartMonthLabel(month, monthKeys) {
  const [year, monthNumber] = month.split('-').map(Number)
  const monthOnly = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(
    new Date(year, monthNumber - 1, 1),
  )
  const years = new Set(monthKeys.map((key) => key.slice(0, 4)))
  if (years.size === 1) return monthOnly
  return `${monthOnly} ${String(year).slice(-2)}`
}

function CategoryExpenseChart({ categories, customCategories, chartId }) {
  if (categories.length === 0) {
    return <p className="empty-state">No expenses in this month to chart by category.</p>
  }

  const total = categories.reduce((sum, item) => sum + item.amountPaise, 0)
  const max = categories[0]?.amountPaise ?? 1

  return (
    <div className="analytics-chart-block analytics-chart-panel">
      <figure className="category-chart" aria-labelledby={`${chartId}-title`}>
        <figcaption id={`${chartId}-title`} className="visually-hidden">
          Expense distribution by category
        </figcaption>
        <ul className="category-bars">
          {categories.map((category, index) => {
            const label = categoryLabel(category.categoryId, customCategories)
            const width = `${Math.max(4, Math.round((category.amountPaise / max) * 100))}%`
            const share =
              total > 0 ? ((category.amountPaise / total) * 100).toFixed(1) : null
            return (
              <li key={category.categoryId}>
                <span className="category-bar-label">{label}</span>
                <div
                  className="category-bar-track"
                  role="presentation"
                  aria-hidden="true"
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
        <caption>Category amounts for this chart</caption>
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
    return <p className="empty-state">No expense history to compare across months yet.</p>
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
    <div className="analytics-chart-block analytics-chart-panel">
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
            aria-describedby={`${chartId}-monthly-table`}
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
              return (
                <g key={item.month}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx="4"
                    fill={
                      highlightMonth && item.month === highlightMonth
                        ? 'var(--chart-2)'
                        : 'var(--chart-8)'
                    }
                    className="monthly-chart-bar"
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
                    className="monthly-chart-label"
                  >
                    {chartMonthLabel(item.month, monthKeys)}
                  </text>
                </g>
              )
            })}
          </svg>
        </figure>
      </div>
      <table id={`${chartId}-monthly-table`} className="analytics-data-table">
        <caption>Monthly expense totals for this chart</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col" className="col-amount">
              Expenses
            </th>
          </tr>
        </thead>
        <tbody>
          {months.map((item) => (
            <tr key={item.month}>
              <td>{monthLabel(item.month)}</td>
              <td className="amount amount--expense col-amount">{formatInrFromPaise(item.expensePaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
    if (insight.diffPaise > 0) {
      return `Expenses in ${current} were ${formatInrFromPaise(insight.diffPaise)} higher than ${previous}.`
    }
    return `Expenses in ${current} were ${formatInrFromPaise(-insight.diffPaise)} lower than ${previous}.`
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
  const insights =
    records === null || !monthSummary?.ok ? [] : buildAnalyticsInsights(records, activeMonth)

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

  return (
    <section className="finance analytics" aria-labelledby="section-title">
      <header className="finance-header">
        <h1 id="section-title">Analytics</h1>
        <p className="finance-lead">Charts and insights come from saved transactions only.</p>
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

      {records !== null && !loadError && (
        <>
          <div className="finance-panel analytics-toolbar">
            <label htmlFor="analytics-month">
              Month
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

          {records.length === 0 && (
            <p className="empty-state">
              No saved transactions yet. Add income and expenses to see analytics.
            </p>
          )}

          {monthSummary && !monthSummary.ok && (
            <div className="form-alert" role="alert">
              <p>Analytics cannot be calculated from the saved transactions.</p>
            </div>
          )}

          {monthSummary?.ok && records.length > 0 && (
            <>
              <section className="finance-panel" aria-labelledby="analytics-month-summary">
                <h2 id="analytics-month-summary">{monthLabel(activeMonth)}</h2>
                <dl className="metric-grid metric-grid--overview">
                  <div className={`metric-card metric-card--net ${netTone}`.trim()}>
                    <dt>Net balance</dt>
                    <dd className="metric-value">{formatInrFromPaise(monthSummary.netPaise)}</dd>
                  </div>
                  <div className="metric-card metric-card--secondary metric-card--income">
                    <dt>Income</dt>
                    <dd className="metric-value amount--income">
                      {formatInrFromPaise(monthSummary.incomePaise)}
                    </dd>
                  </div>
                  <div className="metric-card metric-card--secondary metric-card--expense">
                    <dt>Expenses</dt>
                    <dd className="metric-value amount--expense">
                      {formatInrFromPaise(monthSummary.expensePaise)}
                    </dd>
                  </div>
                </dl>
              </section>

              {insights.length > 0 && (
                <section className="finance-panel" aria-labelledby="analytics-insights-title">
                  <h2 id="analytics-insights-title">Insights</h2>
                  <ul className="analytics-insights">
                    {insights.map((insight) => {
                      const text = formatInsight(insight, categoryState.categories, activeMonth)
                      if (!text) return null
                      return <li key={insight.id}>{text}</li>
                    })}
                  </ul>
                </section>
              )}

              <section className="finance-panel" aria-labelledby="analytics-distribution-title">
                <h2 id="analytics-distribution-title">Expense distribution</h2>
                <CategoryExpenseChart
                  chartId="category-expense"
                  categories={monthSummary.categories}
                  customCategories={categoryState.categories}
                />
              </section>

              <section className="finance-panel" aria-labelledby="analytics-monthly-title">
                <h2 id="analytics-monthly-title">Monthly expense comparison</h2>
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
            </>
          )}
        </>
      )}
    </section>
  )
}

export default AnalyticsSection
