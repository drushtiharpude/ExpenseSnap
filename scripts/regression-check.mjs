import { createTransaction, updateTransaction } from '../src/data/transaction.js'
import { readTransactions, saveTransactions } from '../src/data/transactionStore.js'
import { createCategory } from '../src/data/category.js'
import { readCategories, saveCategories } from '../src/data/categoryStore.js'
import {
  parseBackupJson,
  applyBackupRestore,
  mergeBackupData,
  createBackupDocument,
  validateBackupDocument,
} from '../src/data/backup.js'
import { TRANSACTIONS_STORAGE_KEY } from '../src/data/transactionStore.js'
import { CATEGORIES_STORAGE_KEY } from '../src/data/categoryStore.js'
import { summarizeTransactions } from '../src/finance/summarize.js'
import {
  summarizeForMonth,
  assembleAnalyticsInsightList,
  buildAnalyticsInsights,
  buildSavingSuggestions,
  monthlyExpenseSeries,
  selectPrimaryDashboardInsight,
  INSIGHT_MIN_TOP_CATEGORY_SHARE_PERCENT,
} from '../src/finance/analyze.js'
import { splitBillPaise } from '../src/finance/splitBill.js'
import {
  appendDictationText,
  combineDictationSegments,
  dictationAppliedTranscript,
} from '../src/transactions/speechRecognition.js'
import { readTheme, saveTheme } from '../src/settings/themeStore.js'
import { createBudget, updateBudget, deleteBudget } from '../src/data/budget.js'
import { readBudgets, saveBudgets, BUDGETS_STORAGE_KEY } from '../src/data/budgetStore.js'
import { budgetStatusForMonth, buildBudgetInsights } from '../src/finance/budgetStatus.js'
import { safeToSpendForMonth } from '../src/finance/safeToSpend.js'
import {
  buildMoneyCoachSummary,
  MAX_COACH_TOP_CATEGORIES,
  SAFE_TO_SPEND_MODE_BUDGET_UNAVAILABLE,
  validateMoneyCoachSummary,
} from '../src/finance/moneyCoachSummary.js'
import {
  buildEquivalentPeriodExpenseTrend,
  buildExpenseMonthComparison,
  sumExpensesThroughDay,
} from '../src/finance/analyze.js'
import {
  buildMoneyCoachBrief,
  budgetProgressPercent,
  budgetUsagePercent,
} from '../src/finance/moneyCoachBrief.js'
import { createRecurringBill, validateRecurringBills } from '../src/data/recurringBill.js'
import {
  readRecurringBills,
  saveRecurringBills,
  RECURRING_BILLS_STORAGE_KEY,
} from '../src/data/recurringBillStore.js'
import {
  advanceDueDate,
  addMonthsLocal,
  addYearsLocal,
  billAfterPayment,
  canMarkBillPaid,
  localCalendarDateString,
} from '../src/finance/recurringBillSchedule.js'
import { payRecurringBill } from '../src/finance/recurringBillPay.js'
import {
  addSavingsGoalEntry,
  createSavingsGoal,
  deleteSavingsGoal,
  goalSavedBalancePaise,
} from '../src/data/savingsGoal.js'
import {
  readSavingsGoals,
  saveSavingsGoals,
  SAVINGS_GOALS_STORAGE_KEY,
} from '../src/data/savingsGoalStore.js'
import { goalProgressPercent, goalRingMetrics } from '../src/finance/savingsGoalProgress.js'
import {
  buildCategoryDonutSegments,
  buildDashboardCashFlow,
  monthKeysWindowEnding,
} from '../src/finance/dashboardVisuals.js'
import {
  buildDashboardWelcomeLine,
  dashboardDisplayName,
  resolveDashboardGreetName,
  timeOfDayGreeting,
} from '../src/finance/dashboardGreeting.js'
import { validateDisplayName, validateMotto } from '../src/auth/userProfile.js'
import { validateProfilePhotoPayload } from '../src/auth/profileMediaStore.js'
import {
  clampDashboardMonth,
  dashboardNextMonth,
  dashboardPreviousMonth,
  hasTransactionsInMonth,
} from '../src/finance/dashboardMonth.js'

const failures = []

function check(name, condition) {
  if (!condition) failures.push(name)
  else console.log(`OK ${name}`)
}

function memoryStorage() {
  const store = new Map()
  let failTx = false
  let failTxRestore = false
  let failBudget = false
  let failRecurringBills = false
  let failSavingsGoals = false
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      if (failTx && key === TRANSACTIONS_STORAGE_KEY) {
        throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
      }
      if (failTxRestore && key === TRANSACTIONS_STORAGE_KEY) {
        throw Object.assign(new Error('restore blocked'), { name: 'QuotaExceededError' })
      }
      if (failBudget && key === BUDGETS_STORAGE_KEY) {
        throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
      }
      if (failRecurringBills && key === RECURRING_BILLS_STORAGE_KEY) {
        throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
      }
      if (failSavingsGoals && key === SAVINGS_GOALS_STORAGE_KEY) {
        throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
      }
      store.set(key, value)
    },
    removeItem(key) {
      store.delete(key)
    },
    store,
    set failTx(value) {
      failTx = value
    },
    set failTxRestore(value) {
      failTxRestore = value
    },
    set failBudget(value) {
      failBudget = value
    },
    set failRecurringBills(value) {
      failRecurringBills = value
    },
    set failSavingsGoals(value) {
      failSavingsGoals = value
    },
  }
}

const now = new Date('2026-10-19T10:00:00.000Z')
const mem = memoryStorage()

const cat = createCategory({ name: 'Pets', type: 'expense' }, [], now)
check('create category', cat.ok)
saveCategories([cat.category], mem)
const expense = createTransaction(
  {
    type: 'expense',
    amountPaise: 25050,
    date: '2026-10-19',
    categoryId: cat.category.id,
    description: 'vet',
  },
  now,
)
const income = createTransaction(
  {
    type: 'income',
    amountPaise: 100000,
    date: '2026-10-19',
    categoryId: 'salary',
    description: 'pay',
  },
  now,
)
const sep = createTransaction(
  {
    type: 'expense',
    amountPaise: 8000,
    date: '2026-09-15',
    categoryId: 'food',
    description: '',
  },
  now,
)
saveTransactions([expense.transaction, income.transaction, sep.transaction], mem)

const edited = updateTransaction(expense.transaction, { amountPaise: 30000, description: 'vet updated' }, now)
saveTransactions(
  [edited.transaction, income.transaction, sep.transaction],
  mem,
)
check('edit stable id', readTransactions(mem).transactions.find((t) => t.id === expense.transaction.id).description === 'vet updated')

const summary = summarizeTransactions(readTransactions(mem).transactions, now)
check('dashboard net totals', summary.ok && summary.netPaise === 62000)
check('month totals', summary.ok && summary.monthExpensePaise === 30000 && summary.monthIncomePaise === 100000)

const split = splitBillPaise(1000, 3)
check(
  'split exact sum',
  split.ok && split.assignedPaise === 1000 && split.shares.reduce((t, s) => t + s.count * s.amountPaise, 0) === 1000,
)
check('split uneven', split.shares.some((s) => s.amountPaise === 334) && split.shares.some((s) => s.amountPaise === 333))

check('dictation append to empty', appendDictationText('', 'coffee run') === 'coffee run')
check(
  'dictation append with spacing',
  appendDictationText('Team lunch', 'client meeting') === 'Team lunch client meeting',
)
check(
  'dictation combine finals and interim',
  combineDictationSegments({ 0: 'coffee', 2: 'run' }, 'shop') === 'coffee run shop',
)
check(
  'dictation combine empty',
  combineDictationSegments({}, '') === '' && combineDictationSegments({ 1: '   ' }, '') === '',
)
check(
  'dictation applied detects new text',
  dictationAppliedTranscript('', 'coffee run') &&
    dictationAppliedTranscript('same', 'same') === false &&
    dictationAppliedTranscript('Team lunch', 'Team lunch client') === true,
)

