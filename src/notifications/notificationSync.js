import { readBudgets } from '../data/budgetStore.js'
import { readCategories } from '../data/categoryStore.js'
import { readRecurringBills } from '../data/recurringBillStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { budgetStatusForMonth } from '../finance/budgetStatus.js'
import {
  addDaysLocal,
  canMarkBillPaid,
  compareCalendarDates,
  localCalendarDateString,
} from '../finance/recurringBillSchedule.js'
import { calendarMonthKey } from '../finance/summarize.js'
import { formatInrFromPaise } from '../transactions/money.js'
import { mergeNotificationCandidates, readNotificationStore, saveNotificationStore } from './notificationStore.js'

function isBillUnpaidForDue(bill) {
  return canMarkBillPaid(bill).ok
}

/** @returns {Array<{ dedupeKey: string, kind: string, title: string, message: string }>} */
export function buildBillNotificationCandidates(bills, todayString) {
  if (!todayString) return []
  const candidates = []

  for (const bill of bills) {
    if (bill.status !== 'active') continue
    if (!isBillUnpaidForDue(bill)) continue

    const dueDate = bill.nextDueDate
    const amountLabel = formatInrFromPaise(bill.amountPaise)
    const title = bill.title

    const cmp = compareCalendarDates(dueDate, todayString)
    if (cmp === null) continue

    if (cmp < 0) {
      candidates.push({
        dedupeKey: `bill:${bill.id}:${dueDate}:overdue`,
        kind: 'bill-overdue',
        title: 'Bill overdue',
        message: `${title} was due ${dueDate} (${amountLabel}). Mark it paid when you have settled it.`,
      })
      continue
    }

    if (cmp === 0) {
      candidates.push({
        dedupeKey: `bill:${bill.id}:${dueDate}:due-today`,
        kind: 'bill-due-today',
        title: 'Bill due today',
        message: `${title} is due today (${amountLabel}).`,
      })
      continue
    }

    const threeDaysBefore = addDaysLocal(dueDate, -3)
    if (threeDaysBefore === todayString) {
      candidates.push({
        dedupeKey: `bill:${bill.id}:${dueDate}:upcoming-3`,
        kind: 'bill-upcoming',
        title: 'Bill due soon',
        message: `${title} is due in 3 days on ${dueDate} (${amountLabel}).`,
      })
    }
  }

  return candidates
}

/** @returns {Array<{ dedupeKey: string, kind: string, title: string, message: string }>} */
export function buildBudgetNotificationCandidates(budgetStatusItems, monthKey) {
  if (!monthKey) return []
  const candidates = []

  for (const item of budgetStatusItems) {
    if (item.status !== 'exceeded') continue
    const overspendPaise = item.spentPaise - item.limitPaise
    const spentLabel = formatInrFromPaise(item.spentPaise)
    const limitLabel = formatInrFromPaise(item.limitPaise)
    const overspendLabel =
      overspendPaise > 0 ? formatInrFromPaise(overspendPaise) : formatInrFromPaise(0)

    candidates.push({
      dedupeKey: `budget:${item.id}:${monthKey}:exceeded`,
      kind: 'budget-exceeded',
      title: 'Budget exceeded',
      message: `${item.categoryLabel} (${monthKey}): spent ${spentLabel} of ${limitLabel} limit (${overspendLabel} over).`,
    })
  }

  return candidates
}

export function buildAllNotificationCandidates({
  bills,
  budgetStatusItems,
  todayString,
  monthKey,
}) {
  return [
    ...buildBillNotificationCandidates(bills, todayString),
    ...buildBudgetNotificationCandidates(budgetStatusItems, monthKey),
  ]
}

/**
 * Load finance data, compute candidates, merge into notification store (no duplicates).
 * @param {Storage} [storage]
 * @param {Date} [now]
 */
export function syncNotificationsFromFinanceData(storage, now = new Date()) {
  const todayString = localCalendarDateString(now)
  const monthKey = calendarMonthKey(now)

  const transactionsResult = readTransactions(storage)
  if (!transactionsResult.ok) {
    return { ok: false, error: 'transactions', items: readNotificationStore(storage).items ?? [] }
  }
  const categoriesResult = readCategories(storage)
  if (!categoriesResult.ok) {
    return { ok: false, error: 'categories', items: readNotificationStore(storage).items ?? [] }
  }
  const customCategories = categoriesResult.categories

  const budgetsResult = readBudgets(storage, { customCategories })
  if (!budgetsResult.ok) {
    return { ok: false, error: 'budgets', items: readNotificationStore(storage).items ?? [] }
  }

  const billsResult = readRecurringBills(storage, { customCategories })
  if (!billsResult.ok) {
    return { ok: false, error: 'bills', items: readNotificationStore(storage).items ?? [] }
  }

  const budgetStatus = budgetStatusForMonth(
    budgetsResult.budgets,
    transactionsResult.transactions,
    monthKey,
    customCategories,
  )
  const budgetItems = budgetStatus.ok ? budgetStatus.items : []

  const candidates = buildAllNotificationCandidates({
    bills: billsResult.bills,
    budgetStatusItems: budgetItems,
    todayString,
    monthKey,
  })

  const existing = readNotificationStore(storage)
  const merged = mergeNotificationCandidates(existing.ok ? existing.items : [], candidates, now)
  const saved = saveNotificationStore(merged, storage)
  if (!saved.ok) {
    return { ok: false, error: saved.error, items: merged }
  }

  return { ok: true, items: merged }
}
