export const PROFILE_MEDIA_STORAGE_KEY = 'expensesnap.localDemoProfileMedia.v1'

/** Max file size accepted before client-side resize. */
export const PROFILE_PHOTO_MAX_INPUT_BYTES = 512 * 1024

/** Max stored base64 payload (approximate cap after resize). */
export const PROFILE_PHOTO_MAX_STORED_BASE64_LENGTH = 140_000

const ALLOWED_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** @typedef {{ version: 1, photos: Record<string, { mime: string, dataBase64: string, updatedAt: string }> }} ProfileMediaStore */

function defaultStore() {
  return /** @type {ProfileMediaStore} */ ({ version: 1, photos: {} })
}

function readStoreRaw(storage) {
  try {
    const raw = storage.getItem(PROFILE_MEDIA_STORAGE_KEY)
    if (!raw) return defaultStore()
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1 || typeof parsed.photos !== 'object' || parsed.photos === null) {
      return defaultStore()
    }
    return /** @type {ProfileMediaStore} */ (parsed)
  } catch {
    return defaultStore()
  }
}

function writeStore(store, storage) {
  try {
    storage.setItem(PROFILE_MEDIA_STORAGE_KEY, JSON.stringify(store))
    return { ok: true }
  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      return { ok: false, error: 'quota', message: 'Browser storage is full. Photo was not saved.' }
    }
    return { ok: false, error: 'unavailable', message: 'Photo could not be saved on this device.' }
  }
}

/**
 * @param {{ mime: string, dataBase64: string }} payload
 */
export function validateProfilePhotoPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'invalid', message: 'Photo data is invalid.' }
  }
  const mime = payload.mime
  const dataBase64 = payload.dataBase64
  if (typeof mime !== 'string' || !ALLOWED_PHOTO_MIMES.has(mime)) {
    return { ok: false, error: 'invalid', message: 'Use a JPEG, PNG, or WebP image.' }
  }
  if (typeof dataBase64 !== 'string' || dataBase64.length < 16) {
    return { ok: false, error: 'invalid', message: 'Photo data is invalid.' }
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(dataBase64)) {
    return { ok: false, error: 'invalid', message: 'Photo data is invalid.' }
  }
  if (dataBase64.length > PROFILE_PHOTO_MAX_STORED_BASE64_LENGTH) {
    return {
      ok: false,
      error: 'too_large',
      message: 'Photo is too large after processing. Try a smaller image.',
    }
  }
  return { ok: true, mime, dataBase64 }
}

/**
 * @param {string} userId
 * @param {Storage} [storage]
 */
export function readProfilePhotoDataUrl(userId, storage = localStorage) {
  if (typeof userId !== 'string' || userId.trim() === '') return null
  const store = readStoreRaw(storage)
  const entry = store.photos[userId]
  if (!entry) return null
  const validated = validateProfilePhotoPayload(entry)
  if (!validated.ok) return null
  return `data:${validated.mime};base64,${validated.dataBase64}`
}

/**
 * @param {string} userId
 * @param {{ mime: string, dataBase64: string }} payload
 * @param {Storage} [storage]
 */
export function saveProfilePhotoForUser(userId, payload, storage = localStorage) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    return { ok: false, error: 'invalid', message: 'You must be signed in to save a photo.' }
  }
  const validated = validateProfilePhotoPayload(payload)
  if (!validated.ok) {
    return { ok: false, error: validated.error, message: validated.message }
  }

  const store = readStoreRaw(storage)
  store.photos[userId] = {
    mime: validated.mime,
    dataBase64: validated.dataBase64,
    updatedAt: new Date().toISOString(),
  }
  const written = writeStore(store, storage)
  if (!written.ok) return { ok: false, error: written.error, message: written.message }
  return {
    ok: true,
    dataUrl: `data:${validated.mime};base64,${validated.dataBase64}`,
  }
}

/**
 * @param {string} userId
 * @param {Storage} [storage]
 */
export function removeProfilePhotoForUser(userId, storage = localStorage) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    return { ok: false, error: 'invalid', message: 'You must be signed in to remove a photo.' }
  }
  const store = readStoreRaw(storage)
  if (!store.photos[userId]) {
    return { ok: true, removed: false }
  }
  delete store.photos[userId]
  const written = writeStore(store, storage)
  if (!written.ok) return { ok: false, error: written.error, message: written.message }
  return { ok: true, removed: true }
}