const exportCategories = readCategories(mem).categories
const exportBudgets = readBudgets(mem, { customCategories: exportCategories }).budgets
const doc = createBackupDocument(
  readTransactions(mem).transactions,
  exportCategories,
  exportBudgets,
  [],
  [],
  now,
)
check('backup parse', parseBackupJson(JSON.stringify(doc)).ok)
check(
  'backup v4 field set',
  doc.backupVersion === 4 &&
    Array.isArray(doc.budgets) &&
    Array.isArray(doc.recurringBills) &&
    Array.isArray(doc.savingsGoals),
)
check('unsupported version', !parseBackupJson(JSON.stringify({ ...doc, backupVersion: 9 })).ok)

const docV1 = {
  backupVersion: 1,
  exportedAt: now.toISOString(),
  transactions: readTransactions(mem).transactions,
  categories: exportCategories,
}
check('backup v1 parse', parseBackupJson(JSON.stringify(docV1)).ok)
check(
  'backup v1 excludes budgets',
  parseBackupJson(JSON.stringify(docV1)).backup.includesBudgets === false,
)

const conflict = mergeBackupData(
  readTransactions(mem).transactions,
  exportCategories,
  {
    ...parseBackupJson(JSON.stringify(doc)).backup,
    transactions: [{ ...edited.transaction, amountPaise: 1 }],
  },
  exportBudgets,
)
check('merge id conflict', !conflict.ok)

const negativeMem = memoryStorage()
saveTransactions([createTransaction({ type: 'expense', amountPaise: 50000, date: '2026-10-20', categoryId: 'food', description: '' }, now).transaction], negativeMem)
check(
  'dashboard negative net',
  summarizeTransactions(readTransactions(negativeMem).transactions, now).netPaise === -50000,
)

mem.store.set(TRANSACTIONS_STORAGE_KEY, '{bad')
check('malformed tx read', !readTransactions(mem).ok)
check('malformed tx save blocked', !saveTransactions([], mem).ok)

const backup = parseBackupJson(JSON.stringify(doc)).backup

const localBudget = createBudget(
  { month: '2026-10', categoryId: 'food', limitPaise: 50000 },
  [],
  exportCategories,
  now,
)
check('backup fixture budget', localBudget.ok)
const v1BudgetMem = memoryStorage()
saveBudgets([localBudget.budget], v1BudgetMem, { customCategories: exportCategories })
saveTransactions(readTransactions(mem).transactions, v1BudgetMem)
saveCategories(exportCategories, v1BudgetMem)
const v1Replace = applyBackupRestore('replace', parseBackupJson(JSON.stringify(docV1)).backup, v1BudgetMem)
check('backup v1 replace leaves budgets', v1Replace.ok && readBudgets(v1BudgetMem, { customCategories: exportCategories }).budgets.length === 1)

const v2ClearMem = memoryStorage()
saveBudgets([localBudget.budget], v2ClearMem, { customCategories: exportCategories })
saveTransactions(readTransactions(mem).transactions, v2ClearMem)
saveCategories(exportCategories, v2ClearMem)
const v2ClearParsed = parseBackupJson(
  JSON.stringify(
    createBackupDocument(
      readTransactions(v1BudgetMem).transactions,
      exportCategories,
      [],
      [],
      [],
      now,
    ),
  ),
)
const v2ReplaceClear = applyBackupRestore('replace', v2ClearParsed.backup, v2ClearMem)
check(
  'backup v2 replace clears budgets',
  v2ReplaceClear.ok && readBudgets(v2ClearMem, { customCategories: exportCategories }).budgets.length === 0,
)

const invalidBudgetBackup = validateBackupDocument({
  ...doc,
  budgets: [
    {
      ...localBudget.budget,
      categoryId: 'missing-custom-category',
    },
  ],
})
check('backup invalid budget category rejected', !invalidBudgetBackup.ok)

const stableTransactions = readTransactions(v1BudgetMem).transactions

const budgetConflict = mergeBackupData(
  stableTransactions,
  exportCategories,
  {
    ...backup,
    budgets: [{ ...localBudget.budget, limitPaise: localBudget.budget.limitPaise + 1 }],
  },
  [localBudget.budget],
)
check('backup merge budget id conflict', !budgetConflict.ok)

const otherBudgetId = createBudget(
  { month: '2026-11', categoryId: 'food', limitPaise: 40000 },
  [],
  exportCategories,
  now,
)
const monthCategoryDup = mergeBackupData(
  stableTransactions,
  exportCategories,
  {
    ...backup,
    budgets: [
      {
        ...otherBudgetId.budget,
        id: '11111111-1111-4111-8111-111111111111',
        month: '2026-10',
        categoryId: 'food',
      },
    ],
  },
  [localBudget.budget],
)
check('backup merge budget month category conflict', !monthCategoryDup.ok)

const mergeBudgetBlockedMem = memoryStorage()
mergeBudgetBlockedMem.store.set(TRANSACTIONS_STORAGE_KEY, JSON.stringify(readTransactions(mem).transactions))
mergeBudgetBlockedMem.store.set(CATEGORIES_STORAGE_KEY, JSON.stringify(exportCategories))
mergeBudgetBlockedMem.store.set(BUDGETS_STORAGE_KEY, '{bad budgets')
const mergeBudgetSnapshot = mergeBudgetBlockedMem.store.get(BUDGETS_STORAGE_KEY)
const mergeBudgetBlocked = applyBackupRestore('merge', backup, mergeBudgetBlockedMem)
check(
  'backup merge blocked malformed budgets',
  !mergeBudgetBlocked.ok &&
    mergeBudgetBlockedMem.store.get(BUDGETS_STORAGE_KEY) === mergeBudgetSnapshot,
)

const recoveryTxMem = memoryStorage()
recoveryTxMem.store.set(TRANSACTIONS_STORAGE_KEY, '{bad')
recoveryTxMem.store.set(CATEGORIES_STORAGE_KEY, JSON.stringify([cat.category]))
const recoveryTx = applyBackupRestore('replace', backup, recoveryTxMem)
check(
  'replace recovery malformed tx',
  recoveryTx.ok &&
    recoveryTx.summary.recoveredFromMalformedStorage &&
    readTransactions(recoveryTxMem).transactions.length === 3,
)

const recoveryCatMem = memoryStorage()
recoveryCatMem.store.set(TRANSACTIONS_STORAGE_KEY, JSON.stringify([]))
recoveryCatMem.store.set(CATEGORIES_STORAGE_KEY, '{bad cat')
const recoveryCat = applyBackupRestore('replace', backup, recoveryCatMem)
check(
  'replace recovery malformed category',
  recoveryCat.ok &&
    recoveryCat.summary.recoveredFromMalformedStorage &&
    readCategories(recoveryCatMem).categories.length === 1,
)

const invalidStoreMem = memoryStorage()
invalidStoreMem.store.set(TRANSACTIONS_STORAGE_KEY, '{bad')
invalidStoreMem.store.set(CATEGORIES_STORAGE_KEY, 'also-bad')
const invalidSnapshot = {
  tx: invalidStoreMem.store.get(TRANSACTIONS_STORAGE_KEY),
  cat: invalidStoreMem.store.get(CATEGORIES_STORAGE_KEY),
}
const invalidBackup = validateBackupDocument({
  ...doc,
  transactions: [{ ...edited.transaction, categoryId: 'missing-category-id' }],
})
check('missing category references rejected', !invalidBackup.ok)
check(
  'invalid backup leaves storage unchanged',
  invalidBackup.ok === false &&
    invalidStoreMem.store.get(TRANSACTIONS_STORAGE_KEY) === invalidSnapshot.tx &&
    invalidStoreMem.store.get(CATEGORIES_STORAGE_KEY) === invalidSnapshot.cat,
)

