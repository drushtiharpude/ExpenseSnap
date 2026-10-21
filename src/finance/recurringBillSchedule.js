import { isCalendarDateString } from '../data/recurringBill.js'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDateParts(dateString) {
  if (!isCalendarDateString(dateString)) return null
  const match = DATE_PATTERN.exec(dateString)
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

export function formatLocalDateParts(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Today in local calendar YYYY-MM-DD. */
export function localCalendarDateString(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null
  return formatLocalDateParts(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function addDaysLocal(dateString, days) {
  const parts = parseDateParts(dateString)
  if (!parts || !Number.isSafeInteger(days)) return null
  const date = new Date(parts.year, parts.month - 1, parts.day)
  date.setDate(date.getDate() + days)
  return formatLocalDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function addMonthsLocal(dateString, months) {
  const parts = parseDateParts(dateString)
  if (!parts || !Number.isSafeInteger(months)) return null
  const targetDay = parts.day
  let year = parts.year
  let monthIndex = parts.month - 1 + months
  year += Math.floor(monthIndex / 12)
  monthIndex = ((monthIndex % 12) + 12) % 12
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const day = Math.min(targetDay, lastDay)
  return formatLocalDateParts(year, monthIndex + 1, day)
}

export function addYearsLocal(dateString, years) {
  const parts = parseDateParts(dateString)
  if (!parts || !Number.isSafeInteger(years)) return null
  const year = parts.year + years
  const monthIndex = parts.month - 1
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const day = Math.min(parts.day, lastDay)
  return formatLocalDateParts(year, monthIndex + 1, day)
}

export function advanceDueDate(frequency, dueDate) {
  if (frequency === 'weekly') return addDaysLocal(dueDate, 7)
  if (frequency === 'monthly') return addMonthsLocal(dueDate, 1)
  if (frequency === 'yearly') return addYearsLocal(dueDate, 1)
  return null
}

export function compareCalendarDates(left, right) {
  if (!isCalendarDateString(left) || !isCalendarDateString(right)) return null
  if (left === right) return 0
  return left < right ? -1 : 1
}

/** @returns {'overdue' | 'due-today' | 'upcoming' | 'later' | 'paused'} */
export function billDueBucket(bill, todayString) {
  if (bill.status === 'paused') return 'paused'
  if (!isCalendarDateString(todayString)) return 'later'
  const cmp = compareCalendarDates(bill.nextDueDate, todayString)
  if (cmp === null) return 'later'
  if (cmp < 0) return 'overdue'
  if (cmp === 0) return 'due-today'
  return 'upcoming'
}

export function isWithinUpcomingWindow(dueDate, todayString, windowDays = 30) {
  const end = addDaysLocal(todayString, windowDays)
  if (!end) return false
  const afterToday = compareCalendarDates(dueDate, todayString) > 0
  const withinEnd = compareCalendarDates(dueDate, end) <= 0
  return afterToday && withinEnd
}

export function canMarkBillPaid(bill) {
  if (bill.status !== 'active') {
    return { ok: false, errors: ['Only active bills can be marked paid.'] }
  }
  if (bill.lastPaidDueDate === bill.nextDueDate) {
    return { ok: false, errors: ['This due date was already marked paid.'] }
  }
  return { ok: true, dueDate: bill.nextDueDate }
}

export function billAfterPayment(bill, now = new Date()) {
  const check = canMarkBillPaid(bill)
  if (!check.ok) return check

  const paidDueDate = bill.nextDueDate
  const nextDue = advanceDueDate(bill.frequency, paidDueDate)
  if (!nextDue) {
    return { ok: false, errors: ['Could not advance the next due date.'] }
  }

  const timestamp =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString() : bill.updatedAt

  return {
    ok: true,
    paidDueDate,
    bill: {
      ...bill,
      lastPaidDueDate: paidDueDate,
      nextDueDate: nextDue,
      updatedAt: timestamp,
    },
    transactionInput: {
      type: 'expense',
      amountPaise: bill.amountPaise,
      date: paidDueDate,
      categoryId: bill.categoryId,
      description: `Recurring: ${bill.title}`,
    },
  }
}
