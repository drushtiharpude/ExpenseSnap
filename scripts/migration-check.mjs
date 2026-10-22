import { createBackupDocument } from '../src/data/backup.js'
import {
  buildImportPayloadFromBackup,
  sanitizeImportPayload,
} from '../src/migration/migrationPayload.js'
import {
  isCloudEmptyForImport,
  migrationCountsTotal,
  migrationEntityCounts,
} from '../src/migration/migrationCounts.js'
import {
  createOrReuseIdempotencyKey,
  getMigrationRecord,
  getPendingIdempotencyKey,
  MIGRATION_STATE_STORAGE_KEY,
  saveMigrationRecord,
} from '../src/migration/migrationState.js'

function check(label, pass) {
  if (!pass) {
    console.error('FAIL', label)
    process.exitCode = 1
    return
  }
  console.log('OK', label)
}

function memoryStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(key, value)
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}

const mem = memoryStorage()
const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'

check('sanitize rejects user_id', !sanitizeImportPayload({ user_id: userA, backupVersion: 4 }).ok)
check(
  'sanitize accepts backup shape',
  sanitizeImportPayload({
    backupVersion: 4,
    exportedAt: '2026-01-15T12:00:00.000Z',
    transactions: [],
    categories: [],
    budgets: [],
    recurringBills: [],
    savingsGoals: [],
  }).ok,
)

const doc = createBackupDocument([], [], [], [], [], new Date('2026-01-15T12:00:00.000Z'))
const built = buildImportPayloadFromBackup({
  backupVersion: doc.backupVersion,
  exportedAt: doc.exportedAt,
  transactions: doc.transactions,
  categories: doc.categories,
  budgets: doc.budgets,
  recurringBills: doc.recurringBills,
  savingsGoals: doc.savingsGoals,
})
check('build payload', built.ok && built.payload.importSource === 'local_device')
check(
  'payload has no tenant field',
  !Object.hasOwn(built.payload, 'userId') && !Object.hasOwn(built.payload, 'user_id'),
)

check('cloud empty', isCloudEmptyForImport(migrationEntityCounts({ transactions: [], categories: [] })))
check(
  'cloud not empty blocks silent merge',
  !isCloudEmptyForImport({ transactions: 1, categories: 0, budgets: 0, recurringBills: 0, savingsGoals: 0 }),
)

const key1 = createOrReuseIdempotencyKey(userA, mem)
const key2 = createOrReuseIdempotencyKey(userA, mem)
check('idempotency reuse same user', key1 === key2)

saveMigrationRecord(userA, { pendingIdempotencyKey: null }, mem)
const key3 = createOrReuseIdempotencyKey(userA, mem)
check('idempotency new after clear', key3 !== key1)

createOrReuseIdempotencyKey(userB, mem)
check(
  'migration state isolated per user',
  getPendingIdempotencyKey(userA, mem) === key3 &&
    getPendingIdempotencyKey(userB, mem) !== getPendingIdempotencyKey(userA, mem),
)

saveMigrationRecord(userA, { status: 'import_failed', lastError: 'network' }, mem)
check(
  'failed migration record preserved',
  getMigrationRecord(userA, mem).status === 'import_failed',
)

check(
  'migration state key constant',
  MIGRATION_STATE_STORAGE_KEY === 'expensesnap.migrationState.v1',
)

check(
  'counts total',
  migrationCountsTotal({ transactions: 2, categories: 1, budgets: 0, recurringBills: 0, savingsGoals: 3 }) ===
    6,
)

if (process.exitCode === 1) {
  console.error('MIGRATION CHECKS FAILED')
  process.exit(1)
}
console.log('ALL MIGRATION CHECKS PASSED')
