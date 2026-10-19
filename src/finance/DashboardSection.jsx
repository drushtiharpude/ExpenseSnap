import { useState } from 'react'
import { readCategories } from '../data/categoryStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { categoryLabel } from '../transactions/categories.js'
import { formatInrFromPaise } from '../transactions/money.js'
import { summarizeTransactions } from './summarize.js'
import './finance.css'

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

function DashboardSection() {
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

  return (
    <section className="finance dashboard" aria-labelledby="section-title">
      <header className="dashboard-header">
        <h1 id="section-title">Dashboard</h1>
        <p className="dashboard-lead">Totals are calculated from saved transactions.</p>
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

      {summary && !summary.ok && (
        <div className="form-alert" role="alert">
          <p>These totals cannot be calculated from the saved transactions.</p>
        </div>
      )}

      {summary?.ok && (
        <>
          <section className="dashboard-block" aria-labelledby="dashboard-all-time">
            <h2 id="dashboard-all-time">All transactions</h2>
            {records.length === 0 ? (
              <p className="empty-state">No saved transactions yet. Add income and expenses from Transactions.</p>
            ) : (
              <dl className="metric-grid metric-grid--overview">
                <div className={`metric-card metric-card--net ${netTone}`.trim()}>
                  <dt>Net balance</dt>
                  <dd className="metric-value">{formatInrFromPaise(summary.netPaise)}</dd>
                </div>
                <div className="metric-card metric-card--secondary metric-card--income">
                  <dt>Total income</dt>
                  <dd className="metric-value amount--income">{formatInrFromPaise(summary.incomePaise)}</dd>
                </div>
                <div className="metric-card metric-card--secondary metric-card--expense">
                  <dt>Total expenses</dt>
                  <dd className="metric-value amount--expense">{formatInrFromPaise(summary.expensePaise)}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className="dashboard-block" aria-labelledby="dashboard-month">
            <h2 id="dashboard-month">{monthLabel(summary.month)}</h2>
            <dl className="metric-grid metric-grid--month">
              <div className="metric-card metric-card--secondary metric-card--income">
                <dt>Income</dt>
                <dd className="metric-value amount--income">{formatInrFromPaise(summary.monthIncomePaise)}</dd>
              </div>
              <div className="metric-card metric-card--secondary metric-card--expense">
                <dt>Expenses</dt>
                <dd className="metric-value amount--expense">{formatInrFromPaise(summary.monthExpensePaise)}</dd>
              </div>
            </dl>
          </section>

          <section className="dashboard-block" aria-labelledby="dashboard-categories">
            <h2 id="dashboard-categories">Expenses by category</h2>
            {summary.categories.length === 0 ? (
              <p className="empty-state">No expenses to show by category.</p>
            ) : (
              <div className="table-scroll dashboard-table-wrap">
                <table className="dashboard-table">
                  <caption className="visually-hidden">Expense totals by category</caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col" className="col-amount">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.categories.map((category) => (
                      <tr key={category.categoryId}>
                        <td>{categoryLabel(category.categoryId, categoryState.categories)}</td>
                        <td className="amount amount--expense col-amount">
                          {formatInrFromPaise(category.amountPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="dashboard-block" aria-labelledby="dashboard-recent-expenses">
            <h2 id="dashboard-recent-expenses">Recent expenses</h2>
            {recentExpenseRows.length === 0 ? (
              <p className="empty-state">No expenses yet. Add expense transactions to see them here.</p>
            ) : (
              <div className="table-scroll dashboard-table-wrap">
                <table className="dashboard-table">
                  <caption className="visually-hidden">Most recent expense transactions</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Category</th>
                      <th scope="col">Description</th>
                      <th scope="col" className="col-amount">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentExpenseRows.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{transaction.date}</td>
                        <td>{categoryLabel(transaction.categoryId, categoryState.categories)}</td>
                        <td>{transaction.description || '—'}</td>
                        <td className="amount amount--expense col-amount">
                          {formatInrFromPaise(transaction.amountPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}

export default DashboardSection
