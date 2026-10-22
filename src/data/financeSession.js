/** @typedef {'idle' | 'loading' | 'ready' | 'error' | 'offline'} FinanceLoadStatus */

/**
 * @typedef {object} FinanceCache
 * @property {import('./transaction.js').Transaction[]} transactions
 * @property {import('./category.js').Category[]} categories
 * @property {import('./budget.js').Budget[]} budgets
 * @property {import('./recurringBill.js').RecurringBill[]} recurringBills
 * @property {import('./savingsGoal.js').SavingsGoal[]} savingsGoals
 */

const INITIAL = {
  userId: null,
  mode: /** @type {'local' | 'cloud'} */ ('local'),
  status: /** @type {FinanceLoadStatus} */ ('idle'),
  ready: false,
  error: null,
  syncError: null,
  cache: /** @type {FinanceCache | null} */ (null),
}

/** @type {typeof INITIAL} */
let financeSession = { ...INITIAL }

export function resetFinanceSession() {
  financeSession = { ...INITIAL, cache: null }
}

/** @param {Partial<typeof INITIAL>} patch */
export function setFinanceSession(patch) {
  financeSession = { ...financeSession, ...patch }
}

export function getFinanceSession() {
  return financeSession
}

export function isCloudFinanceActive(expectedUserId) {
  if (
    financeSession.userId === null ||
    financeSession.mode !== 'cloud' ||
    !financeSession.ready ||
    financeSession.status !== 'ready' ||
    financeSession.cache === null
  ) {
    return false
  }
  if (typeof expectedUserId === 'string' && expectedUserId !== financeSession.userId) {
    return false
  }
  return true
}

export function getFinanceCache() {
  return financeSession.cache
}

/** @param {Partial<FinanceCache>} patch */
export function patchFinanceCache(patch) {
  if (!financeSession.cache) return
  financeSession.cache = { ...financeSession.cache, ...patch }
}
