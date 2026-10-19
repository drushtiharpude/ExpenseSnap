const TRANSACTION_TYPES = new Set(['income', 'expense'])
const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/
const CATEGORY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const MAX_DESCRIPTION_LENGTH = 500
const FIELDS = [
  'id',
  'type',
  'amountPaise',
  'date',
  'categoryId',
  'description',
  'createdAt',
  'updatedAt',
]
const EDITABLE_FIELDS = ['type', 'amountPaise', 'date', 'categoryId', 'description']

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCalendarDate(value) {
  if (typeof value !== 'string') return false
  const match = DATE_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1900 || year > 9999) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function hasControlChar(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127) return true
  }
  return false
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

export function createTransactionId() {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (typeof cryptoApi?.getRandomValues !== 'function') return ''

  const bytes = new Uint8Array(16)
  cryptoApi.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function validateTransaction(value) {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Transaction must be an object.'] }
  }

  const errors = []
  const keys = Object.keys(value)
  if (
    keys.length !== FIELDS.length ||
    FIELDS.some((field) => !Object.hasOwn(value, field))
  ) {
    errors.push('Transaction must contain only the expected fields.')
  }

  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) {
    errors.push('Transaction id must be a UUID.')
  }
  if (!TRANSACTION_TYPES.has(value.type)) {
    errors.push('Transaction type must be income or expense.')
  }
  if (!Number.isSafeInteger(value.amountPaise) || value.amountPaise < 1) {
    errors.push('Amount must be a positive integer number of paise.')
  }
  if (!isCalendarDate(value.date)) {
    errors.push('Date must be a real calendar date in YYYY-MM-DD form.')
  }
  if (typeof value.categoryId !== 'string' || !CATEGORY_ID_PATTERN.test(value.categoryId)) {
    errors.push('Category id must be 1 to 64 letters, numbers, hyphens, or underscores.')
  }
  if (
    typeof value.description !== 'string' ||
    value.description.length > MAX_DESCRIPTION_LENGTH ||
    value.description.trim() !== value.description ||
    hasControlChar(value.description)
  ) {
    errors.push('Description must be text up to 500 characters without leading or trailing spaces.')
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

  return {
    ok: true,
    transaction: {
      id: value.id,
      type: value.type,
      amountPaise: value.amountPaise,
      date: value.date,
      categoryId: value.categoryId,
      description: value.description,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    },
  }
}

export function validateTransactions(value) {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['Transactions must be a list.'] }
  }

  const transactions = []
  const seen = new Set()
  const errors = []

  value.forEach((item, index) => {
    const result = validateTransaction(item)
    if (!result.ok) {
      errors.push(`Transaction ${index + 1}: ${result.errors.join(' ')}`)
      return
    }
    if (seen.has(result.transaction.id)) {
      errors.push(`Transaction ${index + 1}: duplicate id.`)
      return
    }
    seen.add(result.transaction.id)
    transactions.push(result.transaction)
  })

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, transactions }
}

export function createTransaction(input, now = new Date()) {
  if (!isRecord(input)) {
    return { ok: false, errors: ['Transaction input must be an object.'] }
  }

  const description = Object.hasOwn(input, 'description') ? input.description : ''
  return validateTransaction({
    id: createTransactionId(),
    type: input.type,
    amountPaise: input.amountPaise,
    date: input.date,
    categoryId: input.categoryId,
    description: typeof description === 'string' ? description.trim() : description,
    createdAt: timestampFrom(now),
    updatedAt: timestampFrom(now),
  })
}

export function updateTransaction(existing, changes, now = new Date()) {
  const current = validateTransaction(existing)
  if (!current.ok) return current
  if (!isRecord(changes)) {
    return { ok: false, errors: ['Transaction changes must be an object.'] }
  }

  const next = { ...current.transaction, updatedAt: timestampFrom(now) }
  for (const field of EDITABLE_FIELDS) {
    if (!Object.hasOwn(changes, field)) continue
    const value = changes[field]
    next[field] = field === 'description' && typeof value === 'string' ? value.trim() : value
  }
  return validateTransaction(next)
}
