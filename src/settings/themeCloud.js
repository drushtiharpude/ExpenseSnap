import { getFinanceSession, isCloudFinanceActive } from '../data/financeSession.js'
import { getSupabaseClient } from '../lib/supabaseClient.js'

export async function syncThemePreferenceToCloud(theme) {
  if (!isCloudFinanceActive()) return { ok: true }
  const client = getSupabaseClient()
  const userId = getFinanceSession().userId
  if (!client || !userId) return { ok: false, error: 'Not signed in.' }
  const { error } = await client.from('user_preferences').upsert(
    {
      user_id: userId,
      theme,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
