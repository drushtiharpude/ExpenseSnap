import { createTransactionId } from './transaction.js'
import { isCalendarDateString } from './recurringBill.js'

const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/
export const SAVINGS_ENTRY_TYPES = new Set(['deposit', 'withdrawal'])
export const MAX_SAVINGS_GOAL_NAME_LENGTH = 128
export const MAX_SAVINGS_GOAL_NOTES_LENGTH = 500
export const MAX_SAVINGS_ENTRY_NOTE_LENGTH = 500

const GOAL_FIELDS = [
  'id',
  'name',
  'targetPaise',
  'targetDate',
  'notes',
  'entries',
  'createdAt',
  'updatedAt',
]
const GOAL_EDITABLE_FIELDS = ['name', 'targetPaise', 'targetDate', 'notes']
const ENTRY_FIELDS = ['id', 'type', 'amountPaise', 'date', 'note', 'createdAt']

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

export function goalSavedBalancePaise(entries) {
  if (!Array.isArray(entries)) return null
  let balance = 0
  for (const entry of entries) {
    if (entry.type === 'deposit') balance += entry.amountPaise
    else if (entry.type === 'withdrawal') balance -= entry.amountPaise
    else return null
  }
  return balance
}

export function validateSavingsGoalEntry(value) {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Savings entry must be an object.'] }
  }

  const errors = []
  const keys = Object.keys(value)
  if (keys.length !== ENTRY_FIELDS.length || ENTRY_FIELDS.some((field) => !Object.hasOwn(value, field))) {
    errors.push('Savings entry must contain only the expected fields.')
  }
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) {
    errors.push('Savings entry id must be a UUID.')
  }
  if (!SAVINGS_ENTRY_TYPES.has(value.type)) {
    errors.push('Entry type must be deposit or withdrawal.')
  }
  if (!Number.isSafeInteger(value.amountPaise) || value.amountPaise < 1) {
    errors.push('Amount must be a positive integer number of paise.')
  }
  if (!isCalendarDateString(value.date)) {
    errors.push('Date must be a real calendar date in YYYY-MM-DD form.')
  }
  if (
    typeof value.note !== 'string' ||
    value.note.length > MAX_SAVINGS_ENTRY_NOTE_LENGTH ||
    value.note.trim() !== value.note ||
    hasControlChar(value.note)
  ) {
    errors.push('Note must be text up to 500 characters without leading or trailing spaces.')
  }
  if (!isTimestamp(value.createdAt)) {
    errors.push('createdAt must be a UTC timestamp.')
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    entry: {
      id: value.id,
      type: value.type,
      amountPaise: value.amountPaise,
      date: value.date,
      note: value.note,
      createdAt: value.createdAt,
    },
  }
}

export function validateSavingsGoal(value) {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Savings goal must be an object.'] }
  }

  const errors = []
  const keys = Object.keys(value)
  if (keys.length !== GOAL_FIELDS.length || GOAL_FIELDS.some((field) => !Object.hasOwn(value, field))) {
    errors.push('Savings goal must contain only the expected fields.')
  }
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) {
    errors.push('Savings goal id must be a UUID.')
  }
  if (
    typeof value.name !== 'string' ||
    value.name.length < 1 ||
    value.name.length > MAX_SAVINGS_GOAL_NAME_LENGTH ||
    hasControlChar(value.name)
  ) {
    errors.push('Goal name must be 1 to 128 characters without control characters.')
  }
  if (!Number.isSafeInteger(value.targetPaise) || value.targetPaise < 1) {
    errors.push('Target amount must be a positive integer number of paise.')
  }
  const targetDate = normalizeNullableDate(value.targetDate)
  if (targetDate === undefined) {
    errors.push('targetDate must be null or a valid YYYY-MM-DD date.')
  }
  if (
    typeof value.notes !== 'string' ||
    value.notes.length > MAX_SAVINGS_GOAL_NOTES_LENGTH ||
    value.notes.trim() !== value.notes ||
    hasControlChar(value.notes)
  ) {
    errors.push('Notes must be text up to 500 characters without leading or trailing spaces.')
  }
  if (!Array.isArray(value.entries)) {
    errors.push('entries must be a list.')
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

  const entries = []
  const seenEntryIds = new Set()
  for (let index = 0; index < value.entries.length; index += 1) {
    const entryResult = validateSavingsGoalEntry(value.entries[index])
    if (!entryResult.ok) {
      errors.push(`Entry ${index + 1}: ${entryResult.errors.join(' ')}`)
      continue
    }
    if (seenEntryIds.has(entryResult.entry.id)) {
      errors.push(`Entry ${index + 1}: duplicate id.`)
      continue
    }
    seenEntryIds.add(entryResult.entry.id)
    entries.push(entryResult.entry)
  }

  if (errors.length > 0) return { ok: false, errors }

  const balance = goalSavedBalancePaise(entries)
  if (balance === null || balance < 0) {
    return { ok: false, errors: ['Saved balance cannot be negative.'] }
  }

  return {
    ok: true,
    goal: {
      id: value.id,
      name: value.name.trim(),
      targetPaise: value.targetPaise,
      targetDate,
      notes: value.notes,
      entries,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    },
  }
}

