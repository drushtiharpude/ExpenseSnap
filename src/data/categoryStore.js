import {
  readCloudCategories,
  readCloudCategoriesRaw,
  saveCloudCategories,
} from './cloudFinanceStore.js'
import { isCloudFinanceActive } from './financeSession.js'
import { validateCategories } from './category.js'

/** Plain JSON in localStorage for this browser profile. It is not encrypted. */
export const CATEGORIES_STORAGE_KEY = 'expensesnap.categories.v1'

function browserStorage() {
  try {
    const storage = globalThis.localStorage
    if (
      !storage ||
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function'
    ) {
      return null
    }
    return storage
  } catch {
    return null
  }
}

function resolveStorage(storage) {
  const target = storage === undefined ? browserStorage() : storage
  if (
    !target ||
    typeof target.getItem !== 'function' ||
    typeof target.setItem !== 'function'
  ) {
    return null
  }
  return target
}

function isQuotaError(error) {
  const name = typeof error?.name === 'string' ? error.name : ''
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error?.code === 22
  )
}

function readRaw(storage) {
  try {
    return { ok: true, raw: storage.getItem(CATEGORIES_STORAGE_KEY) }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

function parseStored(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'malformed' }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'malformed' }
  }
  const validated = validateCategories(parsed)
  if (!validated.ok) return { ok: false, error: 'malformed', errors: validated.errors }
  return { ok: true, categories: validated.categories }
}

export function readCategories(storage) {
  if (storage === undefined && isCloudFinanceActive()) return readCloudCategories()
  const target = resolveStorage(storage)
  if (!target) return { ok: false, error: 'unavailable' }
  const raw = readRaw(target)
  if (!raw.ok) return raw
  if (raw.raw === null) return { ok: true, categories: [] }
  return parseStored(raw.raw)
}

/** Raw string for the key, or null when the key is absent. */
export function readCategoriesStorageRaw(storage) {
  if (storage === undefined && isCloudFinanceActive()) return readCloudCategoriesRaw()
  const target = resolveStorage(storage)
  if (!target) return { ok: false, error: 'unavailable' }
  return readRaw(target)
}

export function restoreCategoriesStorageRaw(storage, raw) {
  const target = resolveStorage(storage)
  if (!target) return { ok: false, error: 'unavailable' }
  try {
    if (raw === null) {
      if (typeof target.removeItem === 'function') target.removeItem(CATEGORIES_STORAGE_KEY)
    } else {
      target.setItem(CATEGORIES_STORAGE_KEY, raw)
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export function saveCategories(categories, storage, options = {}) {
  if (storage === undefined && isCloudFinanceActive()) {
    return saveCloudCategories(categories)
  }
  const validated = validateCategories(categories)
  if (!validated.ok) return { ok: false, error: 'invalid', errors: validated.errors }

  const target = resolveStorage(storage)
  if (!target) return { ok: false, error: 'unavailable' }

  const raw = readRaw(target)
  if (!raw.ok) return raw
  if (raw.raw !== null && !options.recoveryReplace) {
    const existing = parseStored(raw.raw)
    if (!existing.ok) return existing
  }

  try {
    target.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(validated.categories))
  } catch (error) {
    if (isQuotaError(error)) return { ok: false, error: 'quota' }
    return { ok: false, error: 'unavailable' }
  }

  return { ok: true, categories: validated.categories }
}