const mergeBlockedMem = memoryStorage()
mergeBlockedMem.store.set(TRANSACTIONS_STORAGE_KEY, '{bad')
mergeBlockedMem.store.set(CATEGORIES_STORAGE_KEY, JSON.stringify([cat.category]))
const mergeSnapshot = {
  tx: mergeBlockedMem.store.get(TRANSACTIONS_STORAGE_KEY),
  cat: mergeBlockedMem.store.get(CATEGORIES_STORAGE_KEY),
}
const mergeBlocked = applyBackupRestore('merge', backup, mergeBlockedMem)
check(
  'merge blocked malformed storage',
  !mergeBlocked.ok &&
    mergeBlockedMem.store.get(TRANSACTIONS_STORAGE_KEY) === mergeSnapshot.tx &&
    mergeBlockedMem.store.get(CATEGORIES_STORAGE_KEY) === mergeSnapshot.cat,
)

const rollbackMem = memoryStorage()
const rollbackTxRaw = '{bad'
const rollbackCatRaw = JSON.stringify([cat.category])
const rollbackBudgetRaw = JSON.stringify([localBudget.budget])
rollbackMem.store.set(TRANSACTIONS_STORAGE_KEY, rollbackTxRaw)
rollbackMem.store.set(CATEGORIES_STORAGE_KEY, rollbackCatRaw)
rollbackMem.store.set(BUDGETS_STORAGE_KEY, rollbackBudgetRaw)
rollbackMem.failTx = true
const rollbackFail = applyBackupRestore('replace', backup, rollbackMem)
check('recovery rollback after tx write fail', !rollbackFail.ok)
check(
  'recovery rollback restores raw tx',
  rollbackMem.store.get(TRANSACTIONS_STORAGE_KEY) === rollbackTxRaw,
)
check(
  'recovery rollback restores raw categories',
  rollbackMem.store.get(CATEGORIES_STORAGE_KEY) === rollbackCatRaw,
)
check(
  'recovery rollback restores raw budgets',
  rollbackMem.store.get(BUDGETS_STORAGE_KEY) === rollbackBudgetRaw,
)
check(
  'recovery rollback message accurate',
  rollbackFail.errors.some((e) => e.includes('put back')),
)

const rollbackFailMem = memoryStorage()
rollbackFailMem.store.set(TRANSACTIONS_STORAGE_KEY, '{bad')
rollbackFailMem.store.set(CATEGORIES_STORAGE_KEY, rollbackCatRaw)
rollbackFailMem.failTx = true
rollbackFailMem.failTxRestore = true
const rollbackFailReport = applyBackupRestore('replace', backup, rollbackFailMem)
check('recovery rollback failure reported', !rollbackFailReport.ok)
check(
  'recovery rollback failure message honest',
  rollbackFailReport.errors.some((e) => e.includes('could not be put back automatically')),
)
check(
  'recovery rollback failure not claimed success',
  !rollbackFailReport.errors.some((e) => e.includes('were put back.')),
)

mem.store.set(TRANSACTIONS_STORAGE_KEY, JSON.stringify([edited.transaction, income.transaction, sep.transaction]))
mem.store.set(CATEGORIES_STORAGE_KEY, JSON.stringify([cat.category]))
mem.failTx = true
const restoreFail = applyBackupRestore('replace', backup, mem)
check('restore rollback path', !restoreFail.ok)

const rereadMem = memoryStorage()
saveTransactions([], rereadMem)
saveCategories([], rereadMem)
saveBudgets([], rereadMem, { customCategories: [] })
const rereadReplace = applyBackupRestore('replace', backup, rereadMem)
check(
  'restore storage reread transactions',
  rereadReplace.ok &&
    readTransactions(rereadMem).ok &&
    readTransactions(rereadMem).transactions.length === backup.transactions.length,
)
check(
  'restore storage reread categories',
  readCategories(rereadMem).ok && readCategories(rereadMem).categories.length === backup.categories.length,
)

const budgetRollbackMem = memoryStorage()
saveCategories(exportCategories, budgetRollbackMem)
saveBudgets([localBudget.budget], budgetRollbackMem, { customCategories: exportCategories })
saveTransactions(readTransactions(mem).transactions, budgetRollbackMem)
budgetRollbackMem.failBudget = true
const budgetWriteFail = applyBackupRestore('replace', backup, budgetRollbackMem)
check('backup replace rollback after budget write fail', !budgetWriteFail.ok)
check(
  'backup replace budget fail keeps categories',
  readCategories(budgetRollbackMem).categories.length === exportCategories.length,
)

const oct = summarizeForMonth(readTransactions({ ...mem, failTx: false }).transactions, '2026-10')
check('analytics expenses only in chart month', oct.expensePaise === 30000 && oct.incomePaise === 100000)
const insightTx = readTransactions({ ...mem, failTx: false }).transactions
const insights = buildAnalyticsInsights(insightTx, '2026-10')
check('analytics insights', insights.some((i) => i.id === 'top-category') && insights.some((i) => i.id === 'expense-vs-previous'))
const monthlySeries = monthlyExpenseSeries(insightTx)
check('analytics series', monthlySeries.ok)
check(
  'analytics monthly income and expense bars',
  monthlySeries.months.some(
    (row) =>
      row.month === '2026-10' && row.incomePaise === 100000 && row.expensePaise === 30000,
  ),
)

const momInsight = insights.find((entry) => entry.id === 'expense-vs-previous')
check(
  'smart insight mom percent increase',
  momInsight?.diffPaise === 22000 && momInsight?.percentChange === 275,
)
check(
  'smart insight category mom up',
  insights.some((entry) => entry.id === `category-mom-up:${cat.category.id}`),
)

const augExpense = createTransaction(
  { type: 'expense', amountPaise: 20000, date: '2026-08-10', categoryId: 'food', description: '' },
  now,
).transaction
const sepMomTx = [...insightTx, augExpense]
const sepInsights = buildAnalyticsInsights(sepMomTx, '2026-09')
const sepMom = sepInsights.find((entry) => entry.id === 'expense-vs-previous')
check(
  'smart insight mom percent decrease',
  sepMom?.diffPaise === -12000 && sepMom?.percentChange === -60,
)

const zeroPrevInsights = buildAnalyticsInsights(insightTx, '2026-09')
const zeroPrevMom = zeroPrevInsights.find((entry) => entry.id === 'expense-vs-previous')
check(
  'smart insight mom no percent zero previous',
  zeroPrevMom?.diffPaise === 8000 && zeroPrevMom?.percentChange === undefined,
)

const bothZeroInsights = buildAnalyticsInsights(insightTx, '2026-07')
check(
  'smart insight mom both months zero',
  !bothZeroInsights.some((entry) => entry.id === 'expense-vs-previous'),
)

const multiIncreaseTx = [
  createTransaction(
    { type: 'expense', amountPaise: 10000, date: '2026-10-01', categoryId: 'food', description: '' },
    now,
  ).transaction,
  createTransaction(
    { type: 'expense', amountPaise: 5000, date: '2026-10-02', categoryId: 'transport', description: '' },
    now,
  ).transaction,
  createTransaction(
    { type: 'expense', amountPaise: 3000, date: '2026-10-03', categoryId: 'bills', description: '' },
    now,
  ).transaction,
  createTransaction(
    { type: 'expense', amountPaise: 2000, date: '2026-10-04', categoryId: 'shopping', description: '' },
    now,
  ).transaction,
  createTransaction(
    { type: 'expense', amountPaise: 1000, date: '2026-09-01', categoryId: 'food', description: '' },
    now,
  ).transaction,
]
const multiInsights = buildAnalyticsInsights(multiIncreaseTx, '2026-10')
const categoryUps = multiInsights.filter((entry) => entry.id.startsWith('category-mom-up:'))
check('smart insight category increase cap three', categoryUps.length === 3)
check(
  'smart insight category increase unique ids',
  new Set(categoryUps.map((entry) => entry.id)).size === categoryUps.length,
)
const decreaseTx = [
  createTransaction(
    { type: 'expense', amountPaise: 5000, date: '2026-09-01', categoryId: 'food', description: '' },
    now,
  ).transaction,
  createTransaction(
    { type: 'expense', amountPaise: 2000, date: '2026-10-01', categoryId: 'food', description: '' },
    now,
  ).transaction,
]
check(
  'smart insight category decrease excluded',
  !buildAnalyticsInsights(decreaseTx, '2026-10').some((entry) => entry.id === 'category-mom-up:food'),
)

