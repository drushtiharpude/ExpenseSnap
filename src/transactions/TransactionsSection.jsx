import { useMemo, useRef, useState } from 'react'
import { readCategories } from '../data/categoryStore.js'
import { createTransaction, updateTransaction } from '../data/transaction.js'
import { readTransactions, saveTransactions } from '../data/transactionStore.js'
import {
  categoriesForType,
  categoryLabel,
  filterCategoryOptions,
  withSelectedCategory,
} from './categories.js'
import PageHeader from '../ui/PageHeader.jsx'
import { PAGE_TAGLINES } from '../ui/pageHeaderCopy.js'
import { BudgetRowIcon, CategoryExpenseIcon, FilterIcon } from '../ui/shellIcons.jsx'
import DescriptionDictation from './DescriptionDictation.jsx'
import { formatInrFromPaise, paiseToRupeeInput, rupeesInputToPaise } from './money.js'
import './TransactionsSection.css'

const EMPTY_FORM = {
  type: 'expense',
  amount: '',
  date: '',
  categoryId: 'food',
  description: '',
}

function todayInputValue() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function storageErrorMessage(result) {
  if (result.error === 'unavailable') {
    return 'Browser storage is unavailable. Existing transactions were left unchanged.'
  }
  if (result.error === 'malformed') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `Saved transactions could not be read. They were left unchanged.${detail}`
  }
  if (result.error === 'quota') {
    return 'Browser storage is full. This change was not saved.'
  }
  if (result.error === 'invalid' && Array.isArray(result.errors)) {
    return result.errors.join(' ')
  }
  return 'This change could not be saved. Existing transactions were left unchanged.'
}

function compareTransactions(left, right) {
  if (left.date !== right.date) return right.date.localeCompare(left.date)
  if (left.createdAt !== right.createdAt) return right.createdAt.localeCompare(left.createdAt)
  return left.id.localeCompare(right.id)
}

const EMPTY_FILTERS = {
  query: '',
  type: 'all',
  categoryId: 'all',
  from: '',
  to: '',
}

function readStorageState() {
  const result = readTransactions()
  if (result.ok) return { records: result.transactions, loadError: null }
  return { records: null, loadError: result }
}

