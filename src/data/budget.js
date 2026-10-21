import { createTransactionId } from './transaction.js'
import { isCategoryIdAllowedForTransaction } from '../transactions/categories.js'

const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/
const CATEGORY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/
const FIELDS = ['id', 'month', 'categoryId', 'limitPaise', 'createdAt', 'updatedAt']
const EDITABLE_FIELDS = ['month', 'categoryId', 'limitPaise']

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP_PATTERN.test(value)) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function timestampFrom(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now.toISOString()
  return ''
}

export function isBudgetMonthKey(value) {
  if (typeof value !== 'string') return false
  const match = MONTH_PATTERN.exec(value)
  if (!match) return false
  const month = Number(match[2])
  return month >= 1 && month <= 12
}

function budgetShapeErrors(value) {
  const errors = []
  if (!isRecord(value)) {
    return ['Budget must be an object.']
  }
  const keys = Object.keys(value)
  if (keys.length !== FIELDS.length || FIELDS.some((field) => !Object.hasOwn(value, field))) {
    errors.push('Budget must contain only the expected fields.')
  }
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) {
    errors.push('Budget id must be a UUID.')
  }
  if (!isBudgetMonthKey(value.month)) {
    errors.push('Month must be a calendar month in YYYY-MM form.')
  }
  if (typeof value.categoryId !== 'string' || !CATEGORY_ID_PATTERN.test(value.categoryId)) {
    errors.push('Category id must be 1 to 64 letters, numbers, hyphens, or underscores.')
  }
  if (!Number.isSafeInteger(value.limitPaise) || value.limitPaise < 1) {
    errors.push('Limit must be a positive integer number of paise.')
  }
  if (!isTimestamp(value.createdAt)) {
    errors.push('createdAt must be a UTC timestamp.')
  }
  if (!isTimestamp(value.updatedAt)) {
    errors.push('updatedAt must be a UTC timestamp.')
  }
  if (
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    value.updatedAt < value.createdAt
  ) {
    errors.push('updatedAt must not be earlier than createdAt.')
  }
  return errors
}

/** Validates shape and that categoryId is allowed for expense transactions. */
export function validateBudget(value, customCategories = []) {
  const errors = budgetShapeErrors(value)
  if (errors.length > 0) return { ok: false, errors }
  if (!isCategoryIdAllowedForTransaction(value.categoryId, 'expense', customCategories)) {
    return { ok: false, errors: ['Category must be valid for expense transactions.'] }
  }
  return {
    ok: true,
    budget: {
      id: value.id,
      month: value.month,
      categoryId: value.categoryId,
      limitPaise: value.limitPaise,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    },
  }
}

function monthCategoryKey(month, categoryId) {
  return `${month}:${categoryId}`
}

/** Validates list shape, ids, and unique (month, categoryId) pairs. */
export function validateBudgets(value, customCategories = []) {
  if (!Array.isArray(value)) return { ok: false, errors: ['Budgets must be a list.'] }

  const budgets = []
  const seenIds = new Set()
  const seenMonthCategory = new Set()
  const errors = []

  value.forEach((item, index) => {
    const result = validateBudget(item, customCategories)
    if (!result.ok) {
      errors.push(`Budget ${index + 1}: ${result.errors.join(' ')}`)
      return
    }
    if (seenIds.has(result.budget.id)) {
      errors.push(`Budget ${index + 1}: duplicate id.`)
      return
    }
    const pairKey = monthCategoryKey(result.budget.month, result.budget.categoryId)
    if (seenMonthCategory.has(pairKey)) {
      errors.push(`Budget ${index + 1}: duplicate month and category.`)
      return
    }
    seenIds.add(result.budget.id)
    seenMonthCategory.add(pairKey)
    budgets.push(result.budget)
  })

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, budgets }
}

function duplicateMonthCategory(budgets, month, categoryId, ignoreId) {
  return budgets.some(
    (budget) =>
      budget.id !== ignoreId &&
      budget.month === month &&
      budget.categoryId === categoryId,
  )
}

export function createBudget(input, budgets, customCategories = [], now = new Date()) {
  if (!isRecord(input)) return { ok: false, errors: ['Budget input must be an object.'] }
  if (!Array.isArray(budgets)) return { ok: false, errors: ['Budgets must be a list.'] }

  const month = input.month
  const categoryId = input.categoryId
  if (duplicateMonthCategory(budgets, month, categoryId, '')) {
    return { ok: false, errors: ['A budget for this month and category already exists.'] }
  }

  return validateBudget(
    {
      id: createTransactionId(),
      month,
      categoryId,
      limitPaise: input.limitPaise,
      createdAt: timestampFrom(now),
      updatedAt: timestampFrom(now),
    },
    customCategories,
  )
}

export function updateBudget(existing, changes, budgets, customCategories = [], now = new Date()) {
  const current = validateBudget(existing, customCategories)
  if (!current.ok) return current
  if (!isRecord(changes)) return { ok: false, errors: ['Budget changes must be an object.'] }
  if (!Array.isArray(budgets)) return { ok: false, errors: ['Budgets must be a list.'] }

  const next = { ...current.budget, updatedAt: timestampFrom(now) }
  for (const field of EDITABLE_FIELDS) {
    if (!Object.hasOwn(changes, field)) continue
    next[field] = changes[field]
  }

  if (
    duplicateMonthCategory(budgets, next.month, next.categoryId, current.budget.id)
  ) {
    return { ok: false, errors: ['A budget for this month and category already exists.'] }
  }

  return validateBudget(next, customCategories)
}

export function deleteBudget(budgets, id) {
  if (!Array.isArray(budgets)) return { ok: false, errors: ['Budgets must be a list.'] }
  if (typeof id !== 'string' || id === '') {
    return { ok: false, errors: ['Budget id is required.'] }
  }
  const next = budgets.filter((budget) => budget.id !== id)
  if (next.length === budgets.length) {
    return { ok: false, errors: ['Budget was not found.'] }
  }
  return { ok: true, budgets: next }
}