check(
  'smart insight insufficient transaction data',
  buildAnalyticsInsights([{ type: 'expense', amountPaise: 1 }], '2026-10').length === 0,
)

const budgetInsightRow = createBudget(
  { month: '2026-10', categoryId: 'food', limitPaise: 50000 },
  [],
  [],
  now,
)
const budgetInsightStatus = budgetStatusForMonth(
  [budgetInsightRow.budget],
  insightTx,
  '2026-10',
  [cat.category],
)
const budgetFacts = buildBudgetInsights(budgetInsightStatus)
check(
  'smart insight budget facts from status',
  budgetFacts.length === 0 || budgetFacts.every((entry) => entry.id.startsWith('budget-')),
)
check('smart insight invalid budget status', buildBudgetInsights({ ok: false }).length === 0)

const overBudgetStatus = budgetStatusForMonth(
  [budgetInsightRow.budget],
  [
    ...insightTx,
    createTransaction(
      { type: 'expense', amountPaise: 60000, date: '2026-10-20', categoryId: 'food', description: '' },
      now,
    ).transaction,
  ],
  '2026-10',
  [],
)
check(
  'smart insight budget exceeded observation',
  buildBudgetInsights(overBudgetStatus).some((entry) => entry.id.startsWith('budget-exceeded:')),
)
check(
  'smart insight saving suggestion exceeded',
  buildSavingSuggestions(overBudgetStatus, []).some((entry) =>
    entry.id.startsWith('suggestion-budget-exceeded:'),
  ),
)

const topShareTx = ['food', 'transport', 'bills', 'shopping', 'health', 'other'].map(
  (categoryId, index) =>
    createTransaction(
      {
        type: 'expense',
        amountPaise: 1000,
        date: `2026-10-${String(index + 1).padStart(2, '0')}`,
        categoryId,
        description: '',
      },
      now,
    ).transaction,
)
const lowShareInsights = buildAnalyticsInsights(topShareTx, '2026-10')
check(
  'insight top category needs significant share',
  !lowShareInsights.some((entry) => entry.id === 'top-category') &&
    INSIGHT_MIN_TOP_CATEGORY_SHARE_PERCENT === 20,
)

const overBudgetInsights = buildBudgetInsights(overBudgetStatus)
const overSuggestions = buildSavingSuggestions(overBudgetStatus, [])
const assembledOver = assembleAnalyticsInsightList([], overBudgetInsights, overSuggestions)
check(
  'insight analytics omits duplicate budget suggestion',
  assembledOver.some((entry) => entry.id.startsWith('budget-exceeded:')) &&
    !assembledOver.some((entry) => entry.id.startsWith('suggestion-budget-exceeded:')),
)

const dashboardPrimaryOver = selectPrimaryDashboardInsight({
  summary: { ok: true, month: '2026-10', monthExpensePaise: 90000, monthIncomePaise: 0 },
  monthSummary: summarizeForMonth(
    [
      ...insightTx,
      createTransaction(
        { type: 'expense', amountPaise: 60000, date: '2026-10-20', categoryId: 'food', description: '' },
        now,
      ).transaction,
    ],
    '2026-10',
  ),
  budgetStatus: overBudgetStatus,
  customCategories: [],
})
check(
  'insight dashboard prioritizes budget exceeded',
  dashboardPrimaryOver?.title === 'Budget watch' && dashboardPrimaryOver.body.includes('over your'),
)

const budgetMem = memoryStorage()
const foodBudget = createBudget(
  { month: '2026-10', categoryId: 'food', limitPaise: 50000 },
  [],
  [],
  now,
)
check('budget create valid', foodBudget.ok)
const savedBudget = saveBudgets([foodBudget.budget], budgetMem)
check('budget save read', savedBudget.ok && readBudgets(budgetMem).budgets[0].limitPaise === 50000)

check(
  'budget invalid month',
  !createBudget({ month: '2026-13', categoryId: 'food', limitPaise: 100 }, [], [], now).ok,
)
check(
  'budget invalid amount',
  !createBudget({ month: '2026-10', categoryId: 'food', limitPaise: 0 }, [], [], now).ok,
)
check(
  'budget income category rejected',
  !createBudget({ month: '2026-10', categoryId: 'salary', limitPaise: 10000 }, [], [], now).ok,
)

const dupBudget = createBudget(
  { month: '2026-10', categoryId: 'food', limitPaise: 20000 },
  [foodBudget.budget],
  [],
  now,
)
check('budget duplicate month category', !dupBudget.ok)

const customBudget = createBudget(
  { month: '2026-10', categoryId: cat.category.id, limitPaise: 15000 },
  [],
  [cat.category],
  now,
)
check('budget custom expense category', customBudget.ok)

const updatedBudget = updateBudget(
  foodBudget.budget,
  { limitPaise: 60000 },
  [foodBudget.budget],
  [],
  now,
)
check('budget update limit', updatedBudget.ok && updatedBudget.budget.limitPaise === 60000)

const removed = deleteBudget([updatedBudget.budget, customBudget.budget], customBudget.budget.id)
check(
  'budget delete',
  removed.ok && removed.budgets.length === 1 && removed.budgets[0].id === updatedBudget.budget.id,
)

function categoryDeleteBlockedByBudgets(categoryId, customCategories, storage) {
  const budgets = readBudgets(storage, { customCategories })
  if (!budgets.ok) return { blocked: true, unreadable: true }
  return {
    blocked: budgets.budgets.some((budget) => budget.categoryId === categoryId),
    unreadable: false,
  }
}

function categoryDeleteBlockedByRecurringBills(categoryId, customCategories, storage) {
  const bills = readRecurringBills(storage, { customCategories })
  if (!bills.ok) return { blocked: true, unreadable: true }
  return {
    blocked: bills.bills.some((bill) => bill.categoryId === categoryId),
    unreadable: false,
  }
}

const guardMem = memoryStorage()
saveCategories([cat.category], guardMem)
const guardBudget = createBudget(
  { month: '2026-10', categoryId: cat.category.id, limitPaise: 10000 },
  [],
  [cat.category],
  now,
)
saveBudgets([guardBudget.budget], guardMem, { customCategories: [cat.category] })
check(
  'category delete blocked when budget references id',
  categoryDeleteBlockedByBudgets(cat.category.id, [cat.category], guardMem).blocked,
)

const unusedCategory = createCategory({ name: 'Misc', type: 'expense' }, [cat.category], now)
saveCategories([cat.category, unusedCategory.category], guardMem)
check(
  'category delete allowed without budget reference',
  !categoryDeleteBlockedByBudgets(
    unusedCategory.category.id,
    [cat.category, unusedCategory.category],
    guardMem,
  ).blocked,
)

const guardMalformedMem = memoryStorage()
saveCategories([cat.category], guardMalformedMem)
guardMalformedMem.store.set(BUDGETS_STORAGE_KEY, '{bad budgets')
check(
  'category delete blocked when budgets unreadable',
  categoryDeleteBlockedByBudgets(cat.category.id, [cat.category], guardMalformedMem).unreadable,
)

