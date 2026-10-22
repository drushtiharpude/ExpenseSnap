import { createBudget } from '../src/data/budget.js'
import { createRecurringBill, validateRecurringBill } from '../src/data/recurringBill.js'
import { saveBudgets } from '../src/data/budgetStore.js'
import { saveCategories } from '../src/data/categoryStore.js'
import { saveRecurringBills } from '../src/data/recurringBillStore.js'
import { createTransaction } from '../src/data/transaction.js'
import { saveTransactions } from '../src/data/transactionStore.js'
import {
  buildBillNotificationCandidates,
  buildBudgetNotificationCandidates,
  syncNotificationsFromFinanceData,
} from '../src/notifications/notificationSync.js'
import {
  NOTIFICATIONS_STORAGE_KEY,
  mergeNotificationCandidates,
  readNotificationStore,
  unreadCount,
} from '../src/notifications/notificationStore.js'

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

const now = new Date('2026-10-19T12:00:00.000Z')
const today = '2026-10-19'
const mem = memoryStorage()
saveCategories([], mem)

const billDueSoon = createRecurringBill(
  {
    title: 'Rent',
    amountPaise: 500000,
    categoryId: 'food',
    frequency: 'monthly',
    nextDueDate: '2026-10-22',
    status: 'active',
  },
  [],
  now,
)
const billDueToday = createRecurringBill(
  {
    title: 'Internet',
    amountPaise: 99900,
    categoryId: 'food',
    frequency: 'monthly',
    nextDueDate: '2026-10-19',
    status: 'active',
  },
  [],
  now,
)
const billOverdue = createRecurringBill(
  {
    title: 'Power',
    amountPaise: 120000,
    categoryId: 'food',
    frequency: 'monthly',
    nextDueDate: '2026-10-10',
    status: 'active',
  },
  [],
  now,
)
const billPaidBase = createRecurringBill(
  {
    title: 'Paid bill',
    amountPaise: 10000,
    categoryId: 'food',
    frequency: 'monthly',
    nextDueDate: '2026-10-19',
    status: 'active',
  },
  [],
  now,
)
const billPaid = validateRecurringBill(
  {
    ...billPaidBase.bill,
    lastPaidDueDate: billPaidBase.bill.nextDueDate,
  },
  [],
)
const billPaused = createRecurringBill(
  {
    title: 'Paused',
    amountPaise: 10000,
    categoryId: 'food',
    frequency: 'monthly',
    nextDueDate: '2026-10-19',
    status: 'paused',
  },
  [],
  now,
)

check(
  'bill fixtures',
  billDueSoon.ok && billDueToday.ok && billOverdue.ok && billPaid.ok && billPaidBase.ok,
)

const bills = [
  billDueSoon.bill,
  billDueToday.bill,
  billOverdue.bill,
  billPaid.bill,
  billPaused.bill,
]
const billCandidates = buildBillNotificationCandidates(bills, today)
check('bill upcoming 3 day', billCandidates.some((c) => c.dedupeKey.includes('upcoming-3')))
check('bill due today', billCandidates.some((c) => c.kind === 'bill-due-today'))
check('bill overdue', billCandidates.some((c) => c.kind === 'bill-overdue'))
check('bill skips paid', !billCandidates.some((c) => c.message.includes('Paid bill')))
check('bill skips paused', !billCandidates.some((c) => c.message.includes('Paused')))

const budgetCandidates = buildBudgetNotificationCandidates(
  [
    {
      id: 'b1',
      categoryLabel: 'Food',
      status: 'exceeded',
      spentPaise: 15000,
      limitPaise: 10000,
    },
  ],
  '2026-10',
)
check('budget exceeded candidate', budgetCandidates.length === 1)
check('budget message has overspend', budgetCandidates[0].message.includes('over'))

saveRecurringBills([billDueToday.bill], mem)
const budget = createBudget(
  { month: '2026-10', categoryId: 'food', limitPaise: 1000 },
  [],
  now,
)
const expense = createTransaction(
  {
    type: 'expense',
    amountPaise: 5000,
    date: '2026-10-05',
    categoryId: 'food',
    description: 'x',
  },
  now,
)
check('budget fixture', budget.ok && expense.ok)
saveBudgets(budget.ok ? [budget.budget] : [], mem)
saveTransactions(expense.ok ? [expense.transaction] : [], mem)

const sync1 = syncNotificationsFromFinanceData(mem, now)
check('sync ok', sync1.ok === true)
check('sync creates notifications', sync1.items.length >= 2)

const sync2 = syncNotificationsFromFinanceData(mem, now)
check('sync duplicate prevention', sync2.items.length === sync1.items.length)

const merged = mergeNotificationCandidates([], billCandidates, now)
const mergedAgain = mergeNotificationCandidates(merged, billCandidates, now)
check('merge dedupe', merged.length === mergedAgain.length)

const stored = readNotificationStore(mem)
check('persistence key', mem.getItem(NOTIFICATIONS_STORAGE_KEY)?.includes('"version":1'))
check('unread count', unreadCount(stored.items) >= 1)

if (process.exitCode) {
  console.error('NOTIFICATION CHECKS FAILED')
} else {
  console.log('ALL NOTIFICATION CHECKS PASSED')
}
