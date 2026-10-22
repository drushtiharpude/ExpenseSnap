export const NOTIFICATIONS_STORAGE_KEY = 'expensesnap.notifications.v1'

const STORE_VERSION = 1

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

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.dedupeKey !== 'string' || raw.dedupeKey === '') return null
  if (typeof raw.title !== 'string' || typeof raw.message !== 'string') return null
  if (typeof raw.kind !== 'string') return null
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : raw.dedupeKey,
    dedupeKey: raw.dedupeKey,
    kind: raw.kind,
    title: raw.title,
    message: raw.message,
    createdAt: isTimestamp(raw.createdAt) ? raw.createdAt : new Date(0).toISOString(),
    readAt: isTimestamp(raw.readAt) ? raw.readAt : null,
    dismissedAt: isTimestamp(raw.dismissedAt) ? raw.dismissedAt : null,
  }
}

export function readNotificationStore(storage) {
  const target = resolveStorage(storage)
  if (!target) {
    return { ok: false, error: 'unavailable', items: [] }
  }
  try {
    const raw = target.getItem(NOTIFICATIONS_STORAGE_KEY)
    if (!raw) return { ok: true, items: [] }
    const parsed = JSON.parse(raw)
    if (parsed?.version !== STORE_VERSION || !Array.isArray(parsed.items)) {
      return { ok: true, items: [] }
    }
    const items = parsed.items.map(normalizeItem).filter(Boolean)
    return { ok: true, items }
  } catch {
    return { ok: true, items: [] }
  }
}

export function saveNotificationStore(items, storage) {
  const target = resolveStorage(storage)
  if (!target) {
    return { ok: false, error: 'unavailable' }
  }
  try {
    target.setItem(
      NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify({ version: STORE_VERSION, items }),
    )
    return { ok: true }
  } catch {
    return { ok: false, error: 'quota' }
  }
}

export function visibleNotifications(items) {
  return items.filter((item) => !item.dismissedAt)
}

export function unreadCount(items) {
  return visibleNotifications(items).filter((item) => !item.readAt).length
}

export function markNotificationRead(items, id) {
  const now = new Date().toISOString()
  return items.map((item) =>
    item.id === id && !item.dismissedAt ? { ...item, readAt: item.readAt ?? now } : item,
  )
}

export function dismissNotification(items, id) {
  const now = new Date().toISOString()
  return items.map((item) =>
    item.id === id
      ? { ...item, dismissedAt: now, readAt: item.readAt ?? now }
      : item,
  )
}

export function mergeNotificationCandidates(existingItems, candidates, now = new Date()) {
  const createdAt =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString() : new Date().toISOString()
  const byKey = new Map(existingItems.map((item) => [item.dedupeKey, item]))
  for (const candidate of candidates) {
    if (!candidate?.dedupeKey || byKey.has(candidate.dedupeKey)) continue
    byKey.set(candidate.dedupeKey, {
      id: candidate.dedupeKey,
      dedupeKey: candidate.dedupeKey,
      kind: candidate.kind,
      title: candidate.title,
      message: candidate.message,
      createdAt,
      readAt: null,
      dismissedAt: null,
    })
  }
  return [...byKey.values()].sort(
    (left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
  )
}
