import { validateCategories } from './category.js'
import { validateTransactions } from './transaction.js'
import {
  readCategories,
  readCategoriesStorageRaw,
  restoreCategoriesStorageRaw,
  saveCategories,
} from './categoryStore.js'
import {
  readTransactions,
  readTransactionsStorageRaw,
  restoreTransactionsStorageRaw,
  saveTransactions,
} from './transactionStore.js'
import { isCategoryIdAllowedForTransaction } from '../transactions/categories.js'

export const BACKUP_VERSION = 1

const SUPPORTED_BACKUP_VERSIONS = new Set([BACKUP_VERSION])
const BACKUP_FIELDS = ['backupVersion', 'exportedAt', 'transactions', 'categories']
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP_PATTERN.test(value)) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function recordsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function validateTransactionCategoryReferences(transactions, categories) {
  const errors = []
  transactions.forEach((transaction, index) => {
    if (
      !isCategoryIdAllowedForTransaction(transaction.categoryId, transaction.type, categories)
    ) {
      errors.push(
        `Transaction ${index + 1}: category "${transaction.categoryId}" is missing or not valid for a ${transaction.type} transaction.`,
      )
    }
  })
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true }
}

export function createBackupDocument(transactions, categories, now = new Date()) {
  return {
    backupVersion: BACKUP_VERSION,
    exportedAt: now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString() : '',
    transactions,
    categories,
  }
}

export function validateBackupDocument(value) {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Backup must be a JSON object.'] }
  }

  const errors = []
  const keys = Object.keys(value)
  if (
    keys.length !== BACKUP_FIELDS.length ||
    BACKUP_FIELDS.some((field) => !Object.hasOwn(value, field))
  ) {
    errors.push('Backup must contain only backupVersion, exportedAt, transactions, and categories.')
  }
  if (!SUPPORTED_BACKUP_VERSIONS.has(value.backupVersion)) {
    errors.push('This backup version is not supported.')
  }
  if (!isTimestamp(value.exportedAt)) {
    errors.push('exportedAt must be a UTC timestamp.')
  }

  const transactionsResult = validateTransactions(value.transactions)
  if (!transactionsResult.ok) {
    errors.push(...transactionsResult.errors)
  }
  const categoriesResult = validateCategories(value.categories)
  if (!categoriesResult.ok) {
    errors.push(...categoriesResult.errors)
  }

  if (errors.length > 0) return { ok: false, errors }

  const referenceResult = validateTransactionCategoryReferences(
    transactionsResult.transactions,
    categoriesResult.categories,
  )
  if (!referenceResult.ok) {
    return { ok: false, errors: referenceResult.errors }
  }

  return {
    ok: true,
    backup: {
      backupVersion: value.backupVersion,
      exportedAt: value.exportedAt,
      transactions: transactionsResult.transactions,
      categories: categoriesResult.categories,
    },
  }
}

export function parseBackupJson(text) {
  if (typeof text !== 'string') {
    return { ok: false, errors: ['Backup file must be text.'] }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['Backup file is not valid JSON.'] }
  }
  return validateBackupDocument(parsed)
}

function mergeRecords(existingList, backupList, label) {
  const merged = new Map(existingList.map((item) => [item.id, item]))
  let added = 0
  let kept = 0
  const errors = []

  for (const item of backupList) {
    const current = merged.get(item.id)
    if (!current) {
      merged.set(item.id, item)
      added += 1
      continue
    }
    if (recordsEqual(current, item)) {
      kept += 1
      continue
    }
    errors.push(`${label} ${item.id} conflicts with saved data and was not merged.`)
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    items: [...merged.values()],
    added,
    kept,
  }
}

