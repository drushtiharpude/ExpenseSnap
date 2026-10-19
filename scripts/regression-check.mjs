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
import { summarizeForMonth, buildAnalyticsInsights, monthlyExpenseSeries } from '../src/finance/analyze.js'
import { splitBillPaise } from '../src/finance/splitBill.js'
import { readTheme, saveTheme } from '../src/settings/themeStore.js'

const failures = []

function check(name, condition) {
  if (!condition) failures.push(name)
  else console.log(`OK ${name}`)
}

function memoryStorage() {
  const store = new Map()
  let failTx = false
  let failTxRestore = false
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

const doc = createBackupDocument(readTransactions(mem).transactions, readCategories(mem).categories, now)
check('backup parse', parseBackupJson(JSON.stringify(doc)).ok)
check('unsupported version', !parseBackupJson(JSON.stringify({ ...doc, backupVersion: 9 })).ok)

const conflict = mergeBackupData(readTransactions(mem).transactions, readCategories(mem).categories, {
  ...parseBackupJson(JSON.stringify(doc)).backup,
  transactions: [{ ...edited.transaction, amountPaise: 1 }],
})
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
rollbackMem.store.set(TRANSACTIONS_STORAGE_KEY, rollbackTxRaw)
rollbackMem.store.set(CATEGORIES_STORAGE_KEY, rollbackCatRaw)
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

const oct = summarizeForMonth(readTransactions({ ...mem, failTx: false }).transactions, '2026-10')
check('analytics expenses only in chart month', oct.expensePaise === 30000 && oct.incomePaise === 100000)
const insights = buildAnalyticsInsights(readTransactions({ ...mem, failTx: false }).transactions, '2026-10')
check('analytics insights', insights.some((i) => i.id === 'top-category') && insights.some((i) => i.id === 'expense-vs-previous'))
check('analytics series', monthlyExpenseSeries(readTransactions({ ...mem, failTx: false }).transactions).ok)

saveTheme('dark', { ...mem, failTx: false })
check('theme persistence', readTheme(mem).theme === 'dark')

if (failures.length > 0) {
  console.error('FAILED:', failures.join(', '))
  process.exit(1)
}
console.log('ALL REGRESSION CHECKS PASSED')
