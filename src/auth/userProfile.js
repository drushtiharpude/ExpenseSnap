import { dashboardDisplayName, resolveDashboardGreetName } from '../finance/dashboardGreeting.js'

export const MAX_DISPLAY_NAME_LENGTH = 40
export const MAX_MOTTO_LENGTH = 100

/**
 * @param {unknown} displayName
 * @returns {{ ok: true, displayName: string } | { ok: false, error: string }}
 */
export function validateDisplayName(displayName) {
  if (displayName === undefined || displayName === null) {
    return { ok: true, displayName: '' }
  }
  if (typeof displayName !== 'string') {
    return { ok: false, error: 'Display name must be text.' }
  }
  const trimmed = displayName.trim()
  if (trimmed === '') {
    return { ok: true, displayName: '' }
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
    }
  }
  if (!/^[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N} '.-]*[\p{L}\p{M}\p{N}.']|[\p{L}\p{M}\p{N}])$/u.test(trimmed)) {
    return {
      ok: false,
      error: "Use letters, numbers, spaces, or simple punctuation ( ' - . ).",
    }
  }
  return { ok: true, displayName: trimmed }
}

/**
 * @param {unknown} stored
 * @returns {string}
 */
export function sanitizeStoredDisplayName(stored) {
  if (typeof stored !== 'string') return ''
  const validated = validateDisplayName(stored)
  return validated.ok ? validated.displayName : ''
}

/**
 * @param {string | undefined | null} displayName
 * @param {string | undefined | null} username
 */
export function profilePublicName(displayName, username) {
  return resolveDashboardGreetName(displayName, username) || dashboardDisplayName(username) || 'Profile'
}

/**
 * @param {string | undefined | null} displayName
 * @param {string | undefined | null} username
 */
/**
 * @param {unknown} motto
 * @returns {{ ok: true, motto: string } | { ok: false, error: string }}
 */
export function validateMotto(motto) {
  if (motto === undefined || motto === null) {
    return { ok: true, motto: '' }
  }
  if (typeof motto !== 'string') {
    return { ok: false, error: 'Motto must be text.' }
  }
  const trimmed = motto.trim()
  if (trimmed === '') {
    return { ok: true, motto: '' }
  }
  if (trimmed.length > MAX_MOTTO_LENGTH) {
    return {
      ok: false,
      error: `Motto must be ${MAX_MOTTO_LENGTH} characters or fewer.`,
    }
  }
  for (const char of trimmed) {
    const code = char.charCodeAt(0)
    if (code < 32) {
      return { ok: false, error: 'Motto contains unsupported characters.' }
    }
  }
  return { ok: true, motto: trimmed }
}

/**
 * @param {unknown} stored
 * @returns {string}
 */
export function sanitizeStoredMotto(stored) {
  if (typeof stored !== 'string') return ''
  const validated = validateMotto(stored)
  return validated.ok ? validated.motto : ''
}

export function profileAvatarInitials(displayName, username) {
  const label = profilePublicName(displayName, username)
  if (!label || label === 'Profile') return '?'
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
  }
  const token = parts[0]
  return token.length >= 2 ? token.slice(0, 2).toUpperCase() : token.charAt(0).toUpperCase()
}
