import { useRef, useState } from 'react'
import { createCategory, updateCustomCategory } from '../data/category.js'
import { readBudgets } from '../data/budgetStore.js'
import { readRecurringBills } from '../data/recurringBillStore.js'
import { readCategories, saveCategories } from '../data/categoryStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { PREDEFINED_CATEGORIES } from '../transactions/categories.js'
import { CATEGORY_ICON_OPTIONS, defaultCategoryIconId } from '../transactions/categoryIcons.js'
import PageHeader from '../ui/PageHeader.jsx'
import { CategoryExpenseIcon } from '../ui/shellIcons.jsx'
import { PAGE_TAGLINES } from '../ui/pageHeaderCopy.js'
import TransactionExportSection from './TransactionExportSection.jsx'
import ThemeSection from './ThemeSection.jsx'
import './CategoriesSection.css'

function storageErrorMessage(result, noun) {
  if (result.error === 'unavailable') {
    return `Browser storage is unavailable. Existing ${noun} were left unchanged.`
  }
  if (result.error === 'malformed') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `Saved ${noun} could not be read. They were left unchanged.${detail}`
  }
  if (result.error === 'quota') return 'Browser storage is full. This change was not saved.'
  if (result.error === 'invalid' && Array.isArray(result.errors)) return result.errors.join(' ')
  return `This change could not be saved. Existing ${noun} were left unchanged.`
}

function readCategoryState() {
  const result = readCategories()
  if (result.ok) return { categories: result.categories, error: null }
  return { categories: null, error: result }
}

function recurringBillDeleteBlock(categoryId, customCategories) {
  const bills = readRecurringBills(undefined, { customCategories })
  if (!bills.ok) {
    return {
      blocked: true,
      message: `${storageErrorMessage(bills, 'recurring bills')} This category was not deleted.`,
    }
  }
  if (bills.bills.some((bill) => bill.categoryId === categoryId)) {
    return {
      blocked: true,
      message:
        'This category is used by a recurring bill, so it was not deleted. Remove or change that bill first.',
    }
  }
  return { blocked: false, message: null }
}

