import { categoryLabel } from '../transactions/categories.js'
import { formatInrFromPaise } from '../transactions/money.js'
import { addPaise, calendarMonthKey } from './summarize.js'

/** Minimum expense delta (paise) for Money Coach period trend messages. */
export const COACH_MIN_TREND_DIFF_PAISE = 5000

/** Minimum share of month expenses before surfacing a top-category insight. */
export const INSIGHT_MIN_TOP_CATEGORY_SHARE_PERCENT = 20

/** Minimum month-over-month category increase (paise) for category trend insights. */
export const INSIGHT_MIN_CATEGORY_MOM_DELTA_PAISE = 3000

/** Maximum insight lines shown on Analytics (factual notes prioritized over suggestions). */
export const MAX_ANALYTICS_INSIGHT_LINES = 8

function formatMonthLabel(monthKey) {
  const [year, monthNumber] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  )
}

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
    if (transaction.type !== 'expense' && transaction.type !== 'income') {
      return { ok: false, error: 'invalid' }
    }
    const month = monthKeyFromDate(transaction.date)
    if (!month) return { ok: false, error: 'invalid' }

    let entry = byMonth.get(month)
    if (!entry) {
      entry = { month, incomePaise: 0, expensePaise: 0 }
      byMonth.set(month, entry)
    }

    if (transaction.type === 'income') {
      entry.incomePaise = addPaise(entry.incomePaise, amount)
    } else {
      entry.expensePaise = addPaise(entry.expensePaise, amount)
    }
    if (entry.incomePaise === null || entry.expensePaise === null) {
      return { ok: false, error: 'overflow' }
    }
  }

  const months = [...byMonth.values()].sort((left, right) => left.month.localeCompare(right.month))

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

/**
 * Full-month expense comparison for monthKey vs the prior calendar month.
 * Percent change is omitted when the previous month had zero expenses (no division).
 */
export function buildExpenseMonthComparison(transactions, monthKey) {
  if (!Array.isArray(transactions)) return { ok: false, error: 'invalid' }

  const current = summarizeForMonth(transactions, monthKey)
  if (!current.ok) return { ok: false, error: 'invalid' }

  const previousKey = previousMonthKey(monthKey)
  if (!previousKey) {
    return {
      ok: true,
      comparable: false,
      reason: 'no_previous_month',
      currentMonth: monthKey,
      currentExpensePaise: current.expensePaise,
    }
  }

  const previous = summarizeForMonth(transactions, previousKey)
  if (!previous.ok) return { ok: false, error: 'invalid' }

  const currentExpensePaise = current.expensePaise
  const previousExpensePaise = previous.expensePaise

  if (currentExpensePaise === 0 && previousExpensePaise === 0) {
    return {
      ok: true,
      comparable: false,
      reason: 'both_zero',
      currentMonth: monthKey,
      previousMonth: previousKey,
      currentExpensePaise: 0,
      previousExpensePaise: 0,
    }
  }

  const diffPaise = currentExpensePaise - previousExpensePaise
  const percentChange = percentChangeFromDiff(diffPaise, previousExpensePaise)
  let direction = 'unchanged'
  if (diffPaise > 0) direction = 'increase'
  else if (diffPaise < 0) direction = 'decrease'

  return {
    ok: true,
    comparable: true,
    currentMonth: monthKey,
    previousMonth: previousKey,
    currentExpensePaise,
    previousExpensePaise,
    diffPaise,
    percentChange,
    direction,
  }
}