export function validateSavingsGoals(value) {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['Savings goals must be a list.'] }
  }

  const goals = []
  const seen = new Set()
  const errors = []

  value.forEach((item, index) => {
    const result = validateSavingsGoal(item)
    if (!result.ok) {
      errors.push(`Savings goal ${index + 1}: ${result.errors.join(' ')}`)
      return
    }
    if (seen.has(result.goal.id)) {
      errors.push(`Savings goal ${index + 1}: duplicate id.`)
      return
    }
    seen.add(result.goal.id)
    goals.push(result.goal)
  })

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, goals }
}

export function createSavingsGoal(input, now = new Date()) {
  if (!isRecord(input)) {
    return { ok: false, errors: ['Savings goal input must be an object.'] }
  }
  const notes = Object.hasOwn(input, 'notes') && typeof input.notes === 'string' ? input.notes : ''
  const targetDate =
    Object.hasOwn(input, 'targetDate') && input.targetDate !== '' ? input.targetDate : null

  return validateSavingsGoal({
    id: createTransactionId(),
    name: typeof input.name === 'string' ? input.name : '',
    targetPaise: input.targetPaise,
    targetDate,
    notes,
    entries: [],
    createdAt: timestampFrom(now),
    updatedAt: timestampFrom(now),
  })
}

export function updateSavingsGoal(existing, changes, now = new Date()) {
  const current = validateSavingsGoal(existing)
  if (!current.ok) return current
  if (!isRecord(changes)) {
    return { ok: false, errors: ['Savings goal changes must be an object.'] }
  }

  const next = { ...current.goal, updatedAt: timestampFrom(now) }
  for (const field of GOAL_EDITABLE_FIELDS) {
    if (!Object.hasOwn(changes, field)) continue
    if (field === 'name' && typeof changes[field] === 'string') {
      next[field] = changes[field].trim()
    } else if (field === 'targetDate') {
      next[field] = changes[field] === '' ? null : changes[field]
    } else {
      next[field] = changes[field]
    }
  }
  return validateSavingsGoal(next)
}

export function createSavingsGoalEntry(input, now = new Date()) {
  if (!isRecord(input)) {
    return { ok: false, errors: ['Savings entry input must be an object.'] }
  }
  const note = Object.hasOwn(input, 'note') && typeof input.note === 'string' ? input.note : ''
  return validateSavingsGoalEntry({
    id: createTransactionId(),
    type: input.type,
    amountPaise: input.amountPaise,
    date: input.date,
    note,
    createdAt: timestampFrom(now),
  })
}

export function addSavingsGoalEntry(goal, input, now = new Date()) {
  const current = validateSavingsGoal(goal)
  if (!current.ok) return current

  const created = createSavingsGoalEntry(input, now)
  if (!created.ok) return created

  const balance = goalSavedBalancePaise(current.goal.entries)
  const delta =
    created.entry.type === 'deposit' ? created.entry.amountPaise : -created.entry.amountPaise
  if (balance + delta < 0) {
    return { ok: false, errors: ['Withdrawal would make the saved balance negative.'] }
  }

  return validateSavingsGoal({
    ...current.goal,
    entries: [...current.goal.entries, created.entry],
    updatedAt: timestampFrom(now),
  })
}

export function deleteSavingsGoal(goals, goalId, options = {}) {
  if (!Array.isArray(goals)) {
    return { ok: false, errors: ['Savings goals must be a list.'] }
  }
  const goal = goals.find((item) => item.id === goalId)
  if (!goal) return { ok: false, errors: ['Savings goal was not found.'] }
  if (goal.entries.length > 0 && !options.includeHistory) {
    return {
      ok: false,
      errors: [
        'This goal has contribution history. Confirm deletion of the goal and all its entries.',
      ],
    }
  }
  return { ok: true, goals: goals.filter((item) => item.id !== goalId) }
}
