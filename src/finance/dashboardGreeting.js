/** Local-time greeting buckets for the Dashboard welcome line. */
export function timeOfDayGreeting(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Presentation-only label from the stored login id (never written back to storage).
 * @param {string | undefined | null} username Stored session username (demo auth).
 * @returns {string} Display fragment after comma, or empty when unavailable.
 */
export function dashboardDisplayName(username) {
  if (typeof username !== 'string') return ''
  let trimmed = username.trim()
  if (!trimmed) return ''

  if (trimmed.includes('@')) {
    trimmed = trimmed.split('@')[0] ?? trimmed
    trimmed = trimmed.trim()
    if (!trimmed) return ''
  }

  const parts = trimmed.split(/[._-]+/).filter((part) => part.length > 0)
  if (parts.length === 0) return ''

  if (parts.length === 1 && !/[._-]/.test(trimmed)) {
    const token = parts[0]
    if (!/^[a-z0-9]+$/i.test(token) || token.length > 24) return ''
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
  }

  const words = parts
    .filter((part) => /^[a-z0-9]+$/i.test(part))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  if (words.length === 0) return ''

  const label = words.join(' ')
  return label.length > 40 ? '' : label
}

/**
 * @param {string | undefined | null} displayName Saved profile display name.
 * @param {string | undefined | null} username Login id fallback.
 * @returns {string}
 */
export function resolveDashboardGreetName(displayName, username) {
  if (typeof displayName === 'string') {
    const trimmed = displayName.trim()
    if (trimmed) return trimmed
  }
  return dashboardDisplayName(username)
}

/**
 * @param {string | undefined | null} username
 * @param {Date} [date]
 * @param {string | undefined | null} [displayName]
 */
export function buildDashboardWelcomeLine(username, date = new Date(), displayName) {
  const greeting = timeOfDayGreeting(date)
  const name = resolveDashboardGreetName(displayName, username)
  if (!name) return greeting
  return `${greeting}, ${name}`
}

export const DASHBOARD_WELCOME_NUDGE =
  'Small, steady habits make your month easier to read.'

export const DASHBOARD_HEADER_SUBTITLE =
  "Your money, your progress. Here's your financial snapshot."

/** Long-form date for the Dashboard header (local time). */
export function formatDashboardHeaderDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}
