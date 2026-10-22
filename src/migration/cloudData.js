import { getSupabaseClient } from '../lib/supabaseClient.js'
import { cloudCountsFromRows } from './migrationCounts.js'

async function countTable(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
  if (error) return { ok: false, error: error.message }
  return { ok: true, count: count ?? 0 }
}

/** Fetch cloud entity counts for the signed-in user (RLS-scoped). */
export async function fetchCloudEntityCounts() {
  const client = getSupabaseClient()
  if (!client) {
    return { ok: false, error: 'Cloud storage is not configured.' }
  }

  const [transactions, categories, budgets, recurringBills, savingsGoals] = await Promise.all([
    countTable(client, 'transactions'),
    countTable(client, 'categories'),
    countTable(client, 'budgets'),
    countTable(client, 'recurring_bills'),
    countTable(client, 'savings_goals'),
  ])

  const failed = [transactions, categories, budgets, recurringBills, savingsGoals].find((r) => !r.ok)
  if (failed) {
    return { ok: false, error: failed.error ?? 'Could not read cloud data counts.' }
  }

  return {
    ok: true,
    counts: cloudCountsFromRows({
      transactions: transactions.count,
      categories: categories.count,
      budgets: budgets.count,
      recurringBills: recurringBills.count,
      savingsGoals: savingsGoals.count,
    }),
  }
}

export async function markMigrationVerifiedInCloud() {
  const client = getSupabaseClient()
  if (!client) return { ok: false, error: 'Cloud storage is not configured.' }
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, error: 'You must be signed in to verify migration.' }
  }
  const { error } = await client
    .from('profiles')
    .update({
      migration_status: 'verified',
      sync_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userData.user.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
