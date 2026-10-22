import { useRef, useState } from 'react'
import { createBudget, deleteBudget, updateBudget } from '../data/budget.js'
import { readBudgets, saveBudgets } from '../data/budgetStore.js'
import { readCategories } from '../data/categoryStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { categoriesForType } from '../transactions/categories.js'
import { formatInrFromPaise, paiseToRupeeInput, rupeesInputToPaise } from '../transactions/money.js'
import PageHeader from '../ui/PageHeader.jsx'
import { PAGE_TAGLINES } from '../ui/pageHeaderCopy.js'
import { BudgetRowIcon, CategoryExpenseIcon } from '../ui/shellIcons.jsx'
import { defaultAnalyticsMonth, listTransactionMonths } from './analyze.js'
import { budgetStatusForMonth } from './budgetStatus.js'
import './finance.css'

function monthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  )
}

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

function budgetStorageErrorMessage(result) {
  if (result.error === 'unavailable') {
    return 'Browser storage is unavailable. Saved budgets were left unchanged.'
  }
  if (result.error === 'malformed') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `Saved budgets could not be read. They were left unchanged.${detail}`
  }
  if (result.error === 'invalid') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `Budgets could not be saved.${detail}`
  }
  if (result.error === 'quota') {
    return 'Browser storage is full. Budgets were not saved.'
  }
  return 'Saved budgets could not be read. They were left unchanged.'
}

function budgetProgressWidth(percentUsed, status) {
  if (status === 'exceeded') return 100
  return Math.min(100, Math.max(0, percentUsed))
}

function budgetMonthTotals(items) {
  let limitPaise = 0
  let spentPaise = 0
  let remainingPaise = 0
  for (const item of items) {
    limitPaise += item.limitPaise
    spentPaise += item.spentPaise
    remainingPaise += item.remainingPaise
  }
  return { limitPaise, spentPaise, remainingPaise }
}

/** Matches budgetStatus.js: approaching at 80% of limit or at limit (not exceeded). */
const BUDGET_APPROACHING_PERCENT = 80

function overallBudgetStatus(spentPaise, limitPaise) {
  if (limitPaise <= 0) return 'ok'
  if (spentPaise > limitPaise) return 'exceeded'
  if (spentPaise * 100 >= limitPaise * BUDGET_APPROACHING_PERCENT) return 'approaching'
  return 'ok'
}

function overallPercentUsed(spentPaise, limitPaise) {
  if (limitPaise <= 0) return 0
  if (spentPaise === 0) return 0
  return Math.min(100, Math.floor((spentPaise * 100) / limitPaise))
}

function budgetStatusLabel(status) {
  if (status === 'exceeded') return 'Over budget'
  if (status === 'approaching') return 'Getting close'
  return 'On track'
}

function budgetStatusHint(status, percentUsed) {
  if (status === 'exceeded') return 'Spending has passed the combined category limits.'
  if (status === 'approaching') {
    return percentUsed >= 100
      ? 'You have used at least 80% of your combined limits—watch remaining headroom.'
      : 'You have used at least 80% of your combined limits.'
  }
  return 'Spending is within your combined category limits for this month.'
}

