import { addPaise, calendarMonthKey } from './summarize.js'

/** Minimum expense delta (paise) for Money Coach period trend messages. */
export const COACH_MIN_TREND_DIFF_PAISE = 5000

function monthKeyFromDate(date) {
  if (typeof date !== 'string' || date.length < 7) return null
  return date.slice(0, 7)
}

const BUDGET_MONTH_PATTERN = /^(\d{4})-(\d{2})$/

function parseBudgetMonthKey(monthKey) {
  if (typeof monthKey !== 'string') return null
  const match = BUDGET_MONTH_PATTERN.exec(monthKey)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return { year, month }
}

export function previousMonthKey(monthKey) {
  const parsed = parseBudgetMonthKey(monthKey)
  if (!parsed) return null
  return calendarMonthKey(new Date(parsed.year, parsed.month - 2, 1))
}

export function nextMonthKey(monthKey) {
  const parsed = parseBudgetMonthKey(monthKey)
  if (!parsed) return null
  return calendarMonthKey(new Date(parsed.year, parsed.month, 1))
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

function dayOfMonthFromDate(date) {
  if (typeof date !== 'string' || date.length < 10) return null
  const day = Number(date.slice(8, 10))
  if (!Number.isSafeInteger(day) || day < 1 || day > 31) return null
  return day
}

/**
 * Sums expenses from the 1st through throughDay (inclusive) within monthKey.
 */
export function sumExpensesThroughDay(transactions, monthKey, throughDay) {
  if (!Array.isArray(transactions)) return { ok: false, error: 'invalid' }
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return { ok: false, error: 'invalid' }
  }
  if (!Number.isSafeInteger(throughDay) || throughDay < 1 || throughDay > 31) {
    return { ok: false, error: 'invalid' }
  }

  let totalExpensePaise = 0
  const categoryPaise = new Map()

  for (const transaction of transactions) {
    if (transaction?.type !== 'expense') continue
    if (monthKeyFromDate(transaction.date) !== monthKey) continue
    const day = dayOfMonthFromDate(transaction.date)
    if (day === null || day > throughDay) continue
    const amount = transaction.amountPaise
    if (!Number.isSafeInteger(amount) || amount < 1) return { ok: false, error: 'invalid' }

    const nextTotal = addPaise(totalExpensePaise, amount)
    if (nextTotal === null) return { ok: false, error: 'overflow' }
    totalExpensePaise = nextTotal

    const categoryId = transaction.categoryId
    const nextCategory = addPaise(categoryPaise.get(categoryId) ?? 0, amount)
    if (nextCategory === null) return { ok: false, error: 'overflow' }
    categoryPaise.set(categoryId, nextCategory)
  }

  return { ok: true, totalExpensePaise, categoryPaise }
}

/**
 * Compares expense totals for the same calendar-day window this month vs last month.
 * Returns null when the comparison is not reliable enough for user-facing trend copy.
 */
function coachMonthCalendarMeta(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return { dayOfMonth: null, daysInMonth: null }
  }
  const year = now.getFullYear()
  const monthIndex = now.getMonth()
  return {
    daysInMonth: new Date(year, monthIndex + 1, 0).getDate(),
    dayOfMonth: now.getDate(),
  }
}

export function buildEquivalentPeriodExpenseTrend(
  transactions,
  monthKey,
  now = new Date(),
  minDiffPaise = COACH_MIN_TREND_DIFF_PAISE,
) {
  const calendar = coachMonthCalendarMeta(now)
  const throughDay = calendar.dayOfMonth
  if (!Number.isSafeInteger(throughDay) || throughDay < 1) return null

  const previousMonth = previousMonthKey(monthKey)
  if (!previousMonth) return null

  const current = sumExpensesThroughDay(transactions, monthKey, throughDay)
  const previous = sumExpensesThroughDay(transactions, previousMonth, throughDay)
  if (!current.ok || !previous.ok) return null

  const previousFull = summarizeForMonth(transactions, previousMonth)
  if (!previousFull.ok || previousFull.expensePaise < 1) return null

  if (current.totalExpensePaise === 0 && previous.totalExpensePaise === 0) return null

  const categoryIds = new Set([
    ...current.categoryPaise.keys(),
    ...previous.categoryPaise.keys(),
  ])

  let bestCategoryIncrease = null
  let bestCategoryDecrease = null

  for (const categoryId of categoryIds) {
    const currentPaise = current.categoryPaise.get(categoryId) ?? 0
    const previousPaise = previous.categoryPaise.get(categoryId) ?? 0
    const diffPaise = currentPaise - previousPaise

    if (
      diffPaise >= minDiffPaise &&
      previousPaise >= minDiffPaise &&
      (!bestCategoryIncrease || diffPaise > bestCategoryIncrease.diffPaise)
    ) {
      bestCategoryIncrease = {
        categoryId,
        currentPaise,
        previousPaise,
        diffPaise,
      }
    }

    if (
      diffPaise <= -minDiffPaise &&
      previousPaise >= minDiffPaise &&
      (!bestCategoryDecrease || diffPaise < bestCategoryDecrease.diffPaise)
    ) {
      bestCategoryDecrease = {
        categoryId,
        currentPaise,
        previousPaise,
        diffPaise,
      }
    }
  }

  const totalDiffPaise = current.totalExpensePaise - previous.totalExpensePaise

  return {
    throughDay,
    previousMonth,
    total: {
      currentPaise: current.totalExpensePaise,
      previousPaise: previous.totalExpensePaise,
      diffPaise: totalDiffPaise,
    },
    bestCategoryIncrease,
    bestCategoryDecrease,
  }
}

