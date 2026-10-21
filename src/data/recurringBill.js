import { createTransactionId } from './transaction.js'
import { isCategoryIdAllowedForTransaction } from '../transactions/categories.js'

const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const CATEGORY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/
export const RECURRING_FREQUENCIES = new Set(['weekly', 'monthly', 'yearly'])
export const RECURRING_STATUSES = new Set(['active', 'paused'])
export const MAX_RECURRING_TITLE_LENGTH = 128

const FIELDS = [
  'id',
  'title',
  'amountPaise',
  'categoryId',
  'frequency',
  'nextDueDate',
  'status',
  'lastPaidDueDate',
  'createdAt',
  'updatedAt',
]
const EDITABLE_FIELDS = [
  'title',
  'amountPaise',
  'categoryId',
  'frequency',
  'nextDueDate',
  'status',
]

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

/** Real calendar date in local semantics (YYYY-MM-DD). */
export function isCalendarDateString(value) {
  if (typeof value !== 'string') return false
  const match = DATE_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1900 || year > 9999) return false
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  )
}

function hasControlChar(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127) return true
  }
  return false
}

function normalizeNullableDate(value) {
  if (value === null) return null
  if (typeof value === 'string' && isCalendarDateString(value)) return value
  return undefined
}

export function validateRecurringBill(value, customCategories = []) {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Recurring bill must be an object.'] }
  }

  const errors = []
  const keys = Object.keys(value)
  if (keys.length !== FIELDS.length || FIELDS.some((field) => !Object.hasOwn(value, field))) {
    errors.push('Recurring bill must contain only the expected fields.')
  }

  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) {
    errors.push('Recurring bill id must be a UUID.')
  }
  if (
    typeof value.title !== 'string' ||
    value.title.length < 1 ||
    value.title.length > MAX_RECURRING_TITLE_LENGTH ||
    hasControlChar(value.title)
  ) {
    errors.push('Title must be 1 to 128 characters without control characters.')
  }
  if (!Number.isSafeInteger(value.amountPaise) || value.amountPaise < 1) {
    errors.push('Amount must be a positive integer number of paise.')
  }
  if (typeof value.categoryId !== 'string' || !CATEGORY_ID_PATTERN.test(value.categoryId)) {
    errors.push('Category id must be 1 to 64 letters, numbers, hyphens, or underscores.')
  }
  if (!RECURRING_FREQUENCIES.has(value.frequency)) {
    errors.push('Frequency must be weekly, monthly, or yearly.')
  }
  if (!isCalendarDateString(value.nextDueDate)) {
    errors.push('Next due date must be a real calendar date in YYYY-MM-DD form.')
  }
  if (!RECURRING_STATUSES.has(value.status)) {
    errors.push('Status must be active or paused.')
  }
  const lastPaid = normalizeNullableDate(value.lastPaidDueDate)
  if (lastPaid === undefined) {
    errors.push('lastPaidDueDate must be null or a valid YYYY-MM-DD date.')
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

  if (errors.length > 0) return { ok: false, errors }

  if (!isCategoryIdAllowedForTransaction(value.categoryId, 'expense', customCategories)) {
    return { ok: false, errors: ['Category must be valid for expense transactions.'] }
  }

  return {
    ok: true,
    bill: {
      id: value.id,
      title: value.title.trim(),
      amountPaise: value.amountPaise,
      categoryId: value.categoryId,
      frequency: value.frequency,
      nextDueDate: value.nextDueDate,
      status: value.status,
      lastPaidDueDate: lastPaid,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    },
  }
}

export function validateRecurringBills(value, customCategories = []) {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['Recurring bills must be a list.'] }
  }

  const bills = []
  const seen = new Set()
  const errors = []

  value.forEach((item, index) => {
    const result = validateRecurringBill(item, customCategories)
    if (!result.ok) {
      errors.push(`Recurring bill ${index + 1}: ${result.errors.join(' ')}`)
      return
    }
    if (seen.has(result.bill.id)) {
      errors.push(`Recurring bill ${index + 1}: duplicate id.`)
      return
    }
    seen.add(result.bill.id)
    bills.push(result.bill)
  })

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, bills }
}

export function createRecurringBill(input, customCategories = [], now = new Date()) {
  if (!isRecord(input)) {
    return { ok: false, errors: ['Recurring bill input must be an object.'] }
  }
  return validateRecurringBill(
    {
      id: createTransactionId(),
      title: typeof input.title === 'string' ? input.title : '',
      amountPaise: input.amountPaise,
      categoryId: input.categoryId,
      frequency: input.frequency,
      nextDueDate: input.nextDueDate,
      status: input.status ?? 'active',
      lastPaidDueDate: null,
      createdAt: timestampFrom(now),
      updatedAt: timestampFrom(now),
    },
    customCategories,
  )
}

export function updateRecurringBill(existing, changes, customCategories = [], now = new Date()) {
  const current = validateRecurringBill(existing, customCategories)
  if (!current.ok) return current
  if (!isRecord(changes)) {
    return { ok: false, errors: ['Recurring bill changes must be an object.'] }
  }

  const next = { ...current.bill, updatedAt: timestampFrom(now) }
  for (const field of EDITABLE_FIELDS) {
    if (!Object.hasOwn(changes, field)) continue
    next[field] =
      field === 'title' && typeof changes[field] === 'string' ? changes[field].trim() : changes[field]
  }
  return validateRecurringBill(next, customCategories)
}