function TransactionsSection() {
  const [storageState, setStorageState] = useState(readStorageState)
  const records = storageState.records
  const loadError = storageState.loadError
  const [actionError, setActionError] = useState(null)
  const [formErrors, setFormErrors] = useState([])
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, date: todayInputValue() }))
  const [editingId, setEditingId] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState({
    query: '',
    type: 'all',
    categoryId: 'all',
    from: '',
    to: '',
  })
  const submittingRef = useRef(false)
  const dictationRef = useRef(null)
  const [customState, setCustomState] = useState(() => {
    const result = readCategories()
    if (result.ok) return { categories: result.categories, error: null }
    return { categories: [], error: result }
  })

  function applyRead(result) {
    setStorageState((current) =>
      result.ok
        ? { records: result.transactions, loadError: null }
        : { records: current.records, loadError: result },
    )
  }

  function replaceRecords(nextRecords) {
    setStorageState({ records: nextRecords, loadError: null })
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function selectType(type) {
    setForm((current) => {
      const options = categoriesForType(type, customState.categories)
      const editing = (records ?? []).find((transaction) => transaction.id === editingId)
      let categoryId = options[0]?.id ?? current.categoryId
      if (options.some((option) => option.id === current.categoryId)) categoryId = current.categoryId
      else if (editing?.type === type) categoryId = editing.categoryId
      return { ...current, type, categoryId }
    })
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, date: todayInputValue() })
    setEditingId(null)
    setFormErrors([])
  }

  function finishSubmit() {
    submittingRef.current = false
    setSubmitting(false)
  }

  function persistChange(mutator, { resetOnSuccess = false } = {}) {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setFormErrors([])
    setActionError(null)

    const current = readTransactions()
    if (!current.ok) {
      setActionError(storageErrorMessage(current))
      finishSubmit()
      return
    }

    const next = mutator(current.transactions)
    if (!next.ok) {
      replaceRecords(current.transactions)
      setFormErrors(next.errors)
      finishSubmit()
      return
    }

    const saved = saveTransactions(next.transactions)
    if (!saved.ok) {
      replaceRecords(current.transactions)
      setActionError(storageErrorMessage(saved))
      finishSubmit()
      return
    }

    replaceRecords(saved.transactions)
    setPendingDeleteId(null)
    if (resetOnSuccess) resetForm()
    finishSubmit()
  }

  function handleSubmit(event) {
    event.preventDefault()
    dictationRef.current?.stopDictation()
    const amountPaise = rupeesInputToPaise(form.amount)
    if (amountPaise === null) {
      setActionError(null)
      setFormErrors([
        'Enter an amount in rupees greater than zero, with up to 2 decimal places.',
      ])
      return
    }

    const input = {
      type: form.type,
      amountPaise,
      date: form.date,
      categoryId: form.categoryId,
      description: form.description,
    }

    persistChange(
      (list) => {
        if (!editingId) {
          const created = createTransaction(input)
          if (!created.ok) return created
          return { ok: true, transactions: [...list, created.transaction] }
        }

        const existing = list.find((transaction) => transaction.id === editingId)
        if (!existing) {
          return { ok: false, errors: ['This transaction is no longer saved.'] }
        }
        const updated = updateTransaction(existing, input)
        if (!updated.ok) return updated
        return {
          ok: true,
          transactions: list.map((transaction) =>
            transaction.id === existing.id ? updated.transaction : transaction,
          ),
        }
      },
      { resetOnSuccess: true },
    )
  }

  function startEdit(transaction) {
    setEditingId(transaction.id)
    setPendingDeleteId(null)
    setFormErrors([])
    setActionError(null)
    setForm({
      type: transaction.type,
      amount: paiseToRupeeInput(transaction.amountPaise),
      date: transaction.date,
      categoryId: transaction.categoryId,
      description: transaction.description,
    })
  }

  function confirmDelete(id) {
    persistChange(
      (list) => ({
        ok: true,
        transactions: list.filter((transaction) => transaction.id !== id),
      }),
      { resetOnSuccess: editingId === id },
    )
  }

  const formCategories = useMemo(
    () =>
      withSelectedCategory(
        categoriesForType(form.type, customState.categories),
        form.categoryId,
        customState.categories,
      ),
    [form.type, form.categoryId, customState.categories],
  )
  const filterCategories = useMemo(
    () => filterCategoryOptions(filters.type, customState.categories, records ?? []),
    [filters.type, customState.categories, records],
  )

  const dateRangeInvalid = filters.from !== '' && filters.to !== '' && filters.from > filters.to
  const visible = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    return (records ?? [])
      .filter((transaction) => {
        if (query && !transaction.description.toLowerCase().includes(query)) return false
        if (filters.type !== 'all' && transaction.type !== filters.type) return false
        if (filters.categoryId !== 'all' && transaction.categoryId !== filters.categoryId) {
          return false
        }
        if (!dateRangeInvalid && filters.from && transaction.date < filters.from) return false
        if (!dateRangeInvalid && filters.to && transaction.date > filters.to) return false
        return true
      })
      .sort(compareTransactions)
  }, [records, filters, dateRangeInvalid])

  const storageBlocked = records === null
  const filtersActive =
    filters.query.trim() !== '' ||
    filters.type !== 'all' ||
    filters.categoryId !== 'all' ||
    filters.from !== '' ||
    filters.to !== ''

  function clearFilters() {
    setFilters({ ...EMPTY_FILTERS })
  }

  function focusAddForm() {
    if (editingId) resetForm()
    setPendingDeleteId(null)
    const formEl = document.getElementById('transaction-form')
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    formEl?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' })
    formEl?.querySelector('input[name="amount"]')?.focus()
  }

  return (
    <section className="transactions" aria-labelledby="section-title">
      <PageHeader
        icon="transactions"
        variant="standard"
        title="Transactions"
        tagline={PAGE_TAGLINES.transactions}
        description="Add entries quickly, filter your history, and edit or remove anything you have saved here."
      >
        {!storageBlocked && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={focusAddForm}
            disabled={submitting}
          >
            Add transaction
          </button>
        )}
      </PageHeader>

      {loadError && (
        <div className="form-alert" role="alert">
          <p>{storageErrorMessage(loadError)}</p>
          <button type="button" className="btn" onClick={() => applyRead(readTransactions())}>
            Try again
          </button>
        </div>
      )}

      {customState.error && (
        <div className="form-alert" role="alert">
          <p>
            Custom categories could not be read. Built-in categories are still available, and saved
            transactions were left unchanged.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const result = readCategories()
              setCustomState((current) =>
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

      {storageBlocked ? null : (
        <>
          <form
            id="transaction-form"
            className={`transaction-form transaction-panel transaction-panel--form${
              editingId ? ' transaction-form--editing' : ''
            }`}
            onSubmit={handleSubmit}
          >
            <header className="section-head section-head--in-panel">
              <h2 className="section-head__title">
                {editingId ? 'Edit transaction' : 'Add transaction'}
              </h2>
              <p className="section-head__sub">
                {editingId
                  ? 'Update the fields below, then save changes.'
                  : 'Choose type, amount, date, category, and an optional description.'}
              </p>
            </header>
            {editingId && (
              <p className="txn-editing-notice" role="status">
                You are editing a saved row. Cancel to return to add mode.
              </p>
            )}
            <fieldset className="type-toggle txn-type-toggle">
              <legend>Type</legend>
              <label>
                <input
                  type="radio"
                  name="transaction-type"
                  value="expense"
                  checked={form.type === 'expense'}
                  onChange={() => selectType('expense')}
                />
                Expense
              </label>
              <label>
                <input
                  type="radio"
                  name="transaction-type"
                  value="income"
                  checked={form.type === 'income'}
                  onChange={() => selectType('income')}
                />
                Income
              </label>
            </fieldset>

            <div className="txn-form-fields">
              <div className="form-grid form-grid--3 txn-form-grid">
                <label className="txn-field txn-field--amount">
                  Amount (₹)
                  <input
                    name="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    value={form.amount}
                    aria-invalid={formErrors.length > 0 ? true : undefined}
                    aria-describedby={formErrors.length > 0 ? 'transaction-form-errors' : undefined}
                    onChange={(event) => updateField('amount', event.target.value)}
                  />
                </label>
                <label className="txn-field txn-field--date">
                  Date
                  <input
                    name="date"
                    type="date"
                    required
                    value={form.date}
                    onChange={(event) => updateField('date', event.target.value)}
                  />
                </label>
                <label className="txn-field txn-field--category">
                  Category
                  <select
                    name="category"
                    value={form.categoryId}
                    onChange={(event) => updateField('categoryId', event.target.value)}
                  >
                    {formCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <DescriptionDictation
              ref={dictationRef}
              key={editingId ?? 'new'}
              value={form.description}
              disabled={submitting}
              onChange={(description) => updateField('description', description)}
            />

            {formErrors.length > 0 && (
              <div className="form-alert" role="alert" id="transaction-form-errors">
                {formErrors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {editingId ? 'Save changes' : 'Add transaction'}
              </button>
              {editingId && (
                <button type="button" className="btn" onClick={resetForm} disabled={submitting}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>

          {actionError && (
            <div className="form-alert" role="alert">
              <p>{actionError}</p>
            </div>
          )}

          <div className="transaction-list transaction-panel transaction-panel--list">
            <header className="transactions-list-head transactions-list-head--toolbar">
              <div className="transactions-list-head-copy section-head section-head--in-panel">
                <h2 className="section-head__title">Saved transactions</h2>
                <p className="section-head__sub">
                  {visible.length} {visible.length === 1 ? 'row' : 'rows'} shown
                  {records.length !== visible.length
                    ? ` of ${records.length} saved`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                className={`btn transactions-filter-toggle${
                  filtersActive ? ' transactions-filter-toggle--active' : ''
                }`}
                aria-expanded={filtersOpen}
                aria-controls="transaction-filters-panel"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <FilterIcon />
                <span>Filter</span>
                {filtersActive ? (
                  <span className="transactions-filter-toggle-badge" aria-hidden="true">
                    On
                  </span>
                ) : null}
              </button>
            </header>

            <div
              id="transaction-filters-panel"
              className={`transactions-filters-panel${
                filtersActive ? ' transactions-filters-panel--active' : ''
              }`}
              role="search"
              aria-label="Search and filter saved transactions"
              hidden={!filtersOpen}
            >
              <div className="transactions-filters-panel-inner">
                {filtersActive && (
                  <p className="transactions-filter-hint" role="status">
                    Filters are on — {visible.length} of {records.length} transactions match.
                  </p>
                )}
                <div className="form-grid filters-grid">
                  <label>
                    Search descriptions
                    <input
                      name="search"
                      type="search"
                      value={filters.query}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, query: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Type
                    <select
                      name="filter-type"
                      value={filters.type}
                      onChange={(event) => {
                        const type = event.target.value
                        setFilters((current) => {
                          const options = filterCategoryOptions(
                            type,
                            customState.categories,
                            records ?? [],
                          )
                          const categoryId = options.some((option) => option.id === current.categoryId)
                            ? current.categoryId
                            : 'all'
                          return { ...current, type, categoryId }
                        })
                      }}
                    >
                      <option value="all">All types</option>
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                  </label>
                  <label>
                    Category
                    <select
                      name="filter-category"
                      value={filters.categoryId}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, categoryId: event.target.value }))
                      }
                    >
                      <option value="all">All categories</option>
                      {filterCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    From
                    <input
                      name="from"
                      type="date"
                      value={filters.from}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, from: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    To
                    <input
                      name="to"
                      type="date"
                      value={filters.to}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, to: event.target.value }))
                      }
                    />
                  </label>
                </div>
                {dateRangeInvalid && (
                  <div className="form-alert alert--warning" role="alert">
                    <p>
                      The start date must be on or before the end date. The date range is not
                      applied.
                    </p>
                  </div>
                )}
                {filtersActive && (
                  <div className="transactions-filters-panel-actions">
                    <button type="button" className="btn" onClick={clearFilters}>
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </div>

            {visible.length === 0 ? (
              records.length === 0 ? (
                <div className="transactions-empty transactions-empty--first-use">
                  <h3 className="transactions-empty-title">Start your transaction list</h3>
                  <p className="transactions-empty-body">
                    Record an expense or income entry with the form above, or use{' '}
                    <strong>Add transaction</strong> in the page header. Your saved rows will
                    appear here with dates, categories, and amounts.
                  </p>
                  <button type="button" className="btn btn--primary" onClick={focusAddForm}>
                    Add your first transaction
                  </button>
                </div>
              ) : (
                <div className="transactions-empty transactions-empty--no-match">
                  <h3 className="transactions-empty-title">No matching transactions</h3>
                  <p className="transactions-empty-body">
                    Nothing in your saved history matches the current search or filters. Try a
                    shorter search term, widen the date range, or reset filters to see all rows.
                  </p>
                  <button type="button" className="btn" onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>
              )
            ) : (
              <div className="table-scroll transaction-table-wrap">
                <table className="transaction-table">
                  <caption className="visually-hidden">Saved income and expense transactions</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Type</th>
                      <th scope="col">Category</th>
                      <th scope="col">Description</th>
                      <th scope="col" className="col-amount">
                        Amount
                      </th>
                      <th scope="col" className="col-actions">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((transaction) => {
                      const catLabel = categoryLabel(
                        transaction.categoryId,
                        customState.categories,
                      )
                      return (
                      <tr
                        key={transaction.id}
                        className={
                          editingId === transaction.id ? 'transaction-row--editing' : undefined
                        }
                      >
                        <td className="txn-date">{transaction.date}</td>
                        <td>
                          <span
                            className={
                              transaction.type === 'income'
                                ? 'txn-type txn-type--income'
                                : 'txn-type txn-type--expense'
                            }
                          >
                            {transaction.type === 'income' ? 'Income' : 'Expense'}
                          </span>
                        </td>
                        <td className="txn-category">
                          <span className="txn-category-inner">
                            <span className="txn-category-icon" aria-hidden="true">
                              <CategoryExpenseIcon
                                categoryId={transaction.categoryId}
                                customCategories={customState.categories}
                              />
                            </span>
                            <span className="txn-category-label">{catLabel}</span>
                          </span>
                        </td>
                        <td className="txn-description">{transaction.description || '—'}</td>
                        <td
                          className={`amount col-amount ${transaction.type === 'income' ? 'amount--income' : 'amount--expense'}`}
                        >
                          {formatInrFromPaise(transaction.amountPaise)}
                        </td>
                        <td className="col-actions">
                          {pendingDeleteId === transaction.id ? (
                            <div className="row-actions row-actions--confirm">
                              <p className="row-actions-prompt">Delete this transaction?</p>
                              <button
                                type="button"
                                className="btn btn--danger"
                                disabled={submitting}
                                onClick={() => confirmDelete(transaction.id)}
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
                            </div>
                          ) : (
                            <div className="row-actions row-actions--icons">
                              <button
                                type="button"
                                className="btn btn--icon"
                                aria-label={`Edit transaction on ${transaction.date}, ${catLabel}`}
                                title="Edit transaction"
                                disabled={submitting}
                                onClick={() => startEdit(transaction)}
                              >
                                <BudgetRowIcon name="edit" />
                              </button>
                              <button
                                type="button"
                                className="btn btn--icon btn--danger"
                                aria-label={`Delete transaction on ${transaction.date}, ${catLabel}`}
                                title="Delete transaction"
                                disabled={submitting}
                                onClick={() => setPendingDeleteId(transaction.id)}
                              >
                                <BudgetRowIcon name="delete" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

export default TransactionsSection