export function mergeBackupData(existingTransactions, existingCategories, backup) {
  const categoriesMerge = mergeRecords(existingCategories, backup.categories, 'Category')
  if (!categoriesMerge.ok) return categoriesMerge

  const validatedCategories = validateCategories(categoriesMerge.items)
  if (!validatedCategories.ok) {
    return { ok: false, errors: validatedCategories.errors }
  }

  const transactionsMerge = mergeRecords(
    existingTransactions,
    backup.transactions,
    'Transaction',
  )
  if (!transactionsMerge.ok) return transactionsMerge

  const validatedTransactions = validateTransactions(transactionsMerge.items)
  if (!validatedTransactions.ok) {
    return { ok: false, errors: validatedTransactions.errors }
  }

  const referenceResult = validateTransactionCategoryReferences(
    validatedTransactions.transactions,
    validatedCategories.categories,
  )
  if (!referenceResult.ok) {
    return { ok: false, errors: referenceResult.errors }
  }

  return {
    ok: true,
    transactions: validatedTransactions.transactions,
    categories: validatedCategories.categories,
    summary: {
      mode: 'merge',
      transactionsAdded: transactionsMerge.added,
      transactionsKept: transactionsMerge.kept,
      categoriesAdded: categoriesMerge.added,
      categoriesKept: categoriesMerge.kept,
    },
  }
}

export function buildReplaceData(backup) {
  return {
    ok: true,
    transactions: backup.transactions,
    categories: backup.categories,
    summary: {
      mode: 'replace',
      transactionsRestored: backup.transactions.length,
      categoriesRestored: backup.categories.length,
    },
  }
}

export function getBackupRestoreStorageState(storage) {
  const existingTransactions = readTransactions(storage)
  const existingCategories = readCategories(storage)
  const transactionsMalformed =
    !existingTransactions.ok && existingTransactions.error === 'malformed'
  const categoriesMalformed =
    !existingCategories.ok && existingCategories.error === 'malformed'
  const storageUnavailable =
    (!existingTransactions.ok && existingTransactions.error === 'unavailable') ||
    (!existingCategories.ok && existingCategories.error === 'unavailable')

  return {
    existingTransactions,
    existingCategories,
    transactionsMalformed,
    categoriesMalformed,
    recoveryReplaceNeeded: transactionsMalformed || categoriesMalformed,
    mergeAllowed: existingTransactions.ok && existingCategories.ok,
    storageUnavailable,
  }
}

function captureStorageSnapshot(storage) {
  const transactionsRaw = readTransactionsStorageRaw(storage)
  if (!transactionsRaw.ok) {
    return { ok: false, errors: ['Saved transactions could not be read for recovery.'] }
  }
  const categoriesRaw = readCategoriesStorageRaw(storage)
  if (!categoriesRaw.ok) {
    return { ok: false, errors: ['Saved categories could not be read for recovery.'] }
  }
  return {
    ok: true,
    transactionsRaw: transactionsRaw.raw,
    categoriesRaw: categoriesRaw.raw,
  }
}

function restoreStorageSnapshot(storage, snapshot) {
  const transactionsRestored = restoreTransactionsStorageRaw(storage, snapshot.transactionsRaw)
  const categoriesRestored = restoreCategoriesStorageRaw(storage, snapshot.categoriesRaw)
  return {
    ok: transactionsRestored.ok && categoriesRestored.ok,
    transactionsRestored: transactionsRestored.ok,
    categoriesRestored: categoriesRestored.ok,
  }
}

function rollbackMessage(rollback) {
  if (rollback.ok) return 'Your previous saved data was put back.'
  const failed = []
  if (!rollback.transactionsRestored) failed.push('transactions')
  if (!rollback.categoriesRestored) failed.push('categories')
  return `Your previous saved data could not be put back automatically${
    failed.length > 0 ? ` (${failed.join(' and ')})` : ''
  }.`
}

