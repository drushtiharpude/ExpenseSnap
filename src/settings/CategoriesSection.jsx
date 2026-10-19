import { useRef, useState } from 'react'
import { createCategory, renameCategory } from '../data/category.js'
import { readCategories, saveCategories } from '../data/categoryStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { PREDEFINED_CATEGORIES } from '../transactions/categories.js'
import BackupRestoreSection from './BackupRestoreSection.jsx'
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

function CategoriesSection() {
  const [storageState, setStorageState] = useState(readCategoryState)
  const [draft, setDraft] = useState({ name: '', type: 'expense' })
  const [formErrors, setFormErrors] = useState([])
  const [actionError, setActionError] = useState(null)
  const [renameId, setRenameId] = useState(null)
  const [renameName, setRenameName] = useState('')
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
    const created = createCategory({ name: draft.name, type: draft.type }, current.categories)
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
    setDraft({ name: '', type: draft.type })
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
    const renamed = renameCategory(existing, renameName, current.categories)
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
      <section className="category-group settings-panel" aria-labelledby={`${type}-categories`}>
        <h2 id={`${type}-categories`}>{title}</h2>
        <ul>
          {predefined.map((category) => (
            <li key={category.id} className="category-row category-row--builtin">
              <span className="category-row-name">{category.label}</span>
              <span className="category-badge category-badge--builtin">Built-in</span>
            </li>
          ))}
          {custom.map((category) => (
            <li key={category.id} className="category-row category-row--custom">
              {renameId === category.id ? (
                <>
                  <label>
                    Category name
                    <input
                      value={renameName}
                      maxLength={40}
                      onChange={(event) => setRenameName(event.target.value)}
                    />
                  </label>
                  <button type="button" className="btn btn--primary" disabled={submitting} onClick={() => saveRename(category)}>
                    Save name
                  </button>
                  <button type="button" className="btn" disabled={submitting} onClick={() => setRenameId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="category-row-name">{category.name}</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setRenameId(category.id)
                      setRenameName(category.name)
                      setPendingDeleteId(null)
                      setActionError(null)
                    }}
                  >
                    Rename
                  </button>
                  {pendingDeleteId === category.id ? (
                    <>
                      <span>Delete this unused category?</span>
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
                    </>
                  ) : (
                    <button type="button" className="btn btn--danger" onClick={() => requestDelete(category)}>
                      Delete
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section className="category-settings" aria-labelledby="section-title">
      <header className="settings-header">
        <h1 id="section-title">Settings</h1>
        <p className="settings-lead">
          Custom categories are saved in this browser. Built-in categories stay available.
        </p>
      </header>

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
        <>
          <form className="category-form settings-panel" onSubmit={handleAdd}>
            <h2>Add a category</h2>
            <fieldset className="type-toggle category-type-toggle">
              <legend>Type</legend>
              <label>
                <input
                  type="radio"
                  name="category-type"
                  value="expense"
                  checked={draft.type === 'expense'}
                  onChange={() => setDraft((current) => ({ ...current, type: 'expense' }))}
                />
                Expense
              </label>
              <label>
                <input
                  type="radio"
                  name="category-type"
                  value="income"
                  checked={draft.type === 'income'}
                  onChange={() => setDraft((current) => ({ ...current, type: 'income' }))}
                />
                Income
              </label>
            </fieldset>
            <label>
              Name
              <input
                name="category-name"
                maxLength={40}
                required
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            {formErrors.length > 0 && (
              <div className="category-alert" role="alert">
                {formErrors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            )}
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              Add category
            </button>
          </form>

          {actionError && (
            <div className="category-alert" role="alert">
              <p>{actionError}</p>
            </div>
          )}

          {renderGroup('expense', 'Expense categories')}
          {renderGroup('income', 'Income categories')}
        </>
      )}

      <BackupRestoreSection
        onRestored={({ categories: restoredCategories }) => {
          setStorageState({ categories: restoredCategories, error: null })
          setFormErrors([])
          setActionError(null)
          setRenameId(null)
          setRenameName('')
          setPendingDeleteId(null)
        }}
      />
    </section>
  )
}

export default CategoriesSection
