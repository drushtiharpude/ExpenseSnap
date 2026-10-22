import { createClient } from '@supabase/supabase-js'
import { getSupabaseClientConfig } from './supabaseConfig.js'

let cachedClient = null

/** @returns {import('@supabase/supabase-js').SupabaseClient | null} */
export function getSupabaseClient() {
  const config = getSupabaseClientConfig()
  if (!config.ok) return null
  if (!cachedClient) {
    cachedClient = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return cachedClient
}
