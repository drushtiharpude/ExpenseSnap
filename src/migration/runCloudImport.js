import { readBackupForExport, validateBackupDocument } from '../data/backup.js'
import { getSupabaseClient } from '../lib/supabaseClient.js'
import { markMigrationVerifiedInCloud, fetchCloudEntityCounts } from './cloudData.js'
import { buildImportPayloadFromBackup } from './migrationPayload.js'
import { isCloudEmptyForImport, migrationEntityCounts } from './migrationCounts.js'
import {
  clearPendingIdempotencyKey,
  createOrReuseIdempotencyKey,
  saveMigrationRecord,
} from './migrationState.js'

function mapRpcError(message) {
  const text = typeof message === 'string' ? message : ''
  if (text.includes('not_authenticated')) return 'Sign in again to import data.'
  if (text.includes('import_in_progress')) return 'An import is already running. Wait and retry.'
  if (text.includes('category_id_conflict') || text.includes('transaction_id_conflict')) {
    return 'Cloud data conflicts with this import. Your local data was not changed.'
  }
  if (text.includes('Could not find the function')) {
    return 'Cloud import is not available yet. Apply the Supabase database migration first.'
  }
  return text || 'Import failed. Your local data was not changed.'
}

/** Read validated local backup document (browser localStorage). */
export function readLocalMigrationBackup() {
  const exported = readBackupForExport()
  if (!exported.ok) {
    return { ok: false, errors: exported.errors ?? ['Local data could not be read.'] }
  }
  const validated = validateBackupDocument(exported.document)
  if (!validated.ok) {
    return { ok: false, errors: validated.errors }
  }
  return {
    ok: true,
    document: exported.document,
    backup: validated.backup,
    counts: migrationEntityCounts(validated.backup),
    empty: exported.empty,
  }
}

/**
 * Import local device backup into the signed-in user's cloud tenant.
 * Does not modify localStorage financial keys.
 */
export async function runLocalDeviceCloudImport(userId, { storage, requireEmptyCloud = true } = {}) {
  if (typeof userId !== 'string' || userId === '') {
    return { ok: false, error: 'You must be signed in to import.' }
  }

  const local = readLocalMigrationBackup()
  if (!local.ok) {
    return { ok: false, error: local.errors.join(' ') }
  }

  if (local.empty) {
    return { ok: false, error: 'There is no local financial data to import.' }
  }

  const cloud = await fetchCloudEntityCounts()
  if (!cloud.ok) {
    return { ok: false, error: cloud.error }
  }

  if (requireEmptyCloud && !isCloudEmptyForImport(cloud.counts)) {
    return {
      ok: false,
      error:
        'Your cloud account already has data. Import is only allowed into an empty account to prevent merging accounts.',
    }
  }

  const payloadResult = buildImportPayloadFromBackup(local.backup)
  if (!payloadResult.ok) {
    return { ok: false, error: payloadResult.errors.join(' ') }
  }

  const client = getSupabaseClient()
  if (!client) {
    return { ok: false, error: 'Cloud storage is not configured.' }
  }

  const idempotencyKey = createOrReuseIdempotencyKey(userId, storage)
  saveMigrationRecord(userId, { status: 'importing', previewCounts: local.counts }, storage)

  const { data, error } = await client.rpc('import_user_data', {
    payload: payloadResult.payload,
    idempotency_key: idempotencyKey,
  })

  if (error) {
    saveMigrationRecord(
      userId,
      { status: 'import_failed', lastError: mapRpcError(error.message) },
      storage,
    )
    return { ok: false, error: mapRpcError(error.message), idempotencyKey }
  }

  clearPendingIdempotencyKey(userId, storage)
  saveMigrationRecord(
    userId,
    {
      status: 'import_complete',
      lastJobId: data?.jobId ?? null,
      lastCounts: data?.counts ?? null,
      idempotentReplay: Boolean(data?.idempotentReplay),
      lastError: null,
    },
    storage,
  )

  return {
    ok: true,
    result: data,
    localCounts: local.counts,
    idempotencyKey,
  }
}

export async function verifyMigrationAgainstCloud(userId, localCounts, { storage } = {}) {
  const cloud = await fetchCloudEntityCounts()
  if (!cloud.ok) return { ok: false, error: cloud.error }

  const matches =
    cloud.counts.categories >= localCounts.categories &&
    cloud.counts.transactions >= localCounts.transactions &&
    cloud.counts.budgets >= localCounts.budgets &&
    cloud.counts.recurringBills >= localCounts.recurringBills &&
    cloud.counts.savingsGoals >= localCounts.savingsGoals

  if (!matches) {
    return {
      ok: false,
      error:
        'Cloud counts do not match the local preview yet. Import may be incomplete; local data on this device is unchanged.',
      cloudCounts: cloud.counts,
    }
  }

  saveMigrationRecord(userId, { status: 'verified', verifiedAt: new Date().toISOString() }, storage)
  const profile = await markMigrationVerifiedInCloud()
  if (!profile.ok) {
    return { ok: false, error: profile.error, cloudCounts: cloud.counts }
  }

  return { ok: true, cloudCounts: cloud.counts }
}
