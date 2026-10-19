import { validateTransactions } from './transaction.js'

/** Plain JSON in localStorage for this browser profile. It is not encrypted. */
export const TRANSACTIONS_STORAGE_KEY = 'expensesnap.transactions.v1'

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
    return { ok: true, raw: storage.getItem(TRANSACTIONS_STORAGE_KEY) }
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

  const validated = validateTransactions(parsed)
  if (!validated.ok) {
    return { ok: false, error: 'malformed', errors: validated.errors }
  }
  return { ok: true, transactions: validated.transactions }
}

export function readTransactions(storage) {
  const target = resolveStorage(storage)
  if (!target) return { ok: false, error: 'unavailable' }

  const raw = readRaw(target)
  if (!raw.ok) return raw
  if (raw.raw === null) return { ok: true, transactions: [] }
  return parseStored(raw.raw)
}

/** Raw string for the key, or null when the key is absent. */
export function readTransactionsStorageRaw(storage) {
  const target = resolveStorage(storage)
  if (!target) return { ok: false, error: 'unavailable' }
  return readRaw(target)
}

export function restoreTransactionsStorageRaw(storage, raw) {
  const target = resolveStorage(storage)
  if (!target) return { ok: false, error: 'unavailable' }
  try {
    if (raw === null) {
      if (typeof target.removeItem === 'function') target.removeItem(TRANSACTIONS_STORAGE_KEY)
    } else {
      target.setItem(TRANSACTIONS_STORAGE_KEY, raw)
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export function saveTransactions(transactions, storage, options = {}) {
  const validated = validateTransactions(transactions)
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
    target.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(validated.transactions))
  } catch (error) {
    if (isQuotaError(error)) return { ok: false, error: 'quota' }
    return { ok: false, error: 'unavailable' }
  }

  return { ok: true, transactions: validated.transactions }
}
