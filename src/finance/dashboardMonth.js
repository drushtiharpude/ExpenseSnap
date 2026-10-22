import { nextMonthKey, previousMonthKey } from './analyze.js'
import { calendarMonthKey } from './summarize.js'

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/

export function isDashboardMonthKey(value) {
  return typeof value === 'string' && MONTH_KEY_PATTERN.test(value)
}

export function currentDashboardMonth(now = new Date()) {
  return calendarMonthKey(now)
}

/** Keeps YYYY-MM on or before the calendar month of `now`. */
export function clampDashboardMonth(value, now = new Date()) {
  const current = currentDashboardMonth(now)
  if (!isDashboardMonthKey(value)) return current
  if (value > current) return current
  return value
}

export function dashboardPreviousMonth(monthKey) {
  if (!isDashboardMonthKey(monthKey)) return null
  return previousMonthKey(monthKey)
}

export function dashboardNextMonth(monthKey, now = new Date()) {
  if (!isDashboardMonthKey(monthKey)) return null
  const next = nextMonthKey(monthKey)
  const current = currentDashboardMonth(now)
  if (!next || !isDashboardMonthKey(next) || next > current) return null
  return next
}

export function hasTransactionsInMonth(transactions, monthKey) {
  if (!Array.isArray(transactions) || !isDashboardMonthKey(monthKey)) return false
  return transactions.some(
    (transaction) =>
      typeof transaction?.date === 'string' && transaction.date.slice(0, 7) === monthKey,
  )
}
