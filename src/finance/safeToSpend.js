import { isBudgetMonthKey } from '../data/budget.js'
import { summarizeForMonth } from './analyze.js'
import { budgetStatusForMonth } from './budgetStatus.js'
import { addPaise } from './summarize.js'

/**
 * "Money left this month" / safe-to-spend estimate (Dashboard only).
 *
 * All amounts are integer paise. Month scope uses transaction.date YYYY-MM prefix,
 * consistent with summarizeForMonth and summarizeTransactions.
 *
 * Definitions for a calendar monthKey:
 * - monthExpensePaise: every expense transaction dated in that month (not income).
 * - monthIncomePaise: every income transaction dated in that month.
 * - budgetSpentPaise: expense totals in categories that have a budget for monthKey only
 *   (sum of budget status item spentPaise — never includes income).
 * - budgetRemainingPaise: sum of (limit − spent) per budget row (may be negative if over).
 * - unbudgetedExpensePaise: monthExpensePaise − budgetSpentPaise when budgets exist;
 *   otherwise equals monthExpensePaise. Spending outside budgeted categories is not
 *   treated as automatically safe.
 *
 * Headline (single estimate) when shown:
 * - With budgets and recorded income: min(budgetRemainingPaise, monthNetPaise) where
 *   monthNetPaise = monthIncomePaise − monthExpensePaise (conservative dual cap).
 * - With budgets and no income: budgetRemainingPaise only (no income cap applied).
 * - Without budgets: no single safe headline — use mode income_only or expenses_only
 *   and show labeled figures separately.
 *
 * This is not a bank balance; it reflects saved transactions and budgets in this app only.
 */

function sumPaise(values) {
  let total = 0
  for (const value of values) {
    const next = addPaise(total, value)
    if (next === null) return null
    total = next
  }
  return total
}

function minPaise(left, right) {
  return left <= right ? left : right
}

export function monthCalendarMeta(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return { daysInMonth: null, dayOfMonth: null }
  }
  const year = now.getFullYear()
  const monthIndex = now.getMonth()
  return {
    daysInMonth: new Date(year, monthIndex + 1, 0).getDate(),
    dayOfMonth: now.getDate(),
  }
}

export function safeToSpendForMonth(
  transactions,
  budgets,
  monthKey,
  customCategories = [],
  now = new Date(),
) {
  if (!isBudgetMonthKey(monthKey)) return { ok: false, error: 'invalid_month' }
  if (!Array.isArray(transactions)) return { ok: false, error: 'invalid' }

  const summary = summarizeForMonth(transactions, monthKey)
  if (!summary.ok) return { ok: false, error: summary.error }

  const status = budgetStatusForMonth(budgets, transactions, monthKey, customCategories)
  if (!status.ok) return { ok: false, error: 'invalid' }

  const monthIncomePaise = summary.incomePaise
  const monthExpensePaise = summary.expensePaise
  const monthNetPaise = summary.netPaise
  const hasBudgets = status.items.length > 0
  const hasMonthActivity = monthIncomePaise > 0 || monthExpensePaise > 0
  const calendar = monthCalendarMeta(now)

  let budgetLimitPaise = 0
  let budgetSpentPaise = 0
  let budgetRemainingPaise = 0

  if (hasBudgets) {
    budgetLimitPaise = sumPaise(status.items.map((item) => item.limitPaise))
    budgetSpentPaise = sumPaise(status.items.map((item) => item.spentPaise))
    budgetRemainingPaise = sumPaise(status.items.map((item) => item.remainingPaise))
    if (
      budgetLimitPaise === null ||
      budgetSpentPaise === null ||
      budgetRemainingPaise === null
    ) {
      return { ok: false, error: 'overflow' }
    }
  }

  let unbudgetedExpensePaise = monthExpensePaise
  if (hasBudgets) {
    const unbudgeted = monthExpensePaise - budgetSpentPaise
    if (!Number.isSafeInteger(unbudgeted) || unbudgeted < 0) {
      return { ok: false, error: 'invalid' }
    }
    unbudgetedExpensePaise = unbudgeted
  }

  const base = {
    ok: true,
    month: monthKey,
    monthIncomePaise,
    monthExpensePaise,
    monthNetPaise,
    hasBudgets,
    budgetLimitPaise,
    budgetSpentPaise,
    budgetRemainingPaise,
    unbudgetedExpensePaise,
    daysInMonth: calendar.daysInMonth,
    dayOfMonth: calendar.dayOfMonth,
  }

  if (!hasMonthActivity) {
    if (hasBudgets) {
      return {
        ...base,
        mode: 'empty_month_with_budgets',
        headlinePaise: budgetRemainingPaise,
      }
    }
    return {
      ...base,
      mode: 'empty_month',
      headlinePaise: null,
    }
  }

  if (hasBudgets) {
    let headlinePaise = budgetRemainingPaise
    let mode = 'budget_only'
    if (monthIncomePaise > 0) {
      headlinePaise = minPaise(budgetRemainingPaise, monthNetPaise)
      mode = 'combined'
    }
    return {
      ...base,
      mode,
      headlinePaise,
    }
  }

  if (monthIncomePaise > 0) {
    return {
      ...base,
      mode: 'income_only',
      headlinePaise: null,
    }
  }

  return {
    ...base,
    mode: 'expenses_only',
    headlinePaise: null,
  }
}
