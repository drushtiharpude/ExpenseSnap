/** Plain string in localStorage for this browser profile. It is not encrypted. */
export const THEME_STORAGE_KEY = 'expensesnap.theme.v1'

const VALID_THEMES = new Set(['light', 'dark'])
const DEFAULT_THEME = 'light'

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

function parseThemeValue(raw) {
  if (raw === 'light' || raw === 'dark') return raw
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed === 'light' || parsed === 'dark') return parsed
  } catch {
    return null
  }
  return null
}

export function applyTheme(theme) {
  const resolved = VALID_THEMES.has(theme) ? theme : DEFAULT_THEME
  const root = globalThis.document?.documentElement
  if (!root) return resolved
  root.setAttribute('data-theme', resolved)
  root.style.colorScheme = resolved
  return resolved
}

export function readTheme(storage) {
  const target = resolveStorage(storage)
  if (!target) {
    return { ok: false, error: 'unavailable', theme: DEFAULT_THEME }
  }

  let raw
  try {
    raw = target.getItem(THEME_STORAGE_KEY)
  } catch {
    return { ok: false, error: 'unavailable', theme: DEFAULT_THEME }
  }

  if (raw === null) {
    return { ok: true, theme: DEFAULT_THEME, source: 'default' }
  }

  const theme = parseThemeValue(raw)
  if (!theme) {
    return { ok: false, error: 'invalid', theme: DEFAULT_THEME }
  }
  return { ok: true, theme, source: 'saved' }
}

export function saveTheme(theme, storage) {
  if (!VALID_THEMES.has(theme)) {
    return { ok: false, error: 'invalid', theme: DEFAULT_THEME }
  }

  const target = resolveStorage(storage)
  if (!target) {
    return { ok: false, error: 'unavailable', theme }
  }

  try {
    target.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    return { ok: false, error: 'unavailable', theme }
  }

  applyTheme(theme)
  return { ok: true, theme }
}

export function restoreThemeFromStorage(storage) {
  const result = readTheme(storage)
  applyTheme(result.theme)
  return result
}
