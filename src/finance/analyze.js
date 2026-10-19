import { addPaise, calendarMonthKey } from './summarize.js'

function monthKeyFromDate(date) {
  if (typeof date !== 'string' || date.length < 7) return null
  return date.slice(0, 7)
}

export function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  return calendarMonthKey(new Date(year, month - 2, 1))
}

export function listTransactionMonths(transactions) {
  const months = new Set()
  for (const transaction of transactions) {
    const key = monthKeyFromDate(transaction?.date)
    if (key) months.add(key)
  }
  return [...months].sort((left, right) => right.localeCompare(left))
}

export function defaultAnalyticsMonth(transactions, now = new Date()) {
  const current = calendarMonthKey(now)
  if (!Array.isArray(transactions) || transactions.length === 0) return current
  const months = listTransactionMonths(transactions)
  if (months.includes(current)) return current
  return months[0] ?? current
}

export function summarizeForMonth(transactions, monthKey) {
  if (!Array.isArray(transactions)) return { ok: false, error: 'invalid' }
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return { ok: false, error: 'invalid' }
  }

  let incomePaise = 0
  let expensePaise = 0
  const categoryPaise = new Map()

  for (const transaction of transactions) {
    const amount = transaction?.amountPaise
    if (!Number.isSafeInteger(amount) || amount < 1) return { ok: false, error: 'invalid' }
    if (monthKeyFromDate(transaction.date) !== monthKey) continue

    if (transaction.type === 'income') {
      incomePaise = addPaise(incomePaise, amount)
    } else if (transaction.type === 'expense') {
      expensePaise = addPaise(expensePaise, amount)
      const nextCategory = addPaise(categoryPaise.get(transaction.categoryId) ?? 0, amount)
      if (nextCategory === null) return { ok: false, error: 'overflow' }
      categoryPaise.set(transaction.categoryId, nextCategory)
    } else {
      return { ok: false, error: 'invalid' }
    }

    if (incomePaise === null || expensePaise === null) {
      return { ok: false, error: 'overflow' }
    }
  }

  const netPaise = incomePaise - expensePaise
  if (!Number.isSafeInteger(netPaise)) return { ok: false, error: 'overflow' }

  const categories = [...categoryPaise.entries()]
    .map(([categoryId, amountPaise]) => ({ categoryId, amountPaise }))
    .sort(
      (left, right) =>
        right.amountPaise - left.amountPaise || left.categoryId.localeCompare(right.categoryId),
    )

  return {
    ok: true,
    month: monthKey,
    incomePaise,
    expensePaise,
    netPaise,
    categories,
  }
}

export function monthlyExpenseSeries(transactions) {
  if (!Array.isArray(transactions)) return { ok: false, error: 'invalid' }

  const byMonth = new Map()
  for (const transaction of transactions) {
    const amount = transaction?.amountPaise
    if (!Number.isSafeInteger(amount) || amount < 1) return { ok: false, error: 'invalid' }
    if (transaction.type !== 'expense') continue
    const month = monthKeyFromDate(transaction.date)
    if (!month) return { ok: false, error: 'invalid' }
    const next = addPaise(byMonth.get(month) ?? 0, amount)
    if (next === null) return { ok: false, error: 'overflow' }
    byMonth.set(month, next)
  }

  const months = [...byMonth.entries()]
    .map(([month, expensePaise]) => ({ month, expensePaise }))
    .sort((left, right) => left.month.localeCompare(right.month))

  return { ok: true, months }
}

export function buildAnalyticsInsights(transactions, monthKey) {
  const insights = []
  const current = summarizeForMonth(transactions, monthKey)
  if (!current.ok) return insights

  if (current.categories.length > 0) {
    insights.push({
      id: 'top-category',
      categoryId: current.categories[0].categoryId,
      amountPaise: current.categories[0].amountPaise,
    })
  }

  const previousKey = previousMonthKey(monthKey)
  if (previousKey) {
    const previous = summarizeForMonth(transactions, previousKey)
    if (previous.ok && current.expensePaise > 0 && previous.expensePaise > 0) {
      const diffPaise = current.expensePaise - previous.expensePaise
      if (diffPaise !== 0) {
        insights.push({
          id: 'expense-vs-previous',
          previousMonth: previousKey,
          diffPaise,
        })
      }
    }
  }

  if (current.incomePaise > 0 && current.expensePaise > 0) {
    insights.push({
      id: 'month-net',
      netPaise: current.netPaise,
    })
  }

  return insights
}
