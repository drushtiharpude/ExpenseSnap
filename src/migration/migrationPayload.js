import { BACKUP_VERSION } from '../data/backup.js'

const FORBIDDEN_ROOT_KEYS = new Set(['userId', 'user_id', 'ownerId', 'owner_id', 'accountId'])

/** Strip any client-supplied tenant hints before RPC (ownership is auth.uid() server-side). */
export function sanitizeImportPayload(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { ok: false, errors: ['Import payload must be an object.'] }
  }
  for (const key of FORBIDDEN_ROOT_KEYS) {
    if (Object.hasOwn(document, key)) {
      return { ok: false, errors: [`Import payload must not include ${key}.`] }
    }
  }
  return {
    ok: true,
    payload: {
      backupVersion: document.backupVersion ?? BACKUP_VERSION,
      exportedAt: document.exportedAt ?? new Date().toISOString(),
      transactions: document.transactions ?? [],
      categories: document.categories ?? [],
      budgets: document.budgets ?? [],
      recurringBills: document.recurringBills ?? [],
      savingsGoals: document.savingsGoals ?? [],
      importSource: 'local_device',
    },
  }
}

export function buildImportPayloadFromBackup(backup) {
  if (!backup || typeof backup !== 'object') {
    return { ok: false, errors: ['Backup is missing.'] }
  }
  return sanitizeImportPayload({
    backupVersion: backup.backupVersion,
    exportedAt: backup.exportedAt,
    transactions: backup.transactions,
    categories: backup.categories,
    budgets: backup.budgets ?? [],
    recurringBills: backup.recurringBills ?? [],
    savingsGoals: backup.savingsGoals ?? [],
  })
}
