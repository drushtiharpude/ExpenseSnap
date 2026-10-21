import { validateBudgets } from './budget.js'
import {
  readBudgets,
  readBudgetsStorageRaw,
  restoreBudgetsStorageRaw,
  saveBudgets,
} from './budgetStore.js'
import { validateCategories } from './category.js'
import { validateTransactions } from './transaction.js'
import {
  readCategories,
  readCategoriesStorageRaw,
  restoreCategoriesStorageRaw,
  saveCategories,
} from './categoryStore.js'
import { validateRecurringBills } from './recurringBill.js'
import {
  readRecurringBills,
  readRecurringBillsStorageRaw,
  restoreRecurringBillsStorageRaw,
  saveRecurringBills,
} from './recurringBillStore.js'
import {
  readTransactions,
  readTransactionsStorageRaw,
  restoreTransactionsStorageRaw,
  saveTransactions,
} from './transactionStore.js'
import { isCategoryIdAllowedForTransaction } from '../transactions/categories.js'

export const BACKUP_VERSION = 3
export const BACKUP_VERSION_V1 = 1
export const BACKUP_VERSION_V2 = 2

const SUPPORTED_BACKUP_VERSIONS = new Set([BACKUP_VERSION_V1, BACKUP_VERSION_V2, BACKUP_VERSION])
const BACKUP_FIELDS_V1 = ['backupVersion', 'exportedAt', 'transactions', 'categories']
const BACKUP_FIELDS_V2 = ['backupVersion', 'exportedAt', 'transactions', 'categories', 'budgets']
const BACKUP_FIELDS_V3 = [
  'backupVersion',
  'exportedAt',
  'transactions',
  'categories',
  'budgets',
  'recurringBills',
]
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

function backupIncludesBudgets(backupVersion) {
  return backupVersion === BACKUP_VERSION_V2 || backupVersion === BACKUP_VERSION
}

function backupIncludesRecurringBills(backupVersion) {
  return backupVersion === BACKUP_VERSION
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

export function createBackupDocument(
  transactions,
  categories,
  budgets = [],
  recurringBills = [],
  now = new Date(),
) {
  return {
    backupVersion: BACKUP_VERSION,
    exportedAt: now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString() : '',
    transactions,
    categories,
    budgets,
    recurringBills,
  }
}

function validateBackupFields(value, errors) {
  const version = value.backupVersion
  if (version === BACKUP_VERSION_V1) {
    const keys = Object.keys(value)
    if (
      keys.length !== BACKUP_FIELDS_V1.length ||
      BACKUP_FIELDS_V1.some((field) => !Object.hasOwn(value, field))
    ) {
      errors.push('Backup must contain only backupVersion, exportedAt, transactions, and categories.')
    }
    return
  }
  if (version === BACKUP_VERSION_V2) {
    const keys = Object.keys(value)
    if (
      keys.length !== BACKUP_FIELDS_V2.length ||
      BACKUP_FIELDS_V2.some((field) => !Object.hasOwn(value, field))
    ) {
      errors.push(
        'Backup must contain only backupVersion, exportedAt, transactions, categories, and budgets.',
      )
    }
    return
  }
  if (version === BACKUP_VERSION) {
    const keys = Object.keys(value)
    if (
      keys.length !== BACKUP_FIELDS_V3.length ||
      BACKUP_FIELDS_V3.some((field) => !Object.hasOwn(value, field))
    ) {
      errors.push(
        'Backup must contain only backupVersion, exportedAt, transactions, categories, budgets, and recurringBills.',
      )
    }
  }
}

export function validateRecurringBillCategoryReferences(recurringBills, categories) {
  const errors = []
  recurringBills.forEach((bill, index) => {
    if (!isCategoryIdAllowedForTransaction(bill.categoryId, 'expense', categories)) {
      errors.push(
        `Recurring bill ${index + 1}: category "${bill.categoryId}" is missing or not valid for an expense.`,
      )
    }
  })
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true }
}

