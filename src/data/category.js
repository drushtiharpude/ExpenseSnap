import { createTransactionId } from './transaction.js'
import { PREDEFINED_CATEGORIES } from '../transactions/categories.js'
import {
  defaultCategoryIconId,
  isValidCategoryIconId,
} from '../transactions/categoryIcons.js'

const TYPES = new Set(['income', 'expense'])
const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/
const FIELDS = ['id', 'type', 'name', 'iconId', 'createdAt', 'updatedAt']
const LEGACY_FIELDS = ['id', 'type', 'name', 'createdAt', 'updatedAt']
const MAX_NAME_LENGTH = 40
const PREDEFINED_IDS = new Set(PREDEFINED_CATEGORIES.map((category) => category.id))
const PREDEFINED_NAMES = new Set(
  PREDEFINED_CATEGORIES.map((category) => category.label.toLocaleLowerCase()),
)

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

export function categoryNameError(name, type, categories, ignoreId) {
  if (typeof name !== 'string') return 'Enter a category name.'
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > MAX_NAME_LENGTH || hasControlChar(trimmed)) {
    return 'Enter a category name up to 40 characters.'
  }
  const key = trimmed.toLocaleLowerCase()
  if (PREDEFINED_NAMES.has(key)) return 'That name is already used by a built-in category.'
  const duplicate = categories.some(
    (category) =>
      category.id !== ignoreId &&
      category.type === type &&
      category.name.toLocaleLowerCase() === key,
  )
  if (duplicate) return 'That category already exists for this type.'
  return ''
}

function normalizeCategoryFields(value) {
  const keys = Object.keys(value)
  const allowed = new Set(FIELDS)
  if (keys.some((key) => !allowed.has(key))) {
    return { ok: false, errors: ['Category must contain only the expected fields.'] }
  }
  if (!LEGACY_FIELDS.every((field) => Object.hasOwn(value, field))) {
    return { ok: false, errors: ['Category must contain only the expected fields.'] }
  }
  const hasIconId = Object.hasOwn(value, 'iconId')
  const expectedKeyCount = hasIconId ? FIELDS.length : LEGACY_FIELDS.length
  if (keys.length !== expectedKeyCount) {
    return { ok: false, errors: ['Category must contain only the expected fields.'] }
  }

  let iconId = defaultCategoryIconId(value.type)
  if (hasIconId) {
    if (!isValidCategoryIconId(value.iconId)) {
      return { ok: false, errors: ['Category iconId must be a supported icon.'] }
    }
    iconId = value.iconId
  }

  return {
    ok: true,
    category: {
      id: value.id,
      type: value.type,
      name: value.name,
      iconId,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    },
  }
}

export function validateCategory(value) {
  if (!isRecord(value)) return { ok: false, errors: ['Category must be an object.'] }

  const errors = []
  const normalized = normalizeCategoryFields(value)
  if (!normalized.ok) return normalized

  const category = normalized.category
  if (typeof category.id !== 'string' || !ID_PATTERN.test(category.id) || PREDEFINED_IDS.has(category.id)) {
    errors.push('Category id must be a UUID that is separate from its name.')
  }
  if (!TYPES.has(category.type)) errors.push('Category type must be income or expense.')
  if (
    typeof category.name !== 'string' ||
    category.name.trim() !== category.name ||
    category.name.length < 1 ||
    category.name.length > MAX_NAME_LENGTH ||
    hasControlChar(category.name)
  ) {
    errors.push('Category name must be text up to 40 characters.')
  }
  if (!isTimestamp(category.createdAt)) errors.push('createdAt must be a UTC timestamp.')
  if (!isTimestamp(category.updatedAt)) errors.push('updatedAt must be a UTC timestamp.')
  if (
    isTimestamp(category.createdAt) &&
    isTimestamp(category.updatedAt) &&
    category.updatedAt < category.createdAt
  ) {
    errors.push('updatedAt must not be earlier than createdAt.')
  }
  if (errors.length > 0) return { ok: false, errors }

  return { ok: true, category }
}

export function validateCategories(value) {
  if (!Array.isArray(value)) return { ok: false, errors: ['Categories must be a list.'] }

  const categories = []
  const seenIds = new Set()
  const seenNames = new Set()
  const errors = []

  value.forEach((item, index) => {
    const result = validateCategory(item)
    if (!result.ok) {
      errors.push(`Category ${index + 1}: ${result.errors.join(' ')}`)
      return
    }
    const nameKey = `${result.category.type}:${result.category.name.toLocaleLowerCase()}`
    if (seenIds.has(result.category.id)) {
      errors.push(`Category ${index + 1}: duplicate id.`)
      return
    }
    if (seenNames.has(nameKey) || PREDEFINED_NAMES.has(result.category.name.toLocaleLowerCase())) {
      errors.push(`Category ${index + 1}: duplicate name.`)
      return
    }
    seenIds.add(result.category.id)
    seenNames.add(nameKey)
    categories.push(result.category)
  })

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, categories }
}

export function createCategory(input, categories, now = new Date()) {
  if (!isRecord(input)) return { ok: false, errors: ['Category input must be an object.'] }
  const nameError = categoryNameError(input.name, input.type, categories)
  if (nameError) return { ok: false, errors: [nameError] }
  const iconId =
    typeof input.iconId === 'string' && isValidCategoryIconId(input.iconId)
      ? input.iconId
      : defaultCategoryIconId(input.type)
  return validateCategory({
    id: createTransactionId(),
    type: input.type,
    name: input.name.trim(),
    iconId,
    createdAt: timestampFrom(now),
    updatedAt: timestampFrom(now),
  })
}

export function renameCategory(existing, name, categories, now = new Date()) {
  return updateCustomCategory(existing, { name }, categories, now)
}

export function updateCustomCategory(existing, updates, categories, now = new Date()) {
  const current = validateCategory(existing)
  if (!current.ok) return current

  let name = current.category.name
  if (updates?.name !== undefined) {
    const nameError = categoryNameError(updates.name, current.category.type, categories, current.category.id)
    if (nameError) return { ok: false, errors: [nameError] }
    name = updates.name.trim()
  }

  let iconId = current.category.iconId
  if (updates?.iconId !== undefined) {
    if (!isValidCategoryIconId(updates.iconId)) {
      return { ok: false, errors: ['Choose a supported icon.'] }
    }
    iconId = updates.iconId
  }

  return validateCategory({
    ...current.category,
    name,
    iconId,
    updatedAt: timestampFrom(now),
  })
}
