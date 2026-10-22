import { validateBudgets } from './budget.js'
import { validateCategories } from './category.js'
import { validateRecurringBills } from './recurringBill.js'
import { validateSavingsGoals } from './savingsGoal.js'
import { validateTransactions } from './transaction.js'
import {
  getFinanceCache,
  getFinanceSession,
  isCloudFinanceActive,
  patchFinanceCache,
  setFinanceSession,
} from './financeSession.js'
import { getSupabaseClient } from '../lib/supabaseClient.js'

function mapTransactionRow(row) {
  return {
    id: row.id,
    type: row.type,
    amountPaise: row.amount_paise,
    date: row.date,
    categoryId: row.category_id,
    description: row.description ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCategoryRow(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBudgetRow(row) {
  return {
    id: row.id,
    month: row.month,
    categoryId: row.category_id,
    limitPaise: row.limit_paise,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRecurringRow(row) {
  return {
    id: row.id,
    title: row.title,
    amountPaise: row.amount_paise,
    categoryId: row.category_id,
    frequency: row.frequency,
    nextDueDate: row.next_due_date,
    status: row.status,
    lastPaidDueDate: row.last_paid_due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSavingsRow(row) {
  return {
    id: row.id,
    name: row.name,
    targetPaise: row.target_paise,
    targetDate: row.target_date,
    notes: row.notes ?? '',
    entries: Array.isArray(row.entries) ? row.entries : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTransactionToRow(item, userId) {
  return {
    user_id: userId,
    id: item.id,
    type: item.type,
    amount_paise: item.amountPaise,
    date: item.date,
    category_id: item.categoryId,
    description: item.description ?? '',
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapCategoryToRow(item, userId) {
  return {
    user_id: userId,
    id: item.id,
    type: item.type,
    name: item.name,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapBudgetToRow(item, userId) {
  return {
    user_id: userId,
    id: item.id,
    month: item.month,
    category_id: item.categoryId,
    limit_paise: item.limitPaise,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapRecurringToRow(item, userId) {
  return {
    user_id: userId,
    id: item.id,
    title: item.title,
    amount_paise: item.amountPaise,
    category_id: item.categoryId,
    frequency: item.frequency,
    next_due_date: item.nextDueDate,
    status: item.status,
    last_paid_due_date: item.lastPaidDueDate ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

function mapSavingsToRow(item, userId) {
  return {
    user_id: userId,
    id: item.id,
    name: item.name,
    target_paise: item.targetPaise,
    target_date: item.targetDate ?? null,
    notes: item.notes ?? null,
    entries: item.entries ?? [],
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }
}

export async function hydrateFinanceCacheFromCloud(userId, shouldAbort) {
  const client = getSupabaseClient()
  if (!client) {
    return { ok: false, error: 'Cloud storage is not configured.', offline: false }
  }

  if (typeof shouldAbort === 'function' && shouldAbort()) {
    return { ok: false, error: 'stale', aborted: true }
  }

  const [txRes, catRes, budRes, recRes, savRes] = await Promise.all([
    client.from('transactions').select('*'),
    client.from('categories').select('*'),
    client.from('budgets').select('*'),
    client.from('recurring_bills').select('*'),
    client.from('savings_goals').select('*'),
  ])

  if (typeof shouldAbort === 'function' && shouldAbort()) {
    return { ok: false, error: 'stale', aborted: true }
  }

  const failed = [txRes, catRes, budRes, recRes, savRes].find((res) => res.error)
  if (failed?.error) {
    const offline =
      typeof failed.error.message === 'string' &&
      (failed.error.message.toLowerCase().includes('fetch') ||
        failed.error.message.toLowerCase().includes('network'))
    return { ok: false, error: failed.error.message, offline }
  }

  const cache = {
    transactions: (txRes.data ?? []).map(mapTransactionRow),
    categories: (catRes.data ?? []).map(mapCategoryRow),
    budgets: (budRes.data ?? []).map(mapBudgetRow),
    recurringBills: (recRes.data ?? []).map(mapRecurringRow),
    savingsGoals: (savRes.data ?? []).map(mapSavingsRow),
  }

  const txVal = validateTransactions(cache.transactions)
  if (!txVal.ok) return { ok: false, error: 'Cloud transactions failed validation.' }
  const catVal = validateCategories(cache.categories)
  if (!catVal.ok) return { ok: false, error: 'Cloud categories failed validation.' }

  if (typeof shouldAbort === 'function' && shouldAbort()) {
    return { ok: false, error: 'stale', aborted: true }
  }

  setFinanceSession({
    userId,
    mode: 'cloud',
    status: 'ready',
    ready: true,
    error: null,
    syncError: null,
    cache: {
      transactions: txVal.transactions,
      categories: catVal.categories,
      budgets: cache.budgets,
      recurringBills: cache.recurringBills,
      savingsGoals: cache.savingsGoals,
    },
  })

  return { ok: true }
}

async function replaceCloudTable(table, rows, _userId) {
  const client = getSupabaseClient()
  if (!client) return { ok: false, error: 'Cloud storage is not configured.' }

  const { data: existing, error: readError } = await client.from(table).select('id')
  if (readError) return { ok: false, error: readError.message }

  const nextIds = new Set(rows.map((row) => row.id))
  const deleteIds = (existing ?? []).map((row) => row.id).filter((id) => !nextIds.has(id))

  if (deleteIds.length > 0) {
    const { error: deleteError } = await client.from(table).delete().in('id', deleteIds)
    if (deleteError) return { ok: false, error: deleteError.message }
  }

  if (rows.length > 0) {
    const { error: upsertError } = await client.from(table).upsert(rows, { onConflict: 'user_id,id' })
    if (upsertError) return { ok: false, error: upsertError.message }
  }

  return { ok: true }
}

async function persistTransactionsCloud(transactions) {
  const userId = getFinanceSession().userId
  if (!userId) return { ok: false, error: 'Not signed in.' }
  return replaceCloudTable(
    'transactions',
    transactions.map((item) => mapTransactionToRow(item, userId)),
    userId,
  )
}

async function persistCategoriesCloud(categories) {
  const userId = getFinanceSession().userId
  if (!userId) return { ok: false, error: 'Not signed in.' }
  return replaceCloudTable(
    'categories',
    categories.map((item) => mapCategoryToRow(item, userId)),
    userId,
  )
}

async function persistBudgetsCloud(budgets) {
  const userId = getFinanceSession().userId
  if (!userId) return { ok: false, error: 'Not signed in.' }
  return replaceCloudTable(
    'budgets',
    budgets.map((item) => mapBudgetToRow(item, userId)),
    userId,
  )
}

async function persistRecurringCloud(bills) {
  const userId = getFinanceSession().userId
  if (!userId) return { ok: false, error: 'Not signed in.' }
  return replaceCloudTable(
    'recurring_bills',
    bills.map((item) => mapRecurringToRow(item, userId)),
    userId,
  )
}

async function persistSavingsCloud(goals) {
  const userId = getFinanceSession().userId
  if (!userId) return { ok: false, error: 'Not signed in.' }
  return replaceCloudTable(
    'savings_goals',
    goals.map((item) => mapSavingsToRow(item, userId)),
    userId,
  )
}

function scheduleCloudPersist(kind, persistFn) {
  persistFn().then((result) => {
    if (!result.ok) {
      setFinanceSession({
        syncError: result.error ?? `Could not save ${kind} to the cloud.`,
      })
    } else {
      setFinanceSession({ syncError: null })
    }
  })
}

export function readCloudTransactions() {
  if (!isCloudFinanceActive()) return { ok: false, error: 'unavailable' }
  return { ok: true, transactions: [...getFinanceCache().transactions] }
}

export function saveCloudTransactions(transactions) {
  const validated = validateTransactions(transactions)
  if (!validated.ok) return { ok: false, error: 'invalid', errors: validated.errors }
  patchFinanceCache({ transactions: validated.transactions })
  scheduleCloudPersist('transactions', () => persistTransactionsCloud(validated.transactions))
  return { ok: true, transactions: validated.transactions }
}

export function readCloudCategories() {
  if (!isCloudFinanceActive()) return { ok: false, error: 'unavailable' }
  return { ok: true, categories: [...getFinanceCache().categories] }
}

export function saveCloudCategories(categories) {
  const validated = validateCategories(categories)
  if (!validated.ok) return { ok: false, error: 'invalid', errors: validated.errors }
  patchFinanceCache({ categories: validated.categories })
  scheduleCloudPersist('categories', () => persistCategoriesCloud(validated.categories))
  return { ok: true, categories: validated.categories }
}

export function readCloudBudgets() {
  if (!isCloudFinanceActive()) return { ok: false, error: 'unavailable' }
  return { ok: true, budgets: [...getFinanceCache().budgets] }
}

export function saveCloudBudgets(budgets, customCategories) {
  const validated = validateBudgets(budgets, customCategories ?? getFinanceCache().categories)
  if (!validated.ok) return { ok: false, error: 'invalid', errors: validated.errors }
  patchFinanceCache({ budgets: validated.budgets })
  scheduleCloudPersist('budgets', () => persistBudgetsCloud(validated.budgets))
  return { ok: true, budgets: validated.budgets }
}

export function readCloudRecurringBills() {
  if (!isCloudFinanceActive()) return { ok: false, error: 'unavailable' }
  return { ok: true, bills: [...getFinanceCache().recurringBills] }
}

export function saveCloudRecurringBills(bills, customCategories) {
  const validated = validateRecurringBills(bills, customCategories ?? getFinanceCache().categories)
  if (!validated.ok) return { ok: false, error: 'invalid', errors: validated.errors }
  patchFinanceCache({ recurringBills: validated.bills })
  scheduleCloudPersist('recurring bills', () => persistRecurringCloud(validated.bills))
  return { ok: true, bills: validated.bills }
}

export function readCloudSavingsGoals() {
  if (!isCloudFinanceActive()) return { ok: false, error: 'unavailable' }
  return { ok: true, goals: [...getFinanceCache().savingsGoals] }
}

export function saveCloudSavingsGoals(goals) {
  const validated = validateSavingsGoals(goals)
  if (!validated.ok) return { ok: false, error: 'invalid', errors: validated.errors }
  patchFinanceCache({ savingsGoals: validated.goals })
  scheduleCloudPersist('savings goals', () => persistSavingsCloud(validated.goals))
  return { ok: true, goals: validated.goals }
}

export function readCloudTransactionsRaw() {
  const result = readCloudTransactions()
  if (!result.ok) return result
  return { ok: true, raw: JSON.stringify(result.transactions) }
}

export function readCloudCategoriesRaw() {
  const result = readCloudCategories()
  if (!result.ok) return result
  return { ok: true, raw: JSON.stringify(result.categories) }
}

export function readCloudBudgetsRaw() {
  const result = readCloudBudgets()
  if (!result.ok) return result
  return { ok: true, raw: JSON.stringify(result.budgets) }
}

export function readCloudRecurringRaw() {
  const result = readCloudRecurringBills()
  if (!result.ok) return result
  return { ok: true, raw: JSON.stringify(result.bills) }
}

export function readCloudSavingsRaw() {
  const result = readCloudSavingsGoals()
  if (!result.ok) return result
  return { ok: true, raw: JSON.stringify(result.goals) }
}
