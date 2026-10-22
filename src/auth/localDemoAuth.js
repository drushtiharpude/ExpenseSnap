import {
  sanitizeStoredDisplayName,
  sanitizeStoredMotto,
  validateDisplayName,
  validateMotto,
} from './userProfile.js'

export const USERS_STORAGE_KEY = 'expensesnap.localDemoUsers.v1'
export const SESSION_STORAGE_KEY = 'expensesnap.localDemoSession.v1'

const PBKDF2_ITERATIONS = 120_000
const SALT_BYTES = 16
const MIN_PASSWORD_LENGTH = 8
const MIN_USERNAME_LENGTH = 3
const MAX_USERNAME_LENGTH = 30

/** @typedef {{ id: string, username?: string, email?: string, salt: string, hash: string, displayName?: string, motto?: string, createdAt?: string }} LocalDemoUserRecord */
/** @typedef {{ version: 1, users: LocalDemoUserRecord[] }} LocalDemoUserStore */

export function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : ''
}

/** Login / duplicate lookup key for a stored record (includes legacy email accounts). */
export function recordLoginName(record) {
  if (typeof record?.username === 'string' && record.username.trim() !== '') {
    return normalizeUsername(record.username)
  }
  if (typeof record?.email === 'string' && record.email.trim() !== '') {
    return record.email.trim().toLowerCase()
  }
  return ''
}

export function validateUsernameFormat(username) {
  const normalized = normalizeUsername(username)
  if (normalized === '') {
    return { ok: false, error: 'Choose a username.' }
  }
  if (normalized.length < MIN_USERNAME_LENGTH) {
    return {
      ok: false,
      error: `Username must be at least ${MIN_USERNAME_LENGTH} characters.`,
    }
  }
  if (normalized.length > MAX_USERNAME_LENGTH) {
    return {
      ok: false,
      error: `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`,
    }
  }
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(normalized)) {
    return {
      ok: false,
      error: 'Use letters, numbers, dots, hyphens, or underscores. Start and end with a letter or number.',
    }
  }
  return { ok: true, username: normalized }
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password === '') {
    return { ok: false, error: 'Enter a password.' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    }
  }
  return { ok: true }
}

export function validateRegistration({ username, password, confirmPassword }) {
  const usernameResult = validateUsernameFormat(username)
  if (!usernameResult.ok) return usernameResult
  const passwordResult = validatePassword(password)
  if (!passwordResult.ok) return passwordResult
  if (password !== confirmPassword) {
    return { ok: false, error: 'Passwords do not match.' }
  }
  return { ok: true, username: usernameResult.username }
}

export function validateLogin({ username, password }) {
  const loginName = normalizeUsername(username)
  if (loginName === '') {
    return { ok: false, error: 'Enter your username.' }
  }
  const passwordResult = validatePassword(password)
  if (!passwordResult.ok) return passwordResult
  return { ok: true, username: loginName }
}

function migrateLegacyUserRecord(record) {
  if (typeof record?.username === 'string' && record.username.trim() !== '') {
    return record
  }
  if (typeof record?.email === 'string' && record.email.trim() !== '') {
    return {
      ...record,
      username: record.email.trim().toLowerCase(),
    }
  }
  return record
}

function readUserStoreRaw() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY)
    if (!raw) return { version: 1, users: [] }
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1 || !Array.isArray(parsed.users)) {
      return { version: 1, users: [] }
    }
    return /** @type {LocalDemoUserStore} */ (parsed)
  } catch {
    return { version: 1, users: [] }
  }
}

function writeUserStore(store) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(store))
}

function readUserStore() {
  const store = readUserStoreRaw()
  let dirty = false
  const users = store.users.map((record) => {
    const migrated = migrateLegacyUserRecord(record)
    if (migrated !== record) dirty = true
    return migrated
  })
  if (dirty) {
    writeUserStore({ version: 1, users })
  }
  return { version: 1, users }
}

function bytesToBase64(bytes) {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function derivePasswordHash(password, saltBase64) {
  const salt = base64ToBytes(saltBase64)
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )
  return bytesToBase64(new Uint8Array(bits))
}

async function hashNewPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const salt = bytesToBase64(saltBytes)
  const hash = await derivePasswordHash(password, salt)
  return { salt, hash }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

function findUserByLoginName(store, loginName) {
  return store.users.find((user) => recordLoginName(user) === loginName) ?? null
}

function profileUserFromRecord(record) {
  const createdAt =
    typeof record?.createdAt === 'string' && !Number.isNaN(Date.parse(record.createdAt))
      ? record.createdAt
      : ''
  return {
    id: record.id,
    username: recordLoginName(record),
    displayName: sanitizeStoredDisplayName(record.displayName),
    motto: sanitizeStoredMotto(record.motto),
    createdAt,
  }
}

