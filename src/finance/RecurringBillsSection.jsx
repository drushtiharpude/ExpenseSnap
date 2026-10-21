import { useMemo, useRef, useState } from 'react'
import {
  createRecurringBill,
  updateRecurringBill,
} from '../data/recurringBill.js'
import { readRecurringBills, saveRecurringBills } from '../data/recurringBillStore.js'
import { readCategories } from '../data/categoryStore.js'
import { categoriesForType } from '../transactions/categories.js'
import { formatInrFromPaise, paiseToRupeeInput, rupeesInputToPaise } from '../transactions/money.js'
import PageHeader from '../ui/PageHeader.jsx'
import { PAGE_TAGLINES } from '../ui/pageHeaderCopy.js'
import { CategoryExpenseIcon, RecurringBillIcon } from '../ui/shellIcons.jsx'
import { payRecurringBill } from './recurringBillPay.js'
import {
  billDueBucket,
  isWithinUpcomingWindow,
  localCalendarDateString,
} from './recurringBillSchedule.js'
import './finance.css'

function storageErrorMessage(result, label) {
  if (result.error === 'unavailable') {
    return `Browser storage is unavailable. Saved ${label} were left unchanged.`
  }
  if (result.error === 'malformed') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `Saved ${label} could not be read. They were left unchanged.${detail}`
  }
  if (result.error === 'invalid') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `${label} could not be saved.${detail}`
  }
  if (result.error === 'quota') {
    return 'Browser storage is full. Changes were not saved.'
  }
  return `Saved ${label} could not be read. They were left unchanged.`
}

function frequencyLabel(frequency) {
  if (frequency === 'weekly') return 'Weekly'
  if (frequency === 'monthly') return 'Monthly'
  return 'Yearly'
}

function readStorageState() {
  const categories = readCategories()
  if (!categories.ok) {
    return { bills: null, categories: null, loadError: categories }
  }
  const bills = readRecurringBills(undefined, { customCategories: categories.categories })
  if (!bills.ok) {
    return { bills: null, categories: categories.categories, loadError: bills }
  }
  return { bills: bills.bills, categories: categories.categories, loadError: null }
}

function emptyDraft(today) {
  return {
    title: '',
    amountRupees: '',
    categoryId: 'food',
    frequency: 'monthly',
    nextDueDate: today ?? '',
    status: 'active',
  }
}

function groupActiveBills(bills, today) {
  const overdue = []
  const dueToday = []
  const upcoming = []
  const later = []
  for (const bill of bills) {
    if (bill.status !== 'active') continue
    const bucket = billDueBucket(bill, today)
    if (bucket === 'overdue') overdue.push(bill)
    else if (bucket === 'due-today') dueToday.push(bill)
    else if (bucket === 'upcoming' && isWithinUpcomingWindow(bill.nextDueDate, today, 30)) {
      upcoming.push(bill)
    } else if (bucket === 'upcoming') later.push(bill)
  }
  const byDue = (left, right) => left.nextDueDate.localeCompare(right.nextDueDate)
  overdue.sort(byDue)
  dueToday.sort(byDue)
  upcoming.sort(byDue)
  later.sort(byDue)
  return { overdue, dueToday, upcoming, later }
}