const recurringGuardMem = memoryStorage()
saveCategories([cat.category], recurringGuardMem)
const recurringGuardBill = createRecurringBill(
  {
    title: 'Club',
    amountPaise: 50000,
    categoryId: cat.category.id,
    frequency: 'monthly',
    nextDueDate: '2026-11-01',
  },
  [cat.category],
  now,
)
saveRecurringBills([recurringGuardBill.bill], recurringGuardMem, { customCategories: [cat.category] })
check(
  'category delete blocked when recurring bill references id',
  categoryDeleteBlockedByRecurringBills(cat.category.id, [cat.category], recurringGuardMem).blocked,
)

budgetMem.store.set(BUDGETS_STORAGE_KEY, '{bad')
check('budget malformed read', !readBudgets(budgetMem).ok)
check('budget malformed save blocked', !saveBudgets([], budgetMem).ok)

const foodBudgetRow = createBudget(
  { month: '2026-10', categoryId: 'food', limitPaise: 50000 },
  [],
  [],
  now,
)
const petsBudgetRow = createBudget(
  { month: '2026-10', categoryId: cat.category.id, limitPaise: 20000 },
  [foodBudgetRow.budget],
  [cat.category],
  now,
)
const statusBudgets = [foodBudgetRow.budget, petsBudgetRow.budget]
const statusTxBase = [income.transaction, sep.transaction]

function statusForFoodSpent(spentPaise) {
  const tx = [...statusTxBase]
  if (spentPaise > 0) {
    tx.push(
      createTransaction(
        {
          type: 'expense',
          amountPaise: spentPaise,
          date: '2026-10-15',
          categoryId: 'food',
          description: '',
        },
        now,
      ).transaction,
    )
  }
  return budgetStatusForMonth(statusBudgets, tx, '2026-10', [cat.category])
}

const noSpend = budgetStatusForMonth(statusBudgets, statusTxBase, '2026-10', [cat.category])
check(
  'budget status no spending',
  noSpend.ok &&
    noSpend.items.find((i) => i.categoryId === 'food').spentPaise === 0 &&
    noSpend.items.find((i) => i.categoryId === 'food').percentUsed === 0 &&
    noSpend.items.find((i) => i.categoryId === 'food').status === 'ok',
)

const below80 = statusForFoodSpent(39000)
check(
  'budget status below 80',
  below80.ok && below80.items.find((i) => i.categoryId === 'food').status === 'ok',
)

const at80 = statusForFoodSpent(40000)
check(
  'budget status at 80',
  at80.ok &&
    at80.items.find((i) => i.categoryId === 'food').percentUsed === 80 &&
    at80.items.find((i) => i.categoryId === 'food').status === 'approaching',
)

const between80 = statusForFoodSpent(45000)
check(
  'budget status between 80 and 100',
  between80.ok && between80.items.find((i) => i.categoryId === 'food').status === 'approaching',
)

const atLimit = statusForFoodSpent(50000)
check(
  'budget status at limit',
  atLimit.ok &&
    atLimit.items.find((i) => i.categoryId === 'food').percentUsed === 100 &&
    atLimit.items.find((i) => i.categoryId === 'food').status === 'approaching',
)

const overLimit = statusForFoodSpent(50001)
check(
  'budget status over limit',
  overLimit.ok &&
    overLimit.items.find((i) => i.categoryId === 'food').status === 'exceeded' &&
    overLimit.items.find((i) => i.categoryId === 'food').remainingPaise === -1,
)

const crossMonth = budgetStatusForMonth(
  statusBudgets,
  [
    ...statusTxBase,
    createTransaction(
      {
        type: 'expense',
        amountPaise: 12000,
        date: '2026-10-10',
        categoryId: 'food',
        description: '',
      },
      now,
    ).transaction,
  ],
  '2026-10',
  [cat.category],
)
check(
  'budget status excludes other months',
  crossMonth.ok &&
    crossMonth.items.find((i) => i.categoryId === 'food').spentPaise === 12000,
)

const incomeMix = budgetStatusForMonth(
  statusBudgets,
  [
    ...statusTxBase,
    income.transaction,
    createTransaction(
      {
        type: 'expense',
        amountPaise: 30000,
        date: '2026-10-12',
        categoryId: 'food',
        description: '',
      },
      now,
    ).transaction,
  ],
  '2026-10',
  [cat.category],
)
check(
  'budget status excludes income',
  incomeMix.ok &&
    incomeMix.items.find((i) => i.categoryId === 'food').spentPaise === 30000,
)

check(
  'budget status custom label',
  noSpend.ok &&
    noSpend.items.find((i) => i.categoryId === cat.category.id).categoryLabel === 'Pets',
)

check(
  'budget status invalid month',
  !budgetStatusForMonth(statusBudgets, statusTxBase, '2026-13', []).ok,
)
check(
  'budget status failed summary',
  !budgetStatusForMonth(statusBudgets, [{ type: 'expense', amountPaise: 1 }], '2026-10', []).ok,
)

const stsNow = new Date('2026-10-19T10:00:00.000Z')
const stsFoodBudget = createBudget(
  { month: '2026-10', categoryId: 'food', limitPaise: 50000 },
  [],
  [],
  stsNow,
).budget

check(
  'safe to spend no transactions',
  safeToSpendForMonth([], [], '2026-10', [], stsNow).ok &&
    safeToSpendForMonth([], [], '2026-10', [], stsNow).mode === 'empty_month' &&
    safeToSpendForMonth([], [], '2026-10', [], stsNow).headlinePaise === null,
)

const stsIncomeOnly = safeToSpendForMonth(
  [income.transaction],
  [],
  '2026-10',
  [],
  stsNow,
)
check(
  'safe to spend income without budgets',
  stsIncomeOnly.ok &&
    stsIncomeOnly.mode === 'income_only' &&
    stsIncomeOnly.headlinePaise === null &&
    stsIncomeOnly.monthNetPaise === 100000,
)

const stsBudgetNoIncome = safeToSpendForMonth(
  [
    createTransaction(
      {
        type: 'expense',
        amountPaise: 30000,
        date: '2026-10-12',
        categoryId: 'food',
        description: '',
      },
      stsNow,
    ).transaction,
  ],
  [stsFoodBudget],
  '2026-10',
  [],
  stsNow,
)
check(
  'safe to spend budgets without income',
  stsBudgetNoIncome.ok &&
    stsBudgetNoIncome.mode === 'budget_only' &&
    stsBudgetNoIncome.headlinePaise === 20000 &&
    stsBudgetNoIncome.budgetSpentPaise === 30000,
)

const stsFoodTx30k = createTransaction(
  {
    type: 'expense',
    amountPaise: 30000,
    date: '2026-10-12',
    categoryId: 'food',
    description: '',
  },
  stsNow,
).transaction
const stsCombined = safeToSpendForMonth(
  [income.transaction, stsFoodTx30k],
  [stsFoodBudget],
  '2026-10',
  [],
  stsNow,
)
check(
  'safe to spend income and budgets combined',
  stsCombined.ok &&
    stsCombined.mode === 'combined' &&
    stsCombined.headlinePaise === 20000 &&
    stsCombined.monthNetPaise === 70000,
)

const stsOver = safeToSpendForMonth(
  [
    createTransaction(
      {
        type: 'expense',
        amountPaise: 55000,
        date: '2026-10-12',
        categoryId: 'food',
        description: '',
      },
      stsNow,
    ).transaction,
  ],
  [stsFoodBudget],
  '2026-10',
  [],
  stsNow,
)
check(
  'safe to spend over budget',
  stsOver.ok && stsOver.headlinePaise === -5000 && stsOver.budgetRemainingPaise === -5000,
)