function MonthlyBudgetsPanel({ activeMonth, records, customCategories }) {
  const submittingRef = useRef(false)
  const [budgetState, setBudgetState] = useState(() => {
    const result = readBudgets(undefined, { customCategories })
    if (result.ok) return { budgets: result.budgets, loadError: null }
    return { budgets: null, loadError: result }
  })
  const [editingId, setEditingId] = useState(null)
  const [formCategoryId, setFormCategoryId] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formErrors, setFormErrors] = useState([])
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const showBudgetForm = addFormOpen || editingId !== null

  function reloadBudgets() {
    const result = readBudgets(undefined, { customCategories })
    if (result.ok) {
      setBudgetState({ budgets: result.budgets, loadError: null })
      return true
    }
    setBudgetState({ budgets: null, loadError: result })
    return false
  }

  function finishSubmit() {
    submittingRef.current = false
    setSubmitting(false)
  }

  function resetForm() {
    setEditingId(null)
    setFormCategoryId('')
    setFormAmount('')
    setFormErrors([])
    setPendingDeleteId(null)
  }

  function closeBudgetForm() {
    resetForm()
    setAddFormOpen(false)
  }

  function openAddBudgetForm() {
    resetForm()
    setAddFormOpen(true)
  }

  function startEdit(budget) {
    setEditingId(budget.id)
    setFormCategoryId(budget.categoryId)
    setFormAmount(paiseToRupeeInput(budget.limitPaise))
    setFormErrors([])
    setPendingDeleteId(null)
    setAddFormOpen(true)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current || budgetState.budgets === null) return
    submittingRef.current = true
    setSubmitting(true)
    setFormErrors([])

    const limitPaise = rupeesInputToPaise(formAmount)
    if (limitPaise === null) {
      setFormErrors(['Enter a valid amount in rupees.'])
      finishSubmit()
      return
    }
    if (!formCategoryId) {
      setFormErrors(['Choose an expense category.'])
      finishSubmit()
      return
    }

    let nextList
    if (editingId) {
      const existing = budgetState.budgets.find((item) => item.id === editingId)
      if (!existing) {
        setFormErrors(['This budget is no longer available.'])
        finishSubmit()
        return
      }
      const updated = updateBudget(
        existing,
        { month: activeMonth, categoryId: formCategoryId, limitPaise },
        budgetState.budgets,
        customCategories,
      )
      if (!updated.ok) {
        setFormErrors(updated.errors)
        finishSubmit()
        return
      }
      nextList = budgetState.budgets.map((item) =>
        item.id === editingId ? updated.budget : item,
      )
    } else {
      const created = createBudget(
        { month: activeMonth, categoryId: formCategoryId, limitPaise },
        budgetState.budgets,
        customCategories,
      )
      if (!created.ok) {
        setFormErrors(created.errors)
        finishSubmit()
        return
      }
      nextList = [...budgetState.budgets, created.budget]
    }

    const saved = saveBudgets(nextList, undefined, { customCategories })
    if (!saved.ok) {
      setFormErrors([budgetStorageErrorMessage(saved)])
      finishSubmit()
      return
    }
    setBudgetState({ budgets: saved.budgets, loadError: null })
    resetForm()
    setAddFormOpen(false)
    finishSubmit()
  }

  function confirmDelete(id) {
    if (submittingRef.current || budgetState.budgets === null) return
    submittingRef.current = true
    setSubmitting(true)
    const removed = deleteBudget(budgetState.budgets, id)
    if (!removed.ok) {
      setFormErrors(removed.errors)
      setPendingDeleteId(null)
      finishSubmit()
      return
    }
    const saved = saveBudgets(removed.budgets, undefined, { customCategories })
    if (!saved.ok) {
      setFormErrors([budgetStorageErrorMessage(saved)])
      finishSubmit()
      return
    }
    setBudgetState({ budgets: saved.budgets, loadError: null })
    if (editingId === id) resetForm()
    setPendingDeleteId(null)
    finishSubmit()
  }

  if (budgetState.loadError) {
    return (
      <div className="form-alert" role="alert">
        <p>{budgetStorageErrorMessage(budgetState.loadError)}</p>
        <button type="button" className="btn" onClick={() => reloadBudgets()}>
          Try again
        </button>
      </div>
    )
  }

  const status = budgetStatusForMonth(budgetState.budgets, records, activeMonth, customCategories)
  const expenseOptions = categoriesForType('expense', customCategories)
  const monthBudgetIds = new Set(
    budgetState.budgets.filter((item) => item.month === activeMonth).map((item) => item.categoryId),
  )
  const editingBudget = editingId
    ? budgetState.budgets.find((item) => item.id === editingId)
    : null
  const categoryOptions = expenseOptions.filter(
    (option) =>
      !monthBudgetIds.has(option.id) ||
      (editingBudget && option.id === editingBudget.categoryId),
  )
  const monthTotals =
    status.ok && status.items.length > 0 ? budgetMonthTotals(status.items) : null
  const overallStatus = monthTotals
    ? overallBudgetStatus(monthTotals.spentPaise, monthTotals.limitPaise)
    : 'ok'
  const overallUsedPercent = monthTotals
    ? overallPercentUsed(monthTotals.spentPaise, monthTotals.limitPaise)
    : 0

  return (
    <div className="budgets-stack">
      {status.ok === false && (
        <div className="form-alert" role="alert">
          <p>Budget progress could not be calculated from saved data.</p>
        </div>
      )}

      {monthTotals && (
        <section className="budgets-summary-overview" aria-labelledby="budgets-summary-title">
          <header className="budgets-summary-overview-head">
            <div className="budgets-summary-overview-lead">
              <h3 id="budgets-summary-title" className="budgets-summary-overview-title">
                Overall for {monthLabel(activeMonth)}
              </h3>
              <p className="budgets-summary-overview-hint">
                {budgetStatusHint(overallStatus, overallUsedPercent)}
              </p>
            </div>
            <span
              className={`budget-status-badge budget-status-badge--${overallStatus}`}
              role="status"
            >
              {budgetStatusLabel(overallStatus)}
            </span>
          </header>
          <p className="budgets-summary-remaining">
            <span className="budgets-summary-remaining-label">Remaining</span>
            <span
              className={`budgets-summary-remaining-value amount${
                monthTotals.remainingPaise < 0 ? ' amount--expense' : ' amount--balance'
              }`}
            >
              {formatInrFromPaise(monthTotals.remainingPaise)}
            </span>
          </p>
          <div
            className="analytics-budget-track budgets-summary-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={budgetProgressWidth(overallUsedPercent, overallStatus)}
            aria-label={`${overallUsedPercent}% of combined budget used`}
          >
            <div
              className={`analytics-budget-fill${
                overallStatus === 'ok' ? '' : ` analytics-budget-fill--${overallStatus}`
              }`}
              style={{
                width: `${budgetProgressWidth(overallUsedPercent, overallStatus)}%`,
              }}
            />
          </div>
          <p className="budgets-summary-track-caption">
            <span>{overallUsedPercent}% of combined limit used</span>
            <span className="budgets-summary-track-caption-sep" aria-hidden="true">
              ·
            </span>
            <span>
              {formatInrFromPaise(monthTotals.spentPaise)} spent of{' '}
              {formatInrFromPaise(monthTotals.limitPaise)} budgeted
            </span>
          </p>
          <dl className="budgets-summary-stats">
            <div className="budgets-summary-stat">
              <dt>Budget</dt>
              <dd>{formatInrFromPaise(monthTotals.limitPaise)}</dd>
            </div>
            <div className="budgets-summary-stat">
              <dt>Spent</dt>
              <dd className="amount amount--expense">{formatInrFromPaise(monthTotals.spentPaise)}</dd>
            </div>
            <div className="budgets-summary-stat">
              <dt>Remaining</dt>
              <dd
                className={`amount${
                  monthTotals.remainingPaise < 0 ? ' amount--expense' : ' amount--balance'
                }`}
              >
                {formatInrFromPaise(monthTotals.remainingPaise)}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {status.ok && (
        <section className="budgets-categories" aria-labelledby="budgets-categories-title">
          <header className="budgets-categories-head budgets-categories-head--toolbar">
            <div className="section-head section-head--in-panel">
              <h3 id="budgets-categories-title" className="section-head__title">
                By category
              </h3>
              <p className="section-head__sub">
                {status.items.length > 0
                  ? 'Each bar shows spending against that category\'s limit. Status turns amber at 80% used, red when over.'
                  : `No limits set for ${monthLabel(activeMonth)} yet. Add one when you are ready.`}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--primary budgets-add-toggle"
              disabled={submitting || (categoryOptions.length === 0 && !editingId)}
              onClick={openAddBudgetForm}
            >
              + Add budget
            </button>
          </header>

          {status.items.length === 0 ? (
            <div className="budgets-empty-panel empty-state">
              <p className="budgets-empty-title">No category budgets yet</p>
              <p className="budgets-empty-body">
                Pick an expense category and monthly limit. Progress updates from saved expense
                transactions in this month—one limit per category.
              </p>
            </div>
          ) : (
          <ul className="analytics-budget-list budgets-category-list">
            {status.items.map((item) => (
              <li
                key={item.id}
                className={`analytics-budget-row budgets-category-card analytics-budget-row--${item.status}${
                  editingId === item.id ? ' budgets-category-card--editing' : ''
                }`}
              >
                <div className="analytics-budget-row-top">
                  <div className="analytics-budget-row-main">
                    <div className="analytics-budget-row-header budgets-category-card-head">
                      <div className="budgets-category-title-row">
                        <span className="budgets-category-icon" aria-hidden="true">
                          <CategoryExpenseIcon
                            categoryId={item.categoryId}
                            customCategories={customCategories}
                          />
                        </span>
                        <h4 className="analytics-budget-row-title">{item.categoryLabel}</h4>
                      </div>
                      <span
                        className={`budget-status-badge budget-status-badge--${item.status}`}
                        role="status"
                      >
                        {budgetStatusLabel(item.status)}
                        <span className="budget-status-badge-meta"> · {item.percentUsed}% used</span>
                      </span>
                    </div>
                    <dl className="budgets-category-amounts">
                      <div>
                        <dt>Limit</dt>
                        <dd>{formatInrFromPaise(item.limitPaise)}</dd>
                      </div>
                      <div>
                        <dt>Spent</dt>
                        <dd className="amount amount--expense">
                          {formatInrFromPaise(item.spentPaise)}
                        </dd>
                      </div>
                      <div>
                        <dt>{item.remainingPaise >= 0 ? 'Remaining' : 'Over by'}</dt>
                        <dd
                          className={`amount${
                            item.remainingPaise >= 0 ? '' : ' amount--expense'
                          }`}
                        >
                          {formatInrFromPaise(
                            item.remainingPaise >= 0 ? item.remainingPaise : -item.remainingPaise,
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div
                    className={`analytics-budget-row-toolbar budgets-category-toolbar${
                      pendingDeleteId === item.id ? ' analytics-budget-row-toolbar--confirm' : ''
                    }`}
                  >
                    {pendingDeleteId === item.id ? (
                      <>
                        <span className="analytics-budget-row-confirm-prompt">Delete this budget?</span>
                        <button
                          type="button"
                          className="btn btn--danger"
                          disabled={submitting}
                          onClick={() => confirmDelete(item.id)}
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={submitting}
                          onClick={() => setPendingDeleteId(null)}
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn--icon"
                          disabled={submitting}
                          aria-label={`Edit ${item.categoryLabel} budget`}
                          title={`Edit ${item.categoryLabel} budget`}
                          onClick={() => startEdit(item)}
                        >
                          <BudgetRowIcon name="edit" />
                        </button>
                        <button
                          type="button"
                          className="btn btn--icon btn--danger"
                          disabled={submitting}
                          aria-label={`Delete ${item.categoryLabel} budget`}
                          title={`Delete ${item.categoryLabel} budget`}
                          onClick={() => {
                            setPendingDeleteId(item.id)
                            setFormErrors([])
                          }}
                        >
                          <BudgetRowIcon name="delete" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div
                  className="analytics-budget-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={budgetProgressWidth(item.percentUsed, item.status)}
                  aria-label={`${item.categoryLabel}: ${item.percentUsed}% of budget used, ${budgetStatusLabel(item.status)}`}
                >
                  <div
                    className={`analytics-budget-fill${
                      item.status === 'ok' ? '' : ` analytics-budget-fill--${item.status}`
                    }`}
                    style={{
                      width: `${budgetProgressWidth(item.percentUsed, item.status)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          )}
        </section>
      )}

      {showBudgetForm && (
      <form className="analytics-budget-form budgets-form" onSubmit={handleSubmit}>
        <header className="section-head section-head--in-panel">
          <h3 className="section-head__title">{editingId ? 'Edit budget' : 'Add budget'}</h3>
          <p className="section-head__sub">
            Applies to <strong>{monthLabel(activeMonth)}</strong>. Expense categories only—each
            category can have one limit per month.
          </p>
        </header>
        <div className="budgets-form-grid">
          <label className="budgets-form-field">
            Category
            <select
              name="budget-category"
              value={formCategoryId}
              required
              disabled={submitting || categoryOptions.length === 0}
              onChange={(event) => setFormCategoryId(event.target.value)}
            >
              <option value="" disabled>
                Select category
              </option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="budgets-form-field">
            Monthly limit (₹)
            <input
              name="budget-limit"
              inputMode="decimal"
              autoComplete="off"
              required
              value={formAmount}
              disabled={submitting}
              placeholder="e.g. 5000"
              onChange={(event) => setFormAmount(event.target.value)}
            />
          </label>
        </div>
        {categoryOptions.length === 0 && !editingId && (
          <p className="budgets-form-hint" role="status">
            Every expense category already has a budget this month. Edit an existing limit or switch
            months.
          </p>
        )}
        {formErrors.length > 0 && (
          <div className="form-alert" role="alert">
            {formErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}
        <div className="form-actions budgets-form-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={submitting || categoryOptions.length === 0}
          >
            {editingId ? 'Save budget' : 'Add budget'}
          </button>
          <button type="button" className="btn" disabled={submitting} onClick={closeBudgetForm}>
            Cancel
          </button>
        </div>
      </form>
      )}
    </div>
  )
}

function BudgetSection() {
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

  function retry() {
    const result = readTransactions()
    setStorageState((current) =>
      result.ok
        ? { records: result.transactions, loadError: null }
        : { records: current.records, loadError: result },
    )
  }

  return (
    <section className="finance budgets" aria-labelledby="section-title">
      <PageHeader
        icon="budgets"
        variant="standard"
        title="Budgets"
        tagline={PAGE_TAGLINES.budgets}
        description="Set monthly limits by category and see what's left at a glance. Spending comes from saved expense transactions."
      >
        {records !== null && !loadError && (
          <div className="page-banner__toolbar">
            <label className="page-banner__field" htmlFor="budgets-month">
              Viewing month
              <select
                id="budgets-month"
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

      {records !== null && !loadError && !categoryState.error && (
        <div className="budgets-panel" aria-labelledby="budgets-panel-title">
          <h2 id="budgets-panel-title" className="visually-hidden">
            Budget limits for {monthLabel(activeMonth)}
          </h2>
          <MonthlyBudgetsPanel
            activeMonth={activeMonth}
            records={records}
            customCategories={categoryState.categories}
          />
        </div>
      )}
    </section>
  )
}

export default BudgetSection