function percentChangeFromDiff(diffPaise, previousPaise) {
  if (previousPaise <= 0 || diffPaise === 0) return null
  const numerator = Math.abs(diffPaise) * 100
  if (!Number.isSafeInteger(numerator)) return null
  const magnitude = Math.floor(numerator / previousPaise)
  return diffPaise < 0 ? -magnitude : magnitude
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
    if (previous.ok) {
      const currentExpense = current.expensePaise
      const previousExpense = previous.expensePaise
      if (!(currentExpense === 0 && previousExpense === 0)) {
        const diffPaise = currentExpense - previousExpense
        if (diffPaise !== 0) {
          const expenseInsight = {
            id: 'expense-vs-previous',
            previousMonth: previousKey,
            diffPaise,
          }
          const percentChange = percentChangeFromDiff(diffPaise, previousExpense)
          if (percentChange !== null) {
            expenseInsight.percentChange = percentChange
          }
          insights.push(expenseInsight)
        }
      }

      const previousByCategory = new Map(
        previous.categories.map((row) => [row.categoryId, row.amountPaise]),
      )
      const categoryIncreases = []
      for (const row of current.categories) {
        const previousAmount = previousByCategory.get(row.categoryId) ?? 0
        const deltaPaise = row.amountPaise - previousAmount
        if (deltaPaise > 0) {
          categoryIncreases.push({
            categoryId: row.categoryId,
            deltaPaise,
            currentPaise: row.amountPaise,
            previousPaise: previousAmount,
          })
        }
      }
      categoryIncreases.sort(
        (left, right) =>
          right.deltaPaise - left.deltaPaise || left.categoryId.localeCompare(right.categoryId),
      )
      for (const increase of categoryIncreases.slice(0, 3)) {
        insights.push({
          id: `category-mom-up:${increase.categoryId}`,
          previousMonth: previousKey,
          categoryId: increase.categoryId,
          deltaPaise: increase.deltaPaise,
          currentPaise: increase.currentPaise,
          previousPaise: increase.previousPaise,
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

export function buildSavingSuggestions(budgetStatus, insights) {
  if (!budgetStatus?.ok || !Array.isArray(insights)) return []

  const suggestions = []
  const usedCategories = new Set()

  for (const item of budgetStatus.items) {
    if (item.status === 'exceeded') {
      usedCategories.add(item.categoryId)
      suggestions.push({
        id: `suggestion-budget-exceeded:${item.id}`,
        categoryId: item.categoryId,
        overPaise: -item.remainingPaise,
      })
    }
  }

  for (const item of budgetStatus.items) {
    if (item.status !== 'approaching') continue
    if (usedCategories.has(item.categoryId)) continue
    usedCategories.add(item.categoryId)
    suggestions.push({
      id: `suggestion-budget-approaching:${item.id}`,
      categoryId: item.categoryId,
      percentUsed: item.percentUsed,
      remainingPaise: item.remainingPaise,
      atLimit: item.percentUsed === 100,
    })
  }

  const topIncrease = insights.find((entry) => entry.id.startsWith('category-mom-up:'))
  if (topIncrease && !usedCategories.has(topIncrease.categoryId)) {
    suggestions.push({
      id: `suggestion-mom-up:${topIncrease.categoryId}`,
      categoryId: topIncrease.categoryId,
      deltaPaise: topIncrease.deltaPaise,
    })
  }

  return suggestions
}