export function buildAnalyticsInsights(transactions, monthKey) {
  const insights = []
  const current = summarizeForMonth(transactions, monthKey)
  if (!current.ok) return insights

  if (current.expensePaise > 0 && current.categories.length > 0) {
    const top = current.categories[0]
    const sharePercent = Math.floor((top.amountPaise * 100) / current.expensePaise)
    if (sharePercent >= INSIGHT_MIN_TOP_CATEGORY_SHARE_PERCENT) {
      insights.push({
        id: 'top-category',
        categoryId: top.categoryId,
        amountPaise: top.amountPaise,
        sharePercent,
      })
    }
  }

  const expenseComparison = buildExpenseMonthComparison(transactions, monthKey)
  const previousKey =
    expenseComparison.ok && expenseComparison.previousMonth
      ? expenseComparison.previousMonth
      : previousMonthKey(monthKey)

  if (previousKey) {
    const previous = summarizeForMonth(transactions, previousKey)
    if (previous.ok) {
      if (
        expenseComparison.ok &&
        expenseComparison.comparable &&
        expenseComparison.diffPaise !== 0
      ) {
        const expenseInsight = {
          id: 'expense-vs-previous',
          previousMonth: expenseComparison.previousMonth,
          diffPaise: expenseComparison.diffPaise,
        }
        if (typeof expenseComparison.percentChange === 'number') {
          expenseInsight.percentChange = expenseComparison.percentChange
        }
        insights.push(expenseInsight)
      }

      const previousByCategory = new Map(
        previous.categories.map((row) => [row.categoryId, row.amountPaise]),
      )
      const categoryIncreases = []
      for (const row of current.categories) {
        const previousAmount = previousByCategory.get(row.categoryId) ?? 0
        const deltaPaise = row.amountPaise - previousAmount
        if (deltaPaise >= INSIGHT_MIN_CATEGORY_MOM_DELTA_PAISE) {
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

function insightDisplayPriority(insight) {
  if (typeof insight?.id !== 'string') return 100
  if (insight.id.startsWith('budget-exceeded:')) return 10
  if (insight.id === 'expense-vs-previous') return 20
  if (insight.id.startsWith('budget-approaching:')) return 30
  if (insight.id.startsWith('category-mom-up:')) return 40
  if (insight.id === 'top-category') return 50
  if (insight.id === 'month-net') return 60
  if (insight.id.startsWith('suggestion-budget-exceeded:')) return 70
  if (insight.id.startsWith('suggestion-budget-approaching:')) return 75
  if (insight.id.startsWith('suggestion-mom-up:')) return 80
  return 90
}

/**
 * Orders and de-duplicates insights for the Analytics panel.
 * Factual budget and trend notes come first; suggestions are omitted when an equivalent fact exists.
 */
export function assembleAnalyticsInsightList(
  transactionInsights,
  budgetInsights = [],
  savingSuggestions = [],
) {
  const tx = Array.isArray(transactionInsights) ? transactionInsights : []
  const budgets = Array.isArray(budgetInsights) ? budgetInsights : []
  const suggestions = Array.isArray(savingSuggestions) ? savingSuggestions : []

  const budgetCategories = new Set(
    budgets.map((entry) => entry.categoryId).filter((id) => typeof id === 'string'),
  )
  const momCategories = new Set(
    tx
      .filter((entry) => entry.id?.startsWith('category-mom-up:'))
      .map((entry) => entry.categoryId)
      .filter((id) => typeof id === 'string'),
  )

  const filteredSuggestions = suggestions.filter((entry) => {
    if (typeof entry?.id !== 'string') return false
    if (entry.id.startsWith('suggestion-budget-')) {
      return !budgetCategories.has(entry.categoryId)
    }
    if (entry.id.startsWith('suggestion-mom-up:')) {
      return !momCategories.has(entry.categoryId)
    }
    return true
  })

  const combined = [...budgets, ...tx, ...filteredSuggestions]
  combined.sort(
    (left, right) =>
      insightDisplayPriority(left) - insightDisplayPriority(right) ||
      String(left.id).localeCompare(String(right.id)),
  )

  const seen = new Set()
  const unique = []
  for (const entry of combined) {
    if (!entry?.id || seen.has(entry.id)) continue
    seen.add(entry.id)
    unique.push(entry)
    if (unique.length >= MAX_ANALYTICS_INSIGHT_LINES) break
  }
  return unique
}

/**
 * Single dashboard highlight: budget overruns first, then this-month cash flow, then significant category share.
 */
export function selectPrimaryDashboardInsight({ summary, monthSummary, budgetStatus, customCategories = [] }) {
  if (!summary?.ok) return null

  const month = summary.month
  const monthTitle = formatMonthLabel(month)

  if (budgetStatus?.ok) {
    const exceeded = budgetStatus.items
      .filter((item) => item.status === 'exceeded')
      .sort((left, right) => left.remainingPaise - right.remainingPaise)
    if (exceeded.length > 0) {
      const item = exceeded[0]
      const label = item.categoryLabel || categoryLabel(item.categoryId, customCategories)
      const overPaise = -item.remainingPaise
      return {
        title: 'Budget watch',
        body: `${label} is ${formatInrFromPaise(overPaise)} over your ${monthTitle} budget. Ease optional ${label.toLowerCase()} spending until you're back under the limit.`,
      }
    }
  }

  const { monthExpensePaise, monthIncomePaise } = summary
  const monthNet = monthIncomePaise - monthExpensePaise

  if (monthExpensePaise > 0 || monthIncomePaise > 0) {
    if (monthExpensePaise > 0 && monthIncomePaise === 0) {
      return {
        title: 'This month so far',
        body: `You have ${formatInrFromPaise(monthExpensePaise)} in expenses in ${monthTitle} and no income recorded for this month yet. Add income when you receive it to see how spending compares.`,
      }
    }
    if (monthNet < 0) {
      return {
        title: 'This month so far',
        body: `In ${monthTitle}, spending is ahead of income by ${formatInrFromPaise(-monthNet)} based on saved transactions. Review recent expenses or record income you may have missed.`,
      }
    }
    if (monthExpensePaise > 0 && monthNet >= 0) {
      return {
        title: 'This month so far',
        body: `In ${monthTitle}, income covers expenses with ${formatInrFromPaise(monthNet)} left after spending.`,
      }
    }
    if (monthIncomePaise > 0 && monthExpensePaise === 0) {
      return {
        title: 'This month so far',
        body: `You have ${formatInrFromPaise(monthIncomePaise)} in income in ${monthTitle} and no expenses recorded this month yet.`,
      }
    }
  }

  if (monthSummary?.ok && monthSummary.expensePaise > 0 && monthSummary.categories.length > 0) {
    const top = monthSummary.categories[0]
    const sharePercent = Math.floor((top.amountPaise * 100) / monthSummary.expensePaise)
    if (sharePercent >= INSIGHT_MIN_TOP_CATEGORY_SHARE_PERCENT) {
      const label = categoryLabel(top.categoryId, customCategories)
      return {
        title: 'Where spending adds up',
        body: `${label} accounts for ${sharePercent}% of this month's expenses (${formatInrFromPaise(top.amountPaise)}). Skim recent ${label.toLowerCase()} entries if you want to adjust.`,
      }
    }
  }

  return null
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