function CategoryIconPicker({ groupName, value, onChange, legend }) {
  return (
    <fieldset className="category-icon-picker">
      <legend>{legend}</legend>
      <div className="category-icon-picker__grid" role="radiogroup" aria-label={legend}>
        {CATEGORY_ICON_OPTIONS.map((option) => (
          <label
            key={option.id}
            className={`category-icon-picker__option${
              value === option.id ? ' category-icon-picker__option--selected' : ''
            }`}
          >
            <input
              type="radio"
              name={groupName}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
            />
            <span className="category-icon-picker__icon" aria-hidden="true">
              <CategoryExpenseIcon iconId={option.id} />
            </span>
            <span className="category-icon-picker__label">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function budgetDeleteBlock(categoryId, customCategories) {
  const budgets = readBudgets(undefined, { customCategories })
  if (!budgets.ok) {
    return {
      blocked: true,
      message: `${storageErrorMessage(budgets, 'monthly budgets')} This category was not deleted.`,
    }
  }
  if (budgets.budgets.some((budget) => budget.categoryId === categoryId)) {
    return {
      blocked: true,
      message:
        'This category is used by a monthly budget, so it was not deleted. Remove or change that budget first.',
    }
  }
  return { blocked: false, message: null }
}

function CategoriesSection({ onStorageRestored: _onStorageRestored }) {
  const [storageState, setStorageState] = useState(readCategoryState)
  const [draft, setDraft] = useState({ name: '', type: 'expense', iconId: 'other' })
  const [formErrors, setFormErrors] = useState([])
  const [actionError, setActionError] = useState(null)
  const [renameId, setRenameId] = useState(null)
  const [renameName, setRenameName] = useState('')
  const [renameIconId, setRenameIconId] = useState('other')
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const categories = storageState.categories

  function finish() {
    submittingRef.current = false
    setSubmitting(false)
  }

  function retry() {
    const result = readCategories()
    setStorageState((current) =>
      result.ok
        ? { categories: result.categories, error: null }
        : { categories: current.categories, error: result },
    )
  }

  function handleAdd(event) {
    event.preventDefault()
    if (submittingRef.current || categories === null) return
    submittingRef.current = true
    setSubmitting(true)
    setActionError(null)

    const current = readCategories()
    if (!current.ok) {
      setFormErrors([storageErrorMessage(current, 'categories')])
      finish()
      return
    }
    const created = createCategory(
      { name: draft.name, type: draft.type, iconId: draft.iconId },
      current.categories,
    )
    if (!created.ok) {
      setFormErrors(created.errors)
      finish()
      return
    }
    const saved = saveCategories([...current.categories, created.category])
    if (!saved.ok) {
      setFormErrors([storageErrorMessage(saved, 'categories')])
      finish()
      return
    }
    setStorageState({ categories: saved.categories, error: null })
    setDraft({ name: '', type: draft.type, iconId: defaultCategoryIconId(draft.type) })
    setFormErrors([])
    finish()
  }

  function saveRename(category) {
    if (submittingRef.current || categories === null) return
    submittingRef.current = true
    setSubmitting(true)
    setActionError(null)
    const current = readCategories()
    if (!current.ok) {
      setActionError(storageErrorMessage(current, 'categories'))
      finish()
      return
    }
    const existing = current.categories.find((item) => item.id === category.id)
    if (!existing) {
      setActionError('This category is no longer saved.')
      setStorageState({ categories: current.categories, error: null })
      finish()
      return
    }
    const renamed = updateCustomCategory(
      existing,
      { name: renameName, iconId: renameIconId },
      current.categories,
    )
    if (!renamed.ok) {
      setActionError(renamed.errors.join(' '))
      finish()
      return
    }
    const saved = saveCategories(
      current.categories.map((item) => (item.id === existing.id ? renamed.category : item)),
    )
    if (!saved.ok) {
      setActionError(storageErrorMessage(saved, 'categories'))
      finish()
      return
    }
    setStorageState({ categories: saved.categories, error: null })
    setRenameId(null)
    setRenameName('')
    finish()
  }

  function requestDelete(category) {
    setFormErrors([])
    setRenameId(null)
    const transactions = readTransactions()
    if (!transactions.ok) {
      setActionError(
        `${storageErrorMessage(transactions, 'transactions')} This category was not deleted.`,
      )
      return
    }
    const used = transactions.transactions.some((transaction) => transaction.categoryId === category.id)
    if (used) {
      setPendingDeleteId(null)
      setActionError('This category is used by saved transactions, so it was not deleted.')
      return
    }
    const categoriesForBudgetCheck = readCategories()
    const budgetBlock = budgetDeleteBlock(
      category.id,
      categoriesForBudgetCheck.ok ? categoriesForBudgetCheck.categories : [],
    )
    if (budgetBlock.blocked) {
      setPendingDeleteId(null)
      setActionError(budgetBlock.message)
      return
    }
    setActionError(null)
    setPendingDeleteId(category.id)
  }

  function confirmDelete(category) {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const transactions = readTransactions()
    if (!transactions.ok) {
      setActionError(
        `${storageErrorMessage(transactions, 'transactions')} This category was not deleted.`,
      )
      finish()
      return
    }
    if (transactions.transactions.some((transaction) => transaction.categoryId === category.id)) {
      setActionError('This category is used by saved transactions, so it was not deleted.')
      setPendingDeleteId(null)
      finish()
      return
    }
    const current = readCategories()
    if (!current.ok) {
      setActionError(storageErrorMessage(current, 'categories'))
      finish()
      return
    }
    const recurringBlock = recurringBillDeleteBlock(category.id, current.categories)
    if (recurringBlock.blocked) {
      setActionError(recurringBlock.message)
      setPendingDeleteId(null)
      finish()
      return
    }
    const budgetBlock = budgetDeleteBlock(category.id, current.categories)
    if (budgetBlock.blocked) {
      setActionError(budgetBlock.message)
      setPendingDeleteId(null)
      finish()
      return
    }
    const saved = saveCategories(current.categories.filter((item) => item.id !== category.id))
    if (!saved.ok) {
      setActionError(storageErrorMessage(saved, 'categories'))
      finish()
      return
    }
    setStorageState({ categories: saved.categories, error: null })
    setPendingDeleteId(null)
    setActionError(null)
    finish()
  }

  function renderGroup(type, title) {
    const predefined = PREDEFINED_CATEGORIES.filter(
      (category) => category.type === type || category.type === 'both',
    )
    const custom = categories
      .filter((category) => category.type === type)
      .sort((left, right) => left.name.localeCompare(right.name))

    return (
      <section className="category-group" aria-labelledby={`${type}-categories`}>
        <header className="category-group-head">
          <h3 id={`${type}-categories`} className="category-group-title">
            {title}
          </h3>
          <p className="category-group-sub">
            Built-in names are fixed. Custom entries can be renamed or deleted when nothing references
            them.
          </p>
        </header>
        <ul className="category-list">
          {predefined.map((category) => (
            <li key={category.id} className="category-row category-row--builtin">
              <span className="category-row-leading">
                <span className="category-row-icon" aria-hidden="true">
                  <CategoryExpenseIcon categoryId={category.id} />
                </span>
                <span className="category-row-name">{category.label}</span>
              </span>
              <span className="category-badge category-badge--builtin">Built-in</span>
            </li>
          ))}
          {custom.map((category) => (
            <li key={category.id} className="category-row category-row--custom">
              {renameId === category.id ? (
                <div className="category-row-rename">
                  <label>
                    Category name
                    <input
                      value={renameName}
                      maxLength={40}
                      onChange={(event) => setRenameName(event.target.value)}
                    />
                  </label>
                  <CategoryIconPicker
                    groupName={`category-icon-edit-${category.id}`}
                    legend="Icon"
                    value={renameIconId}
                    onChange={setRenameIconId}
                  />
                  <div className="category-row-actions">
                    <button type="button" className="btn btn--primary" disabled={submitting} onClick={() => saveRename(category)}>
                      Save changes
                    </button>
                    <button type="button" className="btn" disabled={submitting} onClick={() => setRenameId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : pendingDeleteId === category.id ? (
                <>
                  <span className="category-row-leading">
                    <span className="category-row-icon" aria-hidden="true">
                      <CategoryExpenseIcon
                        categoryId={category.id}
                        customCategories={categories}
                      />
                    </span>
                    <span className="category-row-name">{category.name}</span>
                  </span>
                  <div className="category-row-actions category-row-actions--confirm">
                    <p className="category-delete-prompt">Delete this unused category?</p>
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={submitting}
                      onClick={() => confirmDelete(category)}
                    >
                      Confirm delete
                    </button>
                    <button type="button" className="btn" disabled={submitting} onClick={() => setPendingDeleteId(null)}>
                      Keep
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="category-row-leading">
                    <span className="category-row-icon" aria-hidden="true">
                      <CategoryExpenseIcon
                        categoryId={category.id}
                        customCategories={categories}
                      />
                    </span>
                    <span className="category-row-name">{category.name}</span>
                  </span>
                  <div className="category-row-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setRenameId(category.id)
                        setRenameName(category.name)
                        setRenameIconId(category.iconId ?? defaultCategoryIconId(category.type))
                        setPendingDeleteId(null)
                        setActionError(null)
                      }}
                    >
                      Rename
                    </button>
                    <button type="button" className="btn btn--danger" onClick={() => requestDelete(category)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section className="category-settings settings-page" aria-labelledby="section-title">
      <PageHeader
        icon="settings"
        variant="standard"
        title="Settings"
        tagline={PAGE_TAGLINES.settings}
        description="Tune appearance, manage categories, and export transactions—all stored locally in this browser."
      />

      <div className="settings-page-stack">
        <ThemeSection />

        {storageState.error && (
          <div className="category-alert" role="alert">
            <p>{storageErrorMessage(storageState.error, 'categories')}</p>
            <button type="button" className="btn" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {categories === null ? null : (
          <section className="settings-panel settings-panel--categories" aria-labelledby="settings-categories-title">
            <header className="section-head section-head--in-panel">
              <h2 id="settings-categories-title" className="section-head__title">
                Categories
              </h2>
              <p className="section-head__sub">
                Built-in labels cover everyday spending and income. Add custom names when you need
                something more specific.
              </p>
            </header>

            <div className="settings-callout settings-callout--info" role="note">
              <p className="settings-callout-title">When delete is blocked</p>
              <p>
                A custom category cannot be removed while a saved transaction or monthly budget still
                uses it. Remove or reassign those entries first—the app will explain which rule blocked
                deletion.
              </p>
            </div>

            <form className="category-form category-form--add" onSubmit={handleAdd}>
              <header className="category-form-head">
                <h3 className="category-form-title">Add a custom category</h3>
                <p className="category-form-sub">
                  Saved only in this browser. Names must be unique within expense or income types.
                </p>
              </header>
              <div className="category-form-fields">
                <fieldset className="type-toggle category-type-toggle">
                  <legend>Category type</legend>
                  <label>
                    <input
                      type="radio"
                      name="category-type"
                      value="expense"
                      checked={draft.type === 'expense'}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          type: 'expense',
                          iconId: defaultCategoryIconId('expense'),
                        }))
                      }
                    />
                    Expense
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="category-type"
                      value="income"
                      checked={draft.type === 'income'}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          type: 'income',
                          iconId: defaultCategoryIconId('income'),
                        }))
                      }
                    />
                    Income
                  </label>
                </fieldset>
                <label className="category-name-field">
                  Display name
                  <input
                    name="category-name"
                    maxLength={40}
                    required
                    placeholder="e.g. Subscriptions"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>
                <CategoryIconPicker
                  groupName="category-icon-add"
                  legend="Icon"
                  value={draft.iconId}
                  onChange={(iconId) => setDraft((current) => ({ ...current, iconId }))}
                />
              </div>
              {formErrors.length > 0 && (
                <div className="category-alert" role="alert">
                  {formErrors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              )}
              <div className="form-actions category-form-actions">
                <button type="submit" className="btn btn--primary" disabled={submitting}>
                  Add category
                </button>
              </div>
            </form>

            <div className="settings-feedback" aria-live="polite">
              {actionError && (
                <div className="category-alert" role="alert">
                  <p>{actionError}</p>
                </div>
              )}
            </div>

            <div className="settings-category-groups">
              {renderGroup('expense', 'Expense categories')}
              {renderGroup('income', 'Income categories')}
            </div>
          </section>
        )}

        <TransactionExportSection />
      </div>
    </section>
  )
}

export default CategoriesSection