function applyRecoveryReplace(backup, storage) {
  const snapshot = captureStorageSnapshot(storage)
  if (!snapshot.ok) return snapshot

  const prepared = buildReplaceData(backup)
  const writeOptions = { recoveryReplace: true }

  const savedCategories = saveCategories(prepared.categories, storage, writeOptions)
  if (!savedCategories.ok) {
    return {
      ok: false,
      errors: [`Categories were not restored: ${savedCategories.error}.`],
    }
  }

  const savedTransactions = saveTransactions(prepared.transactions, storage, writeOptions)
  if (!savedTransactions.ok) {
    const rollback = restoreStorageSnapshot(storage, snapshot)
    return {
      ok: false,
      errors: [
        `Transactions were not restored: ${savedTransactions.error}.`,
        rollbackMessage(rollback),
      ],
    }
  }

  return {
    ok: true,
    transactions: savedTransactions.transactions,
    categories: savedCategories.categories,
    summary: {
      ...prepared.summary,
      recoveredFromMalformedStorage: true,
    },
  }
}

function applyStandardRestore(mode, backup, existingTransactions, existingCategories, storage) {
  const prepared =
    mode === 'replace'
      ? buildReplaceData(backup)
      : mergeBackupData(
          existingTransactions.transactions,
          existingCategories.categories,
          backup,
        )
  if (!prepared.ok) return prepared

  const previousCategories = existingCategories.categories
  const savedCategories = saveCategories(prepared.categories, storage)
  if (!savedCategories.ok) {
    return {
      ok: false,
      errors: [`Categories were not restored: ${savedCategories.error}.`],
    }
  }

  const savedTransactions = saveTransactions(prepared.transactions, storage)
  if (!savedTransactions.ok) {
    const rollback = saveCategories(previousCategories, storage)
    return {
      ok: false,
      errors: [
        `Transactions were not restored: ${savedTransactions.error}.`,
        rollback.ok
          ? 'Your previous categories were put back.'
          : 'Your previous categories could not be put back automatically.',
      ],
    }
  }

  return {
    ok: true,
    transactions: savedTransactions.transactions,
    categories: savedCategories.categories,
    summary: prepared.summary,
  }
}

export function applyBackupRestore(mode, backup, storage) {
  if (mode !== 'replace' && mode !== 'merge') {
    return { ok: false, errors: ['Restore mode must be replace or merge.'] }
  }

  const state = getBackupRestoreStorageState(storage)
  if (state.storageUnavailable) {
    const errors = []
    if (!state.existingTransactions.ok) {
      errors.push(`Saved transactions could not be read: ${state.existingTransactions.error}.`)
    }
    if (!state.existingCategories.ok) {
      errors.push(`Saved categories could not be read: ${state.existingCategories.error}.`)
    }
    return { ok: false, errors }
  }

  if (mode === 'merge') {
    if (!state.mergeAllowed) {
      const errors = []
      if (!state.existingTransactions.ok) {
        errors.push(`Saved transactions could not be read: ${state.existingTransactions.error}.`)
      }
      if (!state.existingCategories.ok) {
        errors.push(`Saved categories could not be read: ${state.existingCategories.error}.`)
      }
      return { ok: false, errors }
    }
    return applyStandardRestore(
      mode,
      backup,
      state.existingTransactions,
      state.existingCategories,
      storage,
    )
  }

  if (state.recoveryReplaceNeeded) {
    return applyRecoveryReplace(backup, storage)
  }

  if (!state.mergeAllowed) {
    return {
      ok: false,
      errors: ['Saved data could not be read.'],
    }
  }

  return applyStandardRestore(
    mode,
    backup,
    state.existingTransactions,
    state.existingCategories,
    storage,
  )
}

export function readBackupForExport(storage) {
  const transactions = readTransactions(storage)
  if (!transactions.ok) {
    return { ok: false, error: transactions.error, errors: transactions.errors }
  }
  const categories = readCategories(storage)
  if (!categories.ok) {
    return { ok: false, error: categories.error, errors: categories.errors }
  }
  return {
    ok: true,
    document: createBackupDocument(transactions.transactions, categories.categories),
    empty: transactions.transactions.length === 0 && categories.categories.length === 0,
  }
}

export function backupFilename(exportedAt) {
  const date =
    typeof exportedAt === 'string' && exportedAt.length >= 10
      ? exportedAt.slice(0, 10)
      : 'unknown-date'
  return `expensesnap-backup-${date}.json`
}