function BillGroup({ title, bills, payingId, onPay, onEdit, onTogglePause, onDelete, submitting }) {
  if (bills.length === 0) return null
  return (
    <section className="finance-panel" aria-labelledby={`bill-group-${title}`}>
      <header className="finance-panel-head">
        <h3 id={`bill-group-${title}`} className="finance-panel-title">
          {title}
        </h3>
      </header>
      <ul className="budget-list">
        {bills.map((bill) => (
          <li key={bill.id} className="budget-row">
            <div className="budget-row-main">
              <span className="budget-row-icon" aria-hidden>
                <RecurringBillIcon />
              </span>
              <div className="budget-row-copy">
                <p className="budget-row-title">{bill.title}</p>
                <p className="budget-row-meta">
                  {formatInrFromPaise(bill.amountPaise)} · {frequencyLabel(bill.frequency)} · Due{' '}
                  {bill.nextDueDate}
                </p>
              </div>
              <p className="budget-row-amount">{formatInrFromPaise(bill.amountPaise)}</p>
            </div>
            <div className="budget-row-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={submitting || payingId === bill.id}
                onClick={() => onPay(bill)}
              >
                {payingId === bill.id ? 'Saving…' : 'Mark paid'}
              </button>
              <button type="button" className="btn" disabled={submitting} onClick={() => onEdit(bill)}>
                Edit
              </button>
              <button type="button" className="btn" disabled={submitting} onClick={() => onTogglePause(bill)}>
                {bill.status === 'active' ? 'Pause' : 'Resume'}
              </button>
              <button type="button" className="btn btn--danger" disabled={submitting} onClick={() => onDelete(bill)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RecurringBillsSection() {
  const [today] = useState(() => localCalendarDateString(new Date()))
  const [storageState, setStorageState] = useState(readStorageState)
  const [draft, setDraft] = useState(() => emptyDraft(today))
  const [formErrors, setFormErrors] = useState([])
  const [actionError, setActionError] = useState(null)
  const [editId, setEditId] = useState(null)
  const [payingId, setPayingId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const bills = storageState.bills
  const categories = storageState.categories
  const expenseCategories = useMemo(
    () => (categories ? categoriesForType('expense', categories) : []),
    [categories],
  )

  const groups = useMemo(
    () => (bills ? groupActiveBills(bills, today) : { overdue: [], dueToday: [], upcoming: [], later: [] }),
    [bills, today],
  )
  const pausedBills = useMemo(
    () => (bills ? bills.filter((bill) => bill.status === 'paused').sort((a, b) => a.title.localeCompare(b.title)) : []),
    [bills],
  )

  function finish() {
    submittingRef.current = false
    setSubmitting(false)
    setPayingId(null)
  }

  function retry() {
    setStorageState(readStorageState())
  }

  function persist(nextBills) {
    const cats = readCategories()
    if (!cats.ok) {
      setActionError(storageErrorMessage(cats, 'categories'))
      finish()
      return false
    }
    const saved = saveRecurringBills(nextBills, undefined, { customCategories: cats.categories })
    if (!saved.ok) {
      setActionError(storageErrorMessage(saved, 'recurring bills'))
      finish()
      return false
    }
    setStorageState({ bills: saved.bills, categories: cats.categories, loadError: null })
    setActionError(null)
    finish()
    return true
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current || bills === null || categories === null) return
    submittingRef.current = true
    setSubmitting(true)
    setFormErrors([])
    setActionError(null)

    const amountPaise = rupeesInputToPaise(draft.amountRupees)
    const input = {
      title: draft.title,
      amountPaise,
      categoryId: draft.categoryId,
      frequency: draft.frequency,
      nextDueDate: draft.nextDueDate,
      status: draft.status,
    }

    if (editId) {
      const existing = bills.find((bill) => bill.id === editId)
      if (!existing) {
        setFormErrors(['This bill could not be found.'])
        finish()
        return
      }
      const updated = updateRecurringBill(existing, input, categories)
      if (!updated.ok) {
        setFormErrors(updated.errors)
        finish()
        return
      }
      persist(bills.map((bill) => (bill.id === editId ? updated.bill : bill)))
      setEditId(null)
      setDraft(emptyDraft(today))
      return
    }

    const created = createRecurringBill(input, categories)
    if (!created.ok) {
      setFormErrors(created.errors)
      finish()
      return
    }
    if (persist([...bills, created.bill])) {
      setDraft(emptyDraft(today))
    }
  }

  function startEdit(bill) {
    setEditId(bill.id)
    setDraft({
      title: bill.title,
      amountRupees: paiseToRupeeInput(bill.amountPaise),
      categoryId: bill.categoryId,
      frequency: bill.frequency,
      nextDueDate: bill.nextDueDate,
      status: bill.status,
    })
    setFormErrors([])
  }

  function cancelEdit() {
    setEditId(null)
    setDraft(emptyDraft(today))
    setFormErrors([])
  }

  function handleDelete(bill) {
    if (submittingRef.current || bills === null) return
    if (!window.confirm(`Delete recurring bill "${bill.title}"?`)) return
    submittingRef.current = true
    setSubmitting(true)
    persist(bills.filter((item) => item.id !== bill.id))
  }

  function handleTogglePause(bill) {
    if (submittingRef.current || bills === null || categories === null) return
    submittingRef.current = true
    setSubmitting(true)
    const nextStatus = bill.status === 'active' ? 'paused' : 'active'
    const updated = updateRecurringBill(bill, { status: nextStatus }, categories)
    if (!updated.ok) {
      setActionError(updated.errors.join(' '))
      finish()
      return
    }
    persist(bills.map((item) => (item.id === bill.id ? updated.bill : item)))
  }

  function handlePay(bill) {
    if (submittingRef.current || categories === null) return
    submittingRef.current = true
    setSubmitting(true)
    setPayingId(bill.id)
    setActionError(null)
    const result = payRecurringBill(bill.id, { customCategories: categories })
    if (!result.ok) {
      const message =
        result.message ??
        (Array.isArray(result.errors) ? result.errors.join(' ') : storageErrorMessage(result, 'payment'))
      setActionError(message)
      finish()
      return
    }
    setStorageState(readStorageState())
    finish()
  }

  if (storageState.loadError) {
    return (
      <div className="finance-page">
        <PageHeader
          icon="bills"
          title="Recurring Bills"
          tagline={PAGE_TAGLINES.bills}
          description="Track due dates locally. Expenses are recorded only when you mark a bill paid."
        />
        <div className="alert alert--error" role="alert">
          <p>{storageErrorMessage(storageState.loadError, 'recurring bills')}</p>
          <button type="button" className="btn" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="finance-page">
      <PageHeader
        icon="bills"
        title="Recurring Bills"
        tagline={PAGE_TAGLINES.bills}
        description="Track due dates locally. Expenses are recorded only when you mark a bill paid."
      />

      <section className="finance-panel" aria-labelledby="recurring-bill-form">
        <header className="finance-panel-head">
          <h2 id="recurring-bill-form" className="finance-panel-title">
            {editId ? 'Edit bill' : 'Add recurring bill'}
          </h2>
          <p className="finance-panel-sub">
            Scheduled bills stay here until you mark them paid—then one expense is recorded and the
            next due date moves forward.
          </p>
        </header>
        <form className="finance-form" onSubmit={handleSubmit}>
          {formErrors.length > 0 && (
            <ul className="form-errors" role="alert">
              {formErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          <label>
            Title
            <input
              value={draft.title}
              maxLength={128}
              required
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label>
            Amount (₹)
            <input
              inputMode="decimal"
              value={draft.amountRupees}
              required
              onChange={(event) => setDraft((current) => ({ ...current, amountRupees: event.target.value }))}
            />
          </label>
          <label>
            Category
            <span className="field-icon" aria-hidden>
              <CategoryExpenseIcon />
            </span>
            <select
              value={draft.categoryId}
              onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}
            >
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label ?? category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Frequency
            <select
              value={draft.frequency}
              onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value }))}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label>
            Next due date
            <input
              type="date"
              value={draft.nextDueDate}
              required
              onChange={(event) => setDraft((current) => ({ ...current, nextDueDate: event.target.value }))}
            />
          </label>
          <div className="finance-form-actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {editId ? 'Save changes' : 'Add bill'}
            </button>
            {editId ? (
              <button type="button" className="btn" disabled={submitting} onClick={cancelEdit}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {actionError ? (
        <div className="alert alert--error" role="alert">
          <p>{actionError}</p>
        </div>
      ) : null}

      <BillGroup
        title="Overdue"
        bills={groups.overdue}
        payingId={payingId}
        onPay={handlePay}
        onEdit={startEdit}
        onTogglePause={handleTogglePause}
        onDelete={handleDelete}
        submitting={submitting}
      />
      <BillGroup
        title="Due today"
        bills={groups.dueToday}
        payingId={payingId}
        onPay={handlePay}
        onEdit={startEdit}
        onTogglePause={handleTogglePause}
        onDelete={handleDelete}
        submitting={submitting}
      />
      <BillGroup
        title="Upcoming (next 30 days)"
        bills={groups.upcoming}
        payingId={payingId}
        onPay={handlePay}
        onEdit={startEdit}
        onTogglePause={handleTogglePause}
        onDelete={handleDelete}
        submitting={submitting}
      />
      {groups.later.length > 0 ? (
        <BillGroup
          title="Later"
          bills={groups.later}
          payingId={payingId}
          onPay={handlePay}
          onEdit={startEdit}
          onTogglePause={handleTogglePause}
          onDelete={handleDelete}
          submitting={submitting}
        />
      ) : null}

      {pausedBills.length > 0 ? (
        <section className="finance-panel" aria-labelledby="paused-bills">
          <header className="finance-panel-head">
            <h3 id="paused-bills" className="finance-panel-title">
              Paused
            </h3>
            <p className="finance-panel-sub">Paused bills are hidden from payable groups until you resume them.</p>
          </header>
          <ul className="budget-list">
            {pausedBills.map((bill) => (
              <li key={bill.id} className="budget-row">
                <div className="budget-row-main">
                  <span className="budget-row-icon" aria-hidden>
                    <RecurringBillIcon />
                  </span>
                  <div className="budget-row-copy">
                    <p className="budget-row-title">{bill.title}</p>
                    <p className="budget-row-meta">
                      {formatInrFromPaise(bill.amountPaise)} · Next due {bill.nextDueDate}
                    </p>
                  </div>
                </div>
                <div className="budget-row-actions">
                  <button type="button" className="btn" disabled={submitting} onClick={() => startEdit(bill)}>
                    Edit
                  </button>
                  <button type="button" className="btn" disabled={submitting} onClick={() => handleTogglePause(bill)}>
                    Resume
                  </button>
                  <button type="button" className="btn btn--danger" disabled={submitting} onClick={() => handleDelete(bill)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {bills.length === 0 ? (
        <p className="finance-empty">No recurring bills yet. Add one above to track rent, subscriptions, and reminders.</p>
      ) : null}
    </div>
  )
}

export default RecurringBillsSection