const stsUnbudgeted = safeToSpendForMonth(
  [
    createTransaction(
      {
        type: 'expense',
        amountPaise: 10000,
        date: '2026-10-05',
        categoryId: 'food',
        description: '',
      },
      stsNow,
    ).transaction,
    createTransaction(
      {
        type: 'expense',
        amountPaise: 7000,
        date: '2026-10-08',
        categoryId: 'transport',
        description: '',
      },
      stsNow,
    ).transaction,
  ],
  [stsFoodBudget],
  '2026-10',
  [],
  stsNow,
)
check(
  'safe to spend unbudgeted expenses',
  stsUnbudgeted.ok &&
    stsUnbudgeted.budgetSpentPaise === 10000 &&
    stsUnbudgeted.unbudgetedExpensePaise === 7000 &&
    stsUnbudgeted.monthExpensePaise === 17000,
)

check(
  'safe to spend zero month activity with budgets',
  safeToSpendForMonth([], [stsFoodBudget], '2026-10', [], stsNow).ok &&
    safeToSpendForMonth([], [stsFoodBudget], '2026-10', [], stsNow).mode ===
      'empty_month_with_budgets' &&
    safeToSpendForMonth([], [stsFoodBudget], '2026-10', [], stsNow).headlinePaise === 50000,
)

const stsBoundary = safeToSpendForMonth(
  [
    sep.transaction,
    createTransaction(
      {
        type: 'expense',
        amountPaise: 5000,
        date: '2026-10-01',
        categoryId: 'food',
        description: '',
      },
      stsNow,
    ).transaction,
  ],
  [stsFoodBudget],
  '2026-10',
  [],
  stsNow,
)
check(
  'safe to spend month boundary',
  stsBoundary.ok &&
    stsBoundary.budgetSpentPaise === 5000 &&
    stsBoundary.monthExpensePaise === 5000,
)

const coachNow = new Date('2026-10-19T10:00:00.000Z')
const coachTx = createTransaction(
  {
    type: 'expense',
    amountPaise: 9900,
    date: '2026-10-05',
    categoryId: 'food',
    description: 'REGRESSION_SECRET_DESCRIPTION',
  },
  coachNow,
)
check('money coach summary build', coachTx.ok)
const coachBuilt = buildMoneyCoachSummary({
  transactions: coachTx.ok ? [coachTx.transaction] : [],
  budgets: [],
  customCategories: [],
  now: coachNow,
})
check(
  'money coach summary month totals',
  coachBuilt.ok &&
    coachBuilt.summary.totals.expensePaise === 9900 &&
    validateMoneyCoachSummary(coachBuilt.summary).ok,
)
const coachJson = coachBuilt.ok ? JSON.stringify(coachBuilt.summary) : ''
check(
  'money coach summary privacy',
  coachBuilt.ok &&
    !coachJson.includes('REGRESSION_SECRET_DESCRIPTION') &&
    !coachJson.includes(coachTx.transaction.id),
)
check(
  'money coach summary empty',
  buildMoneyCoachSummary({ transactions: [], budgets: [], now: coachNow }).ok,
)
check(
  'money coach summary invalid transactions',
  buildMoneyCoachSummary({ transactions: null, budgets: [], now: coachNow }).ok === false,
)
check(
  'money coach summary category limit constant',
  MAX_COACH_TOP_CATEGORIES === 8,
)
const coachUnavailable = buildMoneyCoachSummary({
  transactions: [],
  budgets: [],
  now: coachNow,
  budgetDataStatus: 'unavailable',
})
check(
  'money coach summary budget unavailable status',
  coachUnavailable.ok &&
    coachUnavailable.summary.budgetDataStatus === 'unavailable' &&
    coachUnavailable.summary.safeToSpend.mode === SAFE_TO_SPEND_MODE_BUDGET_UNAVAILABLE &&
    coachUnavailable.summary.safeToSpend.headlinePaise === null &&
    coachUnavailable.summary.safeToSpend.budgetRemainingPaise === null &&
    validateMoneyCoachSummary(coachUnavailable.summary).ok,
)

const coachOverBudget = createBudget(
  { month: '2026-10', categoryId: 'food', limitPaise: 1000 },
  [],
  coachNow,
)
const coachOverTx = createTransaction(
  {
    type: 'expense',
    amountPaise: 5000,
    date: '2026-10-08',
    categoryId: 'food',
    description: 'brief test',
  },
  coachNow,
)
const coachOverBuilt = buildMoneyCoachSummary({
  transactions: coachOverTx.ok ? [coachOverTx.transaction] : [],
  budgets: coachOverBudget.ok ? [coachOverBudget.budget] : [],
  now: coachNow,
})
const coachBrief =
  coachOverBuilt.ok && coachOverTx.ok
    ? buildMoneyCoachBrief({
        summary: coachOverBuilt.summary,
        monthKey: coachOverBuilt.month,
        customCategories: [],
        records: [coachOverTx.transaction],
        budgets: coachOverBudget.ok ? [coachOverBudget.budget] : [],
        budgetsAvailable: true,
        now: coachNow,
      })
    : null
check(
  'money coach brief prioritizes exceeded budget',
  coachBrief?.ok &&
    coachBrief.priority === 'high' &&
    coachBrief.highlightBudget?.status === 'exceeded' &&
    coachBrief.nextSteps.length >= 1,
)
check(
  'money coach budget usage percent over limit',
  budgetUsagePercent(125000, 100000) === 125 && budgetProgressPercent(125000, 100000) === 100,
)

const trendNow = new Date('2026-10-19T12:00:00.000Z')
const sepTrendTx = createTransaction(
  { type: 'expense', amountPaise: 10000, date: '2026-09-08', categoryId: 'food', description: 't' },
  trendNow,
)
const octTrendTx = createTransaction(
  { type: 'expense', amountPaise: 25000, date: '2026-10-08', categoryId: 'food', description: 't' },
  trendNow,
)
const octTrendIncome = createTransaction(
  { type: 'income', amountPaise: 100000, date: '2026-10-01', categoryId: 'salary', description: 't' },
  trendNow,
)
check(
  'money coach equivalent period sum',
  sepTrendTx.ok &&
    octTrendTx.ok &&
    sumExpensesThroughDay([sepTrendTx.transaction, octTrendTx.transaction], '2026-10', 19).ok &&
    sumExpensesThroughDay([sepTrendTx.transaction, octTrendTx.transaction], '2026-10', 19)
      .totalExpensePaise === 25000,
)
const trendRecords =
  sepTrendTx.ok && octTrendTx.ok && octTrendIncome.ok
    ? [sepTrendTx.transaction, octTrendTx.transaction, octTrendIncome.transaction]
    : []
const equivTrend = buildEquivalentPeriodExpenseTrend(trendRecords, '2026-10', trendNow)
check(
  'money coach equivalent period category increase',
  equivTrend?.bestCategoryIncrease?.diffPaise === 15000,
)
const trendBuilt = buildMoneyCoachSummary({
  transactions: trendRecords,
  budgets: [],
  now: trendNow,
})
const trendBrief = trendBuilt.ok
  ? buildMoneyCoachBrief({
      summary: trendBuilt.summary,
      monthKey: trendBuilt.month,
      customCategories: [],
      records: trendRecords,
      budgets: [],
      budgetsAvailable: true,
      now: trendNow,
    })
  : null
check(
  'money coach brief trend increase warning',
  trendBrief?.ok &&
    trendBrief.priority === 'high' &&
    trendBrief.attention.includes('higher than the same period last month'),
)

const sepLow = createTransaction(
  { type: 'expense', amountPaise: 30000, date: '2026-09-05', categoryId: 'food', description: 't' },
  trendNow,
)
const octLow = createTransaction(
  { type: 'expense', amountPaise: 10000, date: '2026-10-05', categoryId: 'food', description: 't' },
  trendNow,
)
const octLowIncome = createTransaction(
  { type: 'income', amountPaise: 100000, date: '2026-10-01', categoryId: 'salary', description: 't' },
  trendNow,
)
const lowRecords =
  sepLow.ok && octLow.ok && octLowIncome.ok
    ? [sepLow.transaction, octLow.transaction, octLowIncome.transaction]
    : []
