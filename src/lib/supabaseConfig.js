const URL_ENV = 'VITE_SUPABASE_URL'
const KEY_ENVS = ['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY']

function readEnv(name) {
  const value = import.meta.env[name]
  if (typeof value !== 'string') return ''
  return value.trim()
}

function resolvePublishableKey() {
  for (const name of KEY_ENVS) {
    const value = readEnv(name)
    if (value !== '') return { name, value }
  }
  return { name: null, value: '' }
}

/** @returns {{ ok: true, url: string, publishableKey: string } | { ok: false, missing: string[] }} */
export function getSupabaseClientConfig() {
  const url = readEnv(URL_ENV)
  const { name: keyEnv, value: publishableKey } = resolvePublishableKey()
  const missing = []
  if (url === '') missing.push(URL_ENV)
  if (publishableKey === '') {
    missing.push(`${KEY_ENVS[0]} (or ${KEY_ENVS[1]})`)
  }
  if (missing.length > 0) {
    return { ok: false, missing }
  }
  if (keyEnv && keyEnv.toLowerCase().includes('service')) {
    return { ok: false, missing: ['Invalid key variable (service role must not be used in the client).'] }
  }
  return { ok: true, url, publishableKey }
}

export function isSupabaseConfigured() {
  return getSupabaseClientConfig().ok
}