export function readLocalDemoSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.userId !== 'string') return null
    const username =
      typeof parsed?.username === 'string'
        ? parsed.username
        : typeof parsed?.email === 'string'
          ? parsed.email
          : null
    if (!username) return null
    return { userId: parsed.userId, username: username.trim().toLowerCase() }
  } catch {
    return null
  }
}

function writeLocalDemoSession(session) {
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ userId: session.userId, username: session.username }),
  )
}

export function clearLocalDemoSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
}

/** @returns {Promise<{ ok: true, user: { id: string, username: string } } | { ok: false, error: string }>} */
export async function registerLocalDemoUser(username, password, confirmPassword) {
  const validation = validateRegistration({ username, password, confirmPassword })
  if (!validation.ok) return validation

  const store = readUserStore()
  if (findUserByLoginName(store, validation.username)) {
    return { ok: false, error: 'That username is already taken. Try another or log in.' }
  }

  try {
    const { salt, hash } = await hashNewPassword(password)
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    store.users.push({ id, username: validation.username, salt, hash, createdAt })
    writeUserStore(store)
    writeLocalDemoSession({ userId: id, username: validation.username })
    return {
      ok: true,
      user: { id, username: validation.username, displayName: '', motto: '', createdAt },
    }
  } catch {
    return { ok: false, error: 'Could not create account on this device. Try again.' }
  }
}

/** @returns {Promise<{ ok: true, user: { id: string, username: string } } | { ok: false, error: string }>} */
export async function signInLocalDemoUser(username, password) {
  const validation = validateLogin({ username, password })
  if (!validation.ok) return validation

  const store = readUserStore()
  const record = findUserByLoginName(store, validation.username)
  if (!record) {
    return { ok: false, error: 'Username or password is incorrect.' }
  }

  try {
    const hash = await derivePasswordHash(password, record.salt)
    if (!timingSafeEqual(hash, record.hash)) {
      return { ok: false, error: 'Username or password is incorrect.' }
    }
    const canonicalUsername = recordLoginName(record)
    writeLocalDemoSession({ userId: record.id, username: canonicalUsername })
    return { ok: true, user: profileUserFromRecord(record) }
  } catch {
    return { ok: false, error: 'Could not sign in on this device. Try again.' }
  }
}

/** @returns {{ ok: true } | { ok: false, error: string }} */
export function signOutLocalDemoUser() {
  try {
    clearLocalDemoSession()
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not sign out. Try again.' }
  }
}

/** Restore session if the user record still exists. */
export function resolveLocalDemoSessionUser() {
  const session = readLocalDemoSession()
  if (!session) return null
  const store = readUserStore()
  const record = store.users.find((user) => user.id === session.userId)
  if (!record) {
    clearLocalDemoSession()
    return null
  }
  const canonicalUsername = recordLoginName(record)
  if (canonicalUsername !== session.username) {
    clearLocalDemoSession()
    return null
  }
  return profileUserFromRecord(record)
}

/**
 * Update display name for the signed-in account only (matched by stable user id).
 * @param {string} userId
 * @param {string} displayName
 */
export function saveDisplayNameForUser(userId, displayName) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    return { ok: false, error: 'You must be signed in to save profile changes.' }
  }
  const validated = validateDisplayName(displayName)
  if (!validated.ok) return validated

  try {
    const store = readUserStore()
    const index = store.users.findIndex((user) => user.id === userId)
    if (index === -1) {
      return { ok: false, error: 'Account could not be found on this device.' }
    }
    const record = store.users[index]
    const next = { ...record }
    if (validated.displayName === '') {
      delete next.displayName
    } else {
      next.displayName = validated.displayName
    }
    store.users[index] = next
    writeUserStore(store)
    return {
      ok: true,
      displayName: validated.displayName,
      user: profileUserFromRecord(next),
    }
  } catch {
    return { ok: false, error: 'Profile could not be saved. Try again.' }
  }
}

/**
 * @param {string} userId
 * @param {string} motto
 */
export function saveMottoForUser(userId, motto) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    return { ok: false, error: 'You must be signed in to save profile changes.' }
  }
  const validated = validateMotto(motto)
  if (!validated.ok) return validated

  try {
    const store = readUserStore()
    const index = store.users.findIndex((user) => user.id === userId)
    if (index === -1) {
      return { ok: false, error: 'Account could not be found on this device.' }
    }
    const record = store.users[index]
    const next = { ...record }
    if (validated.motto === '') {
      delete next.motto
    } else {
      next.motto = validated.motto
    }
    store.users[index] = next
    writeUserStore(store)
    return {
      ok: true,
      motto: validated.motto,
      user: profileUserFromRecord(next),
    }
  } catch {
    return { ok: false, error: 'Profile could not be saved. Try again.' }
  }
}

export { validateDisplayName, validateMotto } from './userProfile.js'

export const LOCAL_DEMO_AUTH_NOTICE =
  'Local demo sign-in only. Accounts and passwords are stored on this browser; anyone with access to this device can read or reset them. This does not secure or isolate your finance data. Not for production.'