const lowBuilt = buildMoneyCoachSummary({
  transactions: lowRecords,
  budgets: [],
  now: trendNow,
})
const lowBrief =
  lowBuilt.ok && sepLow.ok && octLow.ok
    ? buildMoneyCoachBrief({
        summary: lowBuilt.summary,
        monthKey: lowBuilt.month,
        customCategories: [],
        records: lowRecords,
        budgets: [],
        budgetsAvailable: true,
        now: trendNow,
      })
    : null
check(
  'money coach brief trend decrease reinforcement',
  lowBrief?.ok &&
    lowBrief.priority === 'normal' &&
    lowBrief.attention.includes('lower than the same period last month'),
)

saveTheme('dark', { ...mem, failTx: false })
check('theme persistence', readTheme(mem).theme === 'dark')

check('recurring bill validation rejects bad amount', !createRecurringBill({ title: 'Rent', amountPaise: 0, categoryId: 'food', frequency: 'monthly', nextDueDate: '2026-10-01' }, []).ok)
const billFixture = createRecurringBill(
  { title: 'Rent', amountPaise: 2500000, categoryId: 'food', frequency: 'monthly', nextDueDate: '2026-01-31' },
  exportCategories,
  now,
)
check('recurring bill fixture', billFixture.ok)
check(
  'recurring month-end advance',
  advanceDueDate('monthly', '2026-01-31') === '2026-02-28' &&
    advanceDueDate('monthly', '2024-01-31') === '2024-02-29',
)
check(
  'recurring leap year advance',
  addYearsLocal('2024-02-29', 1) === '2025-02-28' && addMonthsLocal('2024-01-31', 1) === '2024-02-29',
)
check('recurring local today', localCalendarDateString(new Date(2026, 9, 19)) === '2026-10-19')

const billMem = memoryStorage()
saveCategories(exportCategories, billMem)
saveTransactions([], billMem)
saveRecurringBills([billFixture.bill], billMem, { customCategories: exportCategories })
check(
  'recurring bills do not add transactions',
  readTransactions(billMem).transactions.length === 0 && readRecurringBills(billMem, { customCategories: exportCategories }).bills.length === 1,
)

const dueBill = { ...billFixture.bill, nextDueDate: '2026-10-19', lastPaidDueDate: null }
saveRecurringBills([dueBill], billMem, { customCategories: exportCategories })
const payOnce = payRecurringBill(dueBill.id, { storage: billMem, customCategories: exportCategories, now })
check(
  'recurring mark paid creates one transaction',
  payOnce.ok &&
    readTransactions(billMem).transactions.length === 1 &&
    readTransactions(billMem).transactions[0].amountPaise === dueBill.amountPaise,
)
check(
  'recurring double payment blocked',
  !canMarkBillPaid({ ...dueBill, lastPaidDueDate: dueBill.nextDueDate }).ok,
)
check(
  'recurring due date advanced',
  readRecurringBills(billMem, { customCategories: exportCategories }).bills[0].nextDueDate === '2026-11-19',
)

const rollbackPayMem = memoryStorage()
saveCategories(exportCategories, rollbackPayMem)
saveTransactions([], rollbackPayMem)
saveRecurringBills([dueBill], rollbackPayMem, { customCategories: exportCategories })
rollbackPayMem.failTx = true
const payFail = payRecurringBill(dueBill.id, { storage: rollbackPayMem, customCategories: exportCategories, now })
check('recurring pay tx fail no bill change', !payFail.ok && readRecurringBills(rollbackPayMem, { customCategories: exportCategories }).bills[0].lastPaidDueDate === null)

const rollbackBillMem = memoryStorage()
saveCategories(exportCategories, rollbackBillMem)
saveTransactions([], rollbackBillMem)
saveRecurringBills([dueBill], rollbackBillMem, { customCategories: exportCategories })
rollbackBillMem.failRecurringBills = true
const payBillFail = payRecurringBill(dueBill.id, { storage: rollbackBillMem, customCategories: exportCategories, now })
check(
  'recurring pay bill save rollback',
  !payBillFail.ok && readTransactions(rollbackBillMem).transactions.length === 0,
)

check(
  'backup v1 missing recurring bills',
  parseBackupJson(JSON.stringify(docV1)).backup.recurringBills.length === 0 &&
    parseBackupJson(JSON.stringify(docV1)).backup.includesRecurringBills === false,
)
const docV2 = {
  backupVersion: 2,
  exportedAt: now.toISOString(),
  transactions: readTransactions(mem).transactions,
  categories: exportCategories,
  budgets: exportBudgets,
}
check('backup v2 parse recurring empty', parseBackupJson(JSON.stringify(docV2)).backup.recurringBills.length === 0)

const recurringExport = createRecurringBill(
  { title: 'Internet', amountPaise: 99900, categoryId: 'food', frequency: 'monthly', nextDueDate: '2026-11-01' },
  exportCategories,
  now,
)
const docV3Round = {
  backupVersion: 3,
  exportedAt: now.toISOString(),
  transactions: readTransactions(mem).transactions,
  categories: exportCategories,
  budgets: exportBudgets,
  recurringBills: [recurringExport.bill],
}
const v3Parsed = parseBackupJson(JSON.stringify(docV3Round))
check('backup v3 round trip', v3Parsed.ok && v3Parsed.backup.recurringBills.length === 1)
const v3ReplaceMem = memoryStorage()
saveRecurringBills([billFixture.bill], v3ReplaceMem, { customCategories: exportCategories })
saveBudgets(exportBudgets, v3ReplaceMem, { customCategories: exportCategories })
saveCategories(exportCategories, v3ReplaceMem)
saveTransactions(readTransactions(mem).transactions, v3ReplaceMem)
const v3Replace = applyBackupRestore('replace', v3Parsed.backup, v3ReplaceMem)
check(
  'backup v3 replace recurring',
  v3Replace.ok &&
    readRecurringBills(v3ReplaceMem, { customCategories: exportCategories }).bills.some((b) => b.title === 'Internet'),
)

const savingsFixture = createSavingsGoal(
  { name: 'Emergency fund', targetPaise: 10000000, targetDate: '2027-12-31', notes: 'Rainy day' },
  now,
)
check('savings goal fixture', savingsFixture.ok)
const withDeposit = addSavingsGoalEntry(savingsFixture.goal, {
  type: 'deposit',
  amountPaise: 250000,
  date: '2026-10-01',
  note: 'First deposit',
})
check('savings deposit', withDeposit.ok && goalSavedBalancePaise(withDeposit.goal.entries) === 250000)
const overWithdraw = addSavingsGoalEntry(withDeposit.goal, {
  type: 'withdrawal',
  amountPaise: 300000,
  date: '2026-10-02',
})
check('savings withdrawal blocked negative', !overWithdraw.ok)
const okWithdraw = addSavingsGoalEntry(withDeposit.goal, {
  type: 'withdrawal',
  amountPaise: 50000,
  date: '2026-10-03',
})
check('savings withdrawal ok', okWithdraw.ok && goalSavedBalancePaise(okWithdraw.goal.entries) === 200000)
check(
  'savings progress percent',
  goalProgressPercent(200000, 10000000) === 2,
)
check(
  'savings delete blocked with history',
  !deleteSavingsGoal([okWithdraw.goal], okWithdraw.goal.id).ok,
)
check(
  'savings delete with history explicit',
  deleteSavingsGoal([okWithdraw.goal], okWithdraw.goal.id, { includeHistory: true }).ok,
)

