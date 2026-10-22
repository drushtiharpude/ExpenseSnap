/** Per-account migration progress in localStorage (does not replace financial keys). */
export const MIGRATION_STATE_STORAGE_KEY = 'expensesnap.migrationState.v1'

function readStore(storage) {
  try {
    const target = storage ?? globalThis.localStorage
    if (!target?.getItem) return {}
    const raw = target.getItem(MIGRATION_STATE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store, storage) {
  try {
    const target = storage ?? globalThis.localStorage
    if (!target?.setItem) return false
    target.setItem(MIGRATION_STATE_STORAGE_KEY, JSON.stringify(store))
    return true
  } catch {
    return false
  }
}

/** @typedef {'none' | 'previewed' | 'importing' | 'import_failed' | 'import_complete' | 'verified'} MigrationStatus */

/** @returns {object | null} */
export function getMigrationRecord(userId, storage) {
  if (typeof userId !== 'string' || userId === '') return null
  const store = readStore(storage)
  const record = store[userId]
  return record && typeof record === 'object' ? record : null
}

export function saveMigrationRecord(userId, patch, storage) {
  if (typeof userId !== 'string' || userId === '') return { ok: false }
  const store = readStore(storage)
  const previous = store[userId] && typeof store[userId] === 'object' ? store[userId] : {}
  store[userId] = { ...previous, ...patch, updatedAt: new Date().toISOString() }
  return { ok: writeStore(store, storage) }
}

export function getPendingIdempotencyKey(userId, storage) {
  const record = getMigrationRecord(userId, storage)
  return typeof record?.pendingIdempotencyKey === 'string' ? record.pendingIdempotencyKey : null
}

export function createOrReuseIdempotencyKey(userId, storage) {
  const existing = getPendingIdempotencyKey(userId, storage)
  if (existing) return existing
  const key =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `import-${Date.now()}-${Math.random().toString(16).slice(2)}`
  saveMigrationRecord(userId, { pendingIdempotencyKey: key, status: 'importing' }, storage)
  return key
}

export function clearPendingIdempotencyKey(userId, storage) {
  saveMigrationRecord(userId, { pendingIdempotencyKey: null }, storage)
}