export function validateBackupDocument(value) {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Backup must be a JSON object.'] }
  }

  const errors = []
  if (!SUPPORTED_BACKUP_VERSIONS.has(value.backupVersion)) {
    errors.push('This backup version is not supported.')
  } else {
    validateBackupFields(value, errors)
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

  let budgetsResult = { ok: true, budgets: [] }
  if (backupIncludesBudgets(value.backupVersion) && categoriesResult.ok) {
    budgetsResult = validateBudgets(value.budgets, categoriesResult.categories)
    if (!budgetsResult.ok) {
      errors.push(...budgetsResult.errors)
    }
  }

  let recurringBillsResult = { ok: true, bills: [] }
  if (backupIncludesRecurringBills(value.backupVersion) && categoriesResult.ok) {
    recurringBillsResult = validateRecurringBills(value.recurringBills, categoriesResult.categories)
    if (!recurringBillsResult.ok) {
      errors.push(...recurringBillsResult.errors)
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  const referenceResult = validateTransactionCategoryReferences(
    transactionsResult.transactions,
    categoriesResult.categories,
  )
  if (!referenceResult.ok) {
    return { ok: false, errors: referenceResult.errors }
  }

  const recurringReference = validateRecurringBillCategoryReferences(
    recurringBillsResult.bills,
    categoriesResult.categories,
  )
  if (!recurringReference.ok) {
    return { ok: false, errors: recurringReference.errors }
  }

  const includesBudgets = backupIncludesBudgets(value.backupVersion)
  const includesRecurringBills = backupIncludesRecurringBills(value.backupVersion)

  return {
    ok: true,
    backup: {
      backupVersion: value.backupVersion,
      exportedAt: value.exportedAt,
      transactions: transactionsResult.transactions,
      categories: categoriesResult.categories,
      budgets: includesBudgets ? budgetsResult.budgets : [],
      recurringBills: includesRecurringBills ? recurringBillsResult.bills : [],
      includesBudgets,
      includesRecurringBills,
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

export function mergeBackupData(
  existingTransactions,
  existingCategories,
  backup,
  existingBudgets = [],
  existingRecurringBills = [],
) {
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

  let budgetsMerge = { added: 0, kept: 0 }
  let mergedBudgets = existingBudgets

  if (backup.includesBudgets) {
    const budgetRecords = mergeRecords(existingBudgets, backup.budgets, 'Budget')
    if (!budgetRecords.ok) return budgetRecords

    const validatedBudgets = validateBudgets(
      budgetRecords.items,
      validatedCategories.categories,
    )
    if (!validatedBudgets.ok) {
      return { ok: false, errors: validatedBudgets.errors }
    }

    budgetsMerge = { added: budgetRecords.added, kept: budgetRecords.kept }
    mergedBudgets = validatedBudgets.budgets
  }

  const summary = {
    mode: 'merge',
    transactionsAdded: transactionsMerge.added,
    transactionsKept: transactionsMerge.kept,
    categoriesAdded: categoriesMerge.added,
    categoriesKept: categoriesMerge.kept,
  }

  if (backup.includesBudgets) {
    summary.budgetsAdded = budgetsMerge.added
    summary.budgetsKept = budgetsMerge.kept
  }

  let recurringMerge = { added: 0, kept: 0 }
  let mergedRecurringBills = existingRecurringBills

  if (backup.includesRecurringBills) {
    const recurringRecords = mergeRecords(
      existingRecurringBills,
      backup.recurringBills,
      'Recurring bill',
    )
    if (!recurringRecords.ok) return recurringRecords

    const validatedRecurring = validateRecurringBills(
      recurringRecords.items,
      validatedCategories.categories,
    )
    if (!validatedRecurring.ok) {
      return { ok: false, errors: validatedRecurring.errors }
    }

    const recurringReference = validateRecurringBillCategoryReferences(
      validatedRecurring.bills,
      validatedCategories.categories,
    )
    if (!recurringReference.ok) {
      return { ok: false, errors: recurringReference.errors }
    }

    recurringMerge = { added: recurringRecords.added, kept: recurringRecords.kept }
    mergedRecurringBills = validatedRecurring.bills
    summary.recurringBillsAdded = recurringMerge.added
    summary.recurringBillsKept = recurringMerge.kept
  }

  return {
    ok: true,
    transactions: validatedTransactions.transactions,
    categories: validatedCategories.categories,
    budgets: mergedBudgets,
    recurringBills: mergedRecurringBills,
    writeBudgets: backup.includesBudgets,
    writeRecurringBills: backup.includesRecurringBills,
    summary,
  }
}

export function buildReplaceData(backup) {
  const summary = {
    mode: 'replace',
    transactionsRestored: backup.transactions.length,
    categoriesRestored: backup.categories.length,
    recurringBillsRestored: backup.recurringBills.length,
  }
  if (backup.includesBudgets) {
    summary.budgetsRestored = backup.budgets.length
  }

  return {
    ok: true,
    transactions: backup.transactions,
    categories: backup.categories,
    budgets: backup.includesBudgets ? backup.budgets : undefined,
    recurringBills: backup.recurringBills,
    writeBudgets: backup.includesBudgets,
    writeRecurringBills: true,
    summary,
  }
}

export function getBackupRestoreStorageState(storage) {
  const existingTransactions = readTransactions(storage)
  const existingCategories = readCategories(storage)
  const existingBudgets = readBudgets(storage, {
    customCategories: existingCategories.ok ? existingCategories.categories : [],
  })
  const existingRecurringBills = readRecurringBills(storage, {
    customCategories: existingCategories.ok ? existingCategories.categories : [],
  })
  const transactionsMalformed =
    !existingTransactions.ok && existingTransactions.error === 'malformed'
  const categoriesMalformed =
    !existingCategories.ok && existingCategories.error === 'malformed'
  const budgetsMalformed = !existingBudgets.ok && existingBudgets.error === 'malformed'
  const recurringBillsMalformed =
    !existingRecurringBills.ok && existingRecurringBills.error === 'malformed'
  const storageUnavailable =
    (!existingTransactions.ok && existingTransactions.error === 'unavailable') ||
    (!existingCategories.ok && existingCategories.error === 'unavailable') ||
    (!existingBudgets.ok && existingBudgets.error === 'unavailable') ||
    (!existingRecurringBills.ok && existingRecurringBills.error === 'unavailable')

  return {
    existingTransactions,
    existingCategories,
    existingBudgets,
    existingRecurringBills,
    transactionsMalformed,
    categoriesMalformed,
    budgetsMalformed,
    recurringBillsMalformed,
    recoveryReplaceNeeded:
      transactionsMalformed ||
      categoriesMalformed ||
      budgetsMalformed ||
      recurringBillsMalformed,
    mergeAllowed:
      existingTransactions.ok &&
      existingCategories.ok &&
      existingBudgets.ok &&
      existingRecurringBills.ok,
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
  const budgetsRaw = readBudgetsStorageRaw(storage)
  if (!budgetsRaw.ok) {
    return { ok: false, errors: ['Saved budgets could not be read for recovery.'] }
  }
  const recurringBillsRaw = readRecurringBillsStorageRaw(storage)
  if (!recurringBillsRaw.ok) {
    return { ok: false, errors: ['Saved recurring bills could not be read for recovery.'] }
  }
  return {
    ok: true,
    transactionsRaw: transactionsRaw.raw,
    categoriesRaw: categoriesRaw.raw,
    budgetsRaw: budgetsRaw.raw,
    recurringBillsRaw: recurringBillsRaw.raw,
  }
}

function restoreStorageSnapshot(storage, snapshot) {
  const transactionsRestored = restoreTransactionsStorageRaw(storage, snapshot.transactionsRaw)
  const categoriesRestored = restoreCategoriesStorageRaw(storage, snapshot.categoriesRaw)
  const budgetsRestored = restoreBudgetsStorageRaw(storage, snapshot.budgetsRaw)
  const recurringBillsRestored = restoreRecurringBillsStorageRaw(
    storage,
    snapshot.recurringBillsRaw,
  )
  return {
    ok:
      transactionsRestored.ok &&
      categoriesRestored.ok &&
      budgetsRestored.ok &&
      recurringBillsRestored.ok,
    transactionsRestored: transactionsRestored.ok,
    categoriesRestored: categoriesRestored.ok,
    budgetsRestored: budgetsRestored.ok,
    recurringBillsRestored: recurringBillsRestored.ok,
  }
}

function rollbackMessage(rollback) {
  if (rollback.ok) return 'Your previous saved data was put back.'
  const failed = []
  if (!rollback.transactionsRestored) failed.push('transactions')
  if (!rollback.categoriesRestored) failed.push('categories')
  if (!rollback.budgetsRestored) failed.push('budgets')
  if (!rollback.recurringBillsRestored) failed.push('recurring bills')
  return `Your previous saved data could not be put back automatically${
    failed.length > 0 ? ` (${failed.join(', ')})` : ''
  }.`
}

function categoriesRollbackMessage(rollback) {
  return rollback.ok
    ? 'Your previous categories were put back.'
    : 'Your previous categories could not be put back automatically.'
}

function categoriesBudgetsRollbackMessage(categoriesRollback, budgetsRollback) {
  if (categoriesRollback.ok && budgetsRollback.ok) {
    return 'Your previous categories and budgets were put back.'
  }
  const failed = []
  if (!categoriesRollback.ok) failed.push('categories')
  if (!budgetsRollback.ok) failed.push('budgets')
  return `Your previous categories and budgets could not be put back automatically${
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

  if (prepared.writeBudgets) {
    const savedBudgets = saveBudgets(prepared.budgets, storage, {
      ...writeOptions,
      customCategories: savedCategories.categories,
    })
    if (!savedBudgets.ok) {
      const rollback = restoreStorageSnapshot(storage, snapshot)
      return {
        ok: false,
        errors: [
          `Budgets were not restored: ${savedBudgets.error}.`,
          rollbackMessage(rollback),
        ],
      }
    }
  }

  if (prepared.writeRecurringBills) {
    const savedRecurring = saveRecurringBills(prepared.recurringBills, storage, {
      ...writeOptions,
      customCategories: savedCategories.categories,
    })
    if (!savedRecurring.ok) {
      const rollback = restoreStorageSnapshot(storage, snapshot)
      return {
        ok: false,
        errors: [
          `Recurring bills were not restored: ${savedRecurring.error}.`,
          rollbackMessage(rollback),
        ],
      }
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

  const result = {
    ok: true,
    transactions: savedTransactions.transactions,
    categories: savedCategories.categories,
    summary: {
      ...prepared.summary,
      recoveredFromMalformedStorage: true,
    },
  }

  if (prepared.writeBudgets) {
    const budgetsRead = readBudgets(storage, { customCategories: savedCategories.categories })
    if (budgetsRead.ok) result.budgets = budgetsRead.budgets
  }
  if (prepared.writeRecurringBills) {
    const recurringRead = readRecurringBills(storage, {
      customCategories: savedCategories.categories,
    })
    if (recurringRead.ok) result.recurringBills = recurringRead.bills
  }

  return result
}

function applyStandardRestore(mode, backup, state, storage) {
  const existingTransactions = state.existingTransactions
  const existingCategories = state.existingCategories
  const existingBudgets = state.existingBudgets
  const existingRecurringBills = state.existingRecurringBills

  const prepared =
    mode === 'replace'
      ? buildReplaceData(backup)
      : mergeBackupData(
          existingTransactions.transactions,
          existingCategories.categories,
          backup,
          existingBudgets.budgets,
          existingRecurringBills.bills,
        )
  if (!prepared.ok) return prepared

  const previousCategories = existingCategories.categories
  const previousBudgets = existingBudgets.budgets
  const previousRecurringBills = existingRecurringBills.bills

  const savedCategories = saveCategories(prepared.categories, storage)
  if (!savedCategories.ok) {
    return {
      ok: false,
      errors: [`Categories were not restored: ${savedCategories.error}.`],
    }
  }

  if (prepared.writeBudgets) {
    const savedBudgets = saveBudgets(prepared.budgets, storage, {
      customCategories: savedCategories.categories,
    })
    if (!savedBudgets.ok) {
      const categoriesRollback = saveCategories(previousCategories, storage)
      return {
        ok: false,
        errors: [
          `Budgets were not restored: ${savedBudgets.error}.`,
          categoriesRollbackMessage(categoriesRollback),
        ],
      }
    }
  }

  if (prepared.writeRecurringBills) {
    const savedRecurring = saveRecurringBills(prepared.recurringBills, storage, {
      customCategories: savedCategories.categories,
    })
    if (!savedRecurring.ok) {
      const categoriesRollback = saveCategories(previousCategories, storage)
      let budgetsMessage = categoriesRollbackMessage(categoriesRollback)
      if (prepared.writeBudgets) {
        const budgetsRollback = saveBudgets(previousBudgets, storage, {
          customCategories: previousCategories,
        })
        budgetsMessage = categoriesBudgetsRollbackMessage(categoriesRollback, budgetsRollback)
      }
      return {
        ok: false,
        errors: [`Recurring bills were not restored: ${savedRecurring.error}.`, budgetsMessage],
      }
    }
  }

  const savedTransactions = saveTransactions(prepared.transactions, storage)
  if (!savedTransactions.ok) {
    const categoriesRollback = saveCategories(previousCategories, storage)
    let budgetsMessage = ''
    if (prepared.writeBudgets) {
      const budgetsRollback = saveBudgets(previousBudgets, storage, {
        customCategories: previousCategories,
      })
      budgetsMessage = categoriesBudgetsRollbackMessage(categoriesRollback, budgetsRollback)
    } else {
      budgetsMessage = categoriesRollbackMessage(categoriesRollback)
    }
    if (prepared.writeRecurringBills) {
      saveRecurringBills(previousRecurringBills, storage, {
        customCategories: previousCategories,
      })
    }
    return {
      ok: false,
      errors: [`Transactions were not restored: ${savedTransactions.error}.`, budgetsMessage],
    }
  }

  const result = {
    ok: true,
    transactions: savedTransactions.transactions,
    categories: savedCategories.categories,
    summary: prepared.summary,
  }

  if (prepared.writeBudgets) {
    result.budgets = prepared.budgets
  } else if (existingBudgets.ok) {
    result.budgets = existingBudgets.budgets
  }

  if (prepared.writeRecurringBills) {
    result.recurringBills = prepared.recurringBills
  } else if (existingRecurringBills.ok) {
    result.recurringBills = existingRecurringBills.bills
  }

  return result
}

function storageReadErrors(state) {
  const errors = []
  if (!state.existingTransactions.ok) {
    errors.push(`Saved transactions could not be read: ${state.existingTransactions.error}.`)
  }
  if (!state.existingCategories.ok) {
    errors.push(`Saved categories could not be read: ${state.existingCategories.error}.`)
  }
  if (!state.existingBudgets.ok) {
    errors.push(`Saved budgets could not be read: ${state.existingBudgets.error}.`)
  }
  if (!state.existingRecurringBills.ok) {
    errors.push(`Saved recurring bills could not be read: ${state.existingRecurringBills.error}.`)
  }
  return errors
}

export function applyBackupRestore(mode, backup, storage) {
  if (mode !== 'replace' && mode !== 'merge') {
    return { ok: false, errors: ['Restore mode must be replace or merge.'] }
  }

  const state = getBackupRestoreStorageState(storage)
  if (state.storageUnavailable) {
    return { ok: false, errors: storageReadErrors(state) }
  }

  if (mode === 'merge') {
    if (!state.mergeAllowed) {
      return { ok: false, errors: storageReadErrors(state) }
    }
    return applyStandardRestore(mode, backup, state, storage)
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

  return applyStandardRestore(mode, backup, state, storage)
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
  const budgets = readBudgets(storage, { customCategories: categories.categories })
  if (!budgets.ok) {
    return { ok: false, error: budgets.error, errors: budgets.errors }
  }
  const recurringBills = readRecurringBills(storage, { customCategories: categories.categories })
  if (!recurringBills.ok) {
    return { ok: false, error: recurringBills.error, errors: recurringBills.errors }
  }
  const document = createBackupDocument(
    transactions.transactions,
    categories.categories,
    budgets.budgets,
    recurringBills.bills,
  )
  return {
    ok: true,
    document,
    empty:
      transactions.transactions.length === 0 &&
      categories.categories.length === 0 &&
      budgets.budgets.length === 0 &&
      recurringBills.bills.length === 0,
  }
}

export function backupFilename(exportedAt) {
  const date =
    typeof exportedAt === 'string' && exportedAt.length >= 10
      ? exportedAt.slice(0, 10)
      : 'unknown-date'
  return `expensesnap-backup-${date}.json`
}