const docV4Round = createBackupDocument(
  readTransactions(mem).transactions,
  exportCategories,
  exportBudgets,
  [],
  [withDeposit.goal],
  now,
)
const v4Parsed = parseBackupJson(JSON.stringify(docV4Round))
check('backup v4 round trip', v4Parsed.ok && v4Parsed.backup.savingsGoals.length === 1)
const v3MissingSavings = parseBackupJson(JSON.stringify(docV3Round))
check(
  'backup v3 missing savings goals',
  v3MissingSavings.ok && v3MissingSavings.backup.savingsGoals.length === 0,
)
const v3ReplaceSavingsMem = memoryStorage()
saveSavingsGoals([savingsFixture.goal], v3ReplaceSavingsMem)
saveCategories(exportCategories, v3ReplaceSavingsMem)
saveTransactions(readTransactions(mem).transactions, v3ReplaceSavingsMem)
const v3ReplaceSavings = applyBackupRestore('replace', v3MissingSavings.backup, v3ReplaceSavingsMem)
check(
  'backup v3 replace clears savings',
  v3ReplaceSavings.ok && readSavingsGoals(v3ReplaceSavingsMem).goals.length === 0,
)

const v1RecurringMem = memoryStorage()
saveRecurringBills([billFixture.bill], v1RecurringMem, { customCategories: exportCategories })
saveCategories(exportCategories, v1RecurringMem)
saveTransactions(readTransactions(mem).transactions, v1RecurringMem)
const v1MergeRecurring = applyBackupRestore('merge', parseBackupJson(JSON.stringify(docV1)).backup, v1RecurringMem)
check(
  'backup v1 merge keeps recurring',
  v1MergeRecurring.ok &&
    readRecurringBills(v1RecurringMem, { customCategories: exportCategories }).bills.length === 1,
)

const v1ReplaceRecurringMem = memoryStorage()
saveRecurringBills([billFixture.bill], v1ReplaceRecurringMem, { customCategories: exportCategories })
saveCategories(exportCategories, v1ReplaceRecurringMem)
saveTransactions(readTransactions(mem).transactions, v1ReplaceRecurringMem)
const v1ReplaceRecurring = applyBackupRestore('replace', parseBackupJson(JSON.stringify(docV1)).backup, v1ReplaceRecurringMem)
check(
  'backup v1 replace clears recurring',
  v1ReplaceRecurring.ok &&
    readRecurringBills(v1ReplaceRecurringMem, { customCategories: exportCategories }).bills.length === 0,
)

check('recurring paused cannot pay', !canMarkBillPaid({ ...dueBill, status: 'paused' }).ok)
check(
  'recurring bill after payment shape',
  billAfterPayment({ ...dueBill, nextDueDate: '2026-10-20' }, now).ok &&
    billAfterPayment({ ...dueBill, nextDueDate: '2026-10-20' }, now).transactionInput.date === '2026-10-20',
)
check('recurring bills array validation', validateRecurringBills([billFixture.bill], exportCategories).ok)

check(
  'dashboard month window',
  monthKeysWindowEnding('2026-10', 4).join(',') === '2026-07,2026-08,2026-09,2026-10',
)
const dashTx = readTransactions(mem).transactions
const dashFlow = buildDashboardCashFlow(dashTx, '2026-10', 4)
check('dashboard cash flow months', dashFlow.ok && dashFlow.rows.length === 4)
check(
  'dashboard donut segments',
  buildCategoryDonutSegments(
    [{ categoryId: 'food', amountPaise: 30000 }],
    30000,
  ).length === 1,
)
check(
  'savings ring metrics over target',
  goalRingMetrics(150000, 100000).displayPercent === 150 &&
    goalRingMetrics(150000, 100000).strokeFraction === 1,
)
check('savings ring metrics invalid target', !goalRingMetrics(1000, 0).valid)

const momCompare = buildExpenseMonthComparison(insightTx, '2026-10')
check(
  'expense month comparison increase',
  momCompare.ok &&
    momCompare.comparable &&
    momCompare.diffPaise === 22000 &&
    momCompare.percentChange === 275,
)
const sepCompare = buildExpenseMonthComparison(insightTx, '2026-09')
check(
  'expense month comparison zero previous',
  sepCompare.ok &&
    sepCompare.comparable &&
    sepCompare.diffPaise === 8000 &&
    sepCompare.percentChange == null,
)
check(
  'expense month comparison both zero',
  !buildExpenseMonthComparison(insightTx, '2026-07').comparable,
)

const dashboardNavNow = new Date('2026-10-15T12:00:00')
check(
  'dashboard month clamp future',
  clampDashboardMonth('2027-01', dashboardNavNow) === '2026-10',
)
check(
  'dashboard month previous year boundary',
  dashboardPreviousMonth('2026-01') === '2025-12',
)
check(
  'dashboard month next capped at current',
  dashboardNextMonth('2026-10', dashboardNavNow) === null &&
    dashboardNextMonth('2026-09', dashboardNavNow) === '2026-10',
)
check(
  'dashboard month has transactions filter',
  hasTransactionsInMonth(insightTx, '2026-10') &&
    !hasTransactionsInMonth(insightTx, '2026-07'),
)
const dashMonthOct = summarizeForMonth(insightTx, '2026-10')
const dashMonthJul = summarizeForMonth(insightTx, '2026-07')
check(
  'dashboard month summarize empty month',
  dashMonthJul.ok && dashMonthJul.incomePaise === 0 && dashMonthJul.expensePaise === 0,
)
check(
  'dashboard month summarize distinct totals',
  dashMonthOct.ok && dashMonthOct.expensePaise > 0,
)

check(
  'dashboard greeting morning',
  timeOfDayGreeting(new Date('2026-10-15T08:30:00')) === 'Good morning',
)
check(
  'dashboard greeting afternoon',
  timeOfDayGreeting(new Date('2026-10-15T14:00:00')) === 'Good afternoon',
)
check(
  'dashboard greeting evening',
  timeOfDayGreeting(new Date('2026-10-15T19:00:00')) === 'Good evening',
)
check(
  'dashboard greeting night uses evening',
  timeOfDayGreeting(new Date('2026-10-15T02:00:00')) === 'Good evening',
)
check(
  'dashboard greeting with username',
  buildDashboardWelcomeLine('demo_user', new Date('2026-10-15T10:00:00')) ===
    'Good morning, Demo User',
)
check(
  'dashboard greeting formats dotted username',
  dashboardDisplayName('alex.jordan') === 'Alex Jordan',
)
check(
  'dashboard greeting skips unusable login id',
  dashboardDisplayName('!!!') === '' &&
    buildDashboardWelcomeLine('!!!', new Date('2026-10-15T10:00:00')) === 'Good morning',
)
check(
  'dashboard greeting without username',
  buildDashboardWelcomeLine('', new Date('2026-10-15T10:00:00')) === 'Good morning' &&
    dashboardDisplayName(null) === '',
)
check(
  'dashboard greeting prefers display name',
  resolveDashboardGreetName('Alex', 'demo_user') === 'Alex' &&
    buildDashboardWelcomeLine('demo_user', new Date('2026-10-15T10:00:00'), 'Alex') ===
      'Good morning, Alex',
)
check('profile display name validation', validateDisplayName('  Sam  ').displayName === 'Sam')
check(
  'profile display name rejects invalid',
  !validateDisplayName('bad_name').ok && validateDisplayName('').displayName === '',
)
check('profile motto validation', validateMotto('  Keep going  ').motto === 'Keep going')
check(
  'profile photo payload validation',
  validateProfilePhotoPayload({ mime: 'image/png', dataBase64: 'abcd' }).ok === false,
)
if (failures.length > 0) {
  console.error('FAILED:', failures.join(', '))
  process.exit(1)
}
console.log('ALL REGRESSION CHECKS PASSED')
