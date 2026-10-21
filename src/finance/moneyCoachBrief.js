import { categoryLabel } from '../transactions/categories.js'
import { formatInrFromPaise } from '../transactions/money.js'
import {
  buildAnalyticsInsights,
  buildEquivalentPeriodExpenseTrend,
  buildSavingSuggestions,
  COACH_MIN_TREND_DIFF_PAISE,
} from './analyze.js'
import { budgetStatusForMonth } from './budgetStatus.js'

function monthLabelPlain(monthKey) {
  const [year, monthNumber] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  )
}

/** Actual usage: spent ÷ limit × 100 (may exceed 100 when over budget). */
export function budgetUsagePercent(spentPaise, limitPaise) {
  if (!Number.isSafeInteger(limitPaise) || limitPaise < 1) return 0
  if (!Number.isSafeInteger(spentPaise) || spentPaise < 0) return 0
  return Math.round((spentPaise / limitPaise) * 100)
}

/** Progress bar fill width — visually capped at 100%. */
export function budgetProgressPercent(spentPaise, limitPaise) {
  return Math.min(100, Math.max(0, budgetUsagePercent(spentPaise, limitPaise)))
}

function formatSuggestion(insight, customCategories, monthKey) {
  const monthLabel = monthLabelPlain(monthKey)
  if (insight.id.startsWith('suggestion-budget-exceeded:')) {
    const label = categoryLabel(insight.categoryId, customCategories)
    return `Pause non-essential ${label} purchases until you are back under the ${monthLabel} budget (over by ${formatInrFromPaise(insight.overPaise)}).`
  }
  if (insight.id.startsWith('suggestion-budget-approaching:')) {
    const label = categoryLabel(insight.categoryId, customCategories)
    if (insight.atLimit) {
      return `Treat ${label} as full for ${monthLabel} — any new spending will push you over the limit.`
    }
    return `Plan ${label} spending carefully (${formatInrFromPaise(insight.remainingPaise)} left in that budget).`
  }
  if (insight.id.startsWith('suggestion-mom-up:')) {
    const label = categoryLabel(insight.categoryId, customCategories)
    return `Skim your recent ${label} transactions and drop one discretionary expense if the increase was not planned.`
  }
  return ''
}

function pickWorstExceeded(budgetRows) {
  return [...budgetRows]
    .filter((row) => row.status === 'exceeded')
    .sort(
      (left, right) =>
        right.spentPaise - right.limitPaise - (left.spentPaise - left.limitPaise) ||
        left.label.localeCompare(right.label),
    )[0]
}

function pickTightestApproaching(budgetRows) {
  return [...budgetRows]
    .filter((row) => row.status === 'approaching')
    .sort(
      (left, right) =>
        budgetUsagePercent(right.spentPaise, right.limitPaise) -
          budgetUsagePercent(left.spentPaise, left.limitPaise) ||
        left.remainingPaise - right.remainingPaise ||
        left.label.localeCompare(right.label),
    )[0]
}

function trendIncreaseMessage(trend, customCategories, monthKey) {
  if (!trend) return null
  const monthLabel = monthLabelPlain(monthKey)
  const prevLabel = monthLabelPlain(trend.previousMonth)
  const dayNote = `Through day ${trend.throughDay} in ${monthLabel}`

  const category = trend.bestCategoryIncrease
  if (category) {
    const label = categoryLabel(category.categoryId, customCategories)
    return {
      attention: `${label} is ${formatInrFromPaise(category.diffPaise)} higher than the same period last month.`,
      why: `${dayNote}, ${label} spending is ${formatInrFromPaise(category.currentPaise)} versus ${formatInrFromPaise(category.previousPaise)} in ${prevLabel} (same ${trend.throughDay}-day window).`,
      scope: 'category',
      categoryId: category.categoryId,
    }
  }

  const { total } = trend
  if (
    total.diffPaise >= COACH_MIN_TREND_DIFF_PAISE &&
    total.previousPaise >= COACH_MIN_TREND_DIFF_PAISE
  ) {
    return {
      attention: `Spending is ${formatInrFromPaise(total.diffPaise)} higher than the same period last month.`,
      why: `${dayNote}, expenses total ${formatInrFromPaise(total.currentPaise)} versus ${formatInrFromPaise(total.previousPaise)} in ${prevLabel}.`,
      scope: 'total',
    }
  }

  return null
}

function trendDecreaseMessage(trend, customCategories, monthKey) {
  if (!trend) return null
  const monthLabel = monthLabelPlain(monthKey)
  const prevLabel = monthLabelPlain(trend.previousMonth)
  const dayNote = `Through day ${trend.throughDay} in ${monthLabel}`

  const category = trend.bestCategoryDecrease
  if (category) {
    const label = categoryLabel(category.categoryId, customCategories)
    const saved = -category.diffPaise
    return {
      attention: `Nice work — ${label} spending is ${formatInrFromPaise(saved)} lower than the same period last month.`,
      why: `${dayNote}, ${label} is at ${formatInrFromPaise(category.currentPaise)} versus ${formatInrFromPaise(category.previousPaise)} in ${prevLabel} (same ${trend.throughDay}-day window).`,
      scope: 'category',
      categoryId: category.categoryId,
    }
  }

  const { total } = trend
  if (
    total.diffPaise <= -COACH_MIN_TREND_DIFF_PAISE &&
    total.previousPaise >= COACH_MIN_TREND_DIFF_PAISE
  ) {
    const saved = -total.diffPaise
    return {
      attention: `Nice work — spending is ${formatInrFromPaise(saved)} lower than the same period last month.`,
      why: `${dayNote}, expenses total ${formatInrFromPaise(total.currentPaise)} versus ${formatInrFromPaise(total.previousPaise)} in ${prevLabel}.`,
      scope: 'total',
    }
  }

  return null
}

function suggestionsExcludingTrendDuplicates(rawSuggestions, customCategories, monthKey) {
  return rawSuggestions
    .filter(
      (item) =>
        !item.id.startsWith('suggestion-mom-up:') &&
        item.id !== 'expense-vs-previous',
    )
    .map((item) => formatSuggestion(item, customCategories, monthKey))
    .filter(Boolean)
}

/**
 * One prioritized coaching brief for the current month (action-oriented, not a full report).
 */
export function buildMoneyCoachBrief({
  summary,
  monthKey,
  customCategories,
  records,
  budgets,
  budgetsAvailable,
  now = new Date(),
}) {
  if (!summary?.totals || !Array.isArray(records)) {
    return {
      ok: false,
      attention: null,
      why: null,
      nextSteps: [],
      highlightBudget: null,
      priority: 'normal',
      empty: true,
    }
  }

  const monthLabel = monthLabelPlain(monthKey)
  const totals = summary.totals
  const hasActivity = totals.incomePaise > 0 || totals.expensePaise > 0
  const insights = buildAnalyticsInsights(records, monthKey)
  const budgetList = budgetsAvailable && Array.isArray(budgets) ? budgets : []
  const status = budgetsAvailable
    ? budgetStatusForMonth(budgetList, records, monthKey, customCategories)
    : { ok: false }
  const rawSuggestions = status.ok ? buildSavingSuggestions(status, insights) : []
  const trend = buildEquivalentPeriodExpenseTrend(records, monthKey, now)
  const suggestionLines = rawSuggestions
    .map((item) => formatSuggestion(item, customCategories, monthKey))
    .filter(Boolean)

  if (!hasActivity) {
    return {
      ok: true,
      attention: 'Nothing to review yet this month.',
      why: `There are no income or expense transactions dated in ${monthLabel}.`,
      nextSteps: [
        'Log this month’s income and spending on the Transactions page.',
        'Open Analytics when you want charts and category breakdowns.',
      ],
      highlightBudget: null,
      priority: 'normal',
      empty: true,
    }
  }

  if (summary.budgetDataStatus === 'unavailable') {
    return {
      ok: true,
      attention: 'Budget data is unavailable.',
      why: `Income and expenses for ${monthLabel} total ${formatInrFromPaise(totals.incomePaise)} in and ${formatInrFromPaise(totals.expensePaise)} out (${formatInrFromPaise(totals.netPaise)} remaining). Budget limits could not be read, so overspend alerts are hidden.`,
      nextSteps: [
        'Fix budget storage errors, then return here for budget-focused guidance.',
        'Use Analytics to explore spending patterns in the meantime.',
      ].slice(0, 2),
      highlightBudget: null,
      priority: 'high',
      empty: false,
    }
  }

  const exceeded = pickWorstExceeded(summary.budgets)
  if (exceeded) {
    const overPaise = exceeded.spentPaise - exceeded.limitPaise
    return {
      ok: true,
      attention: `${exceeded.label} is over budget by ${formatInrFromPaise(overPaise)}.`,
      why: `You spent ${formatInrFromPaise(exceeded.spentPaise)} against a ${formatInrFromPaise(exceeded.limitPaise)} limit in ${monthLabel}. Your overall remaining balance this month is ${formatInrFromPaise(totals.netPaise)}.`,
      nextSteps: suggestionLines.slice(0, 2).length
        ? suggestionLines.slice(0, 2)
        : [
            `Cut back on ${exceeded.label} until spending is at or below ${formatInrFromPaise(exceeded.limitPaise)}.`,
          ],
      highlightBudget: exceeded,
      priority: 'high',
      empty: false,
    }
  }

  if (totals.expensePaise > 0 && totals.netPaise < 0) {
    const gap = -totals.netPaise
    return {
      ok: true,
      attention:
        totals.incomePaise > 0
          ? `Spending exceeded income by ${formatInrFromPaise(gap)}.`
          : `Remaining balance is ${formatInrFromPaise(totals.netPaise)} after ${formatInrFromPaise(totals.expensePaise)} in expenses.`,
      why:
        totals.incomePaise > 0
          ? `${monthLabel} totals: ${formatInrFromPaise(totals.incomePaise)} income, ${formatInrFromPaise(totals.expensePaise)} expenses.`
          : `${monthLabel} has no recorded income yet and ${formatInrFromPaise(totals.expensePaise)} in expenses.`,
      nextSteps: suggestionLines.slice(0, 2).length
        ? suggestionLines.slice(0, 2)
        : [
            `Find one ${formatInrFromPaise(gap)} expense you can defer or skip to narrow the gap.`,
            'Check Analytics if you want to see which categories drove the increase.',
          ],
      highlightBudget: null,
      priority: 'high',
      empty: false,
    }
  }

  const trendIncrease = trendIncreaseMessage(trend, customCategories, monthKey)
  if (trendIncrease) {
    const trendSuggestions = suggestionsExcludingTrendDuplicates(
      rawSuggestions,
      customCategories,
      monthKey,
    )
    const label =
      trendIncrease.scope === 'category'
        ? categoryLabel(trendIncrease.categoryId, customCategories)
        : null
    return {
      ok: true,
      attention: trendIncrease.attention,
      why: trendIncrease.why,
      nextSteps: trendSuggestions.slice(0, 2).length
        ? trendSuggestions.slice(0, 2)
        : label
          ? [
              `Review recent ${label} transactions for one-offs you can skip.`,
              'Open Analytics for the full month-over-month chart when you have time.',
            ]
          : [
              'Review new or larger expenses in Analytics before the month ends.',
              'Adjust a budget on the Budget page if this pace is intentional.',
            ],
      highlightBudget: null,
      priority: 'high',
      empty: false,
    }
  }

  const approaching = pickTightestApproaching(summary.budgets)
  if (approaching) {
    const pct = budgetUsagePercent(approaching.spentPaise, approaching.limitPaise)
    return {
      ok: true,
      attention: `${approaching.label} is nearly at its budget limit (${pct}% of budget used).`,
      why: `${formatInrFromPaise(approaching.remainingPaise)} remains of ${formatInrFromPaise(approaching.limitPaise)} for ${monthLabel}.`,
      nextSteps: suggestionLines.slice(0, 2).length
        ? suggestionLines.slice(0, 2)
        : [
            `Keep ${approaching.label} spending small until the month ends.`,
            'Use Analytics for full category charts — this page stays focused on next steps.',
          ],
      highlightBudget: approaching,
      priority: 'high',
      empty: false,
    }
  }

  if (summary.budgets.length === 0) {
    const trendDecrease = trendDecreaseMessage(trend, customCategories, monthKey)
    if (trendDecrease) {
      return {
        ok: true,
        attention: trendDecrease.attention,
        why: `${trendDecrease.why} You have no budgets set for ${monthLabel} yet.`,
        nextSteps: [
          'Add category budgets on the Budget page to get overspend alerts here.',
          'Keep logging transactions so this trend stays visible next month.',
        ],
        highlightBudget: null,
        priority: 'normal',
        empty: false,
      }
    }
    return {
      ok: true,
      attention: 'No budgets set for this month.',
      why: `You have ${formatInrFromPaise(totals.expensePaise)} in expenses and ${formatInrFromPaise(totals.netPaise)} remaining in ${monthLabel}, but there are no limits to watch.`,
      nextSteps: [
        'Add category budgets on the Budget page to get overspend alerts here.',
        'Use Analytics to see where spending is concentrated.',
      ],
      highlightBudget: null,
      priority: 'normal',
      empty: false,
    }
  }

  const trendDecrease = trendDecreaseMessage(trend, customCategories, monthKey)
  if (trendDecrease) {
    return {
      ok: true,
      attention: trendDecrease.attention,
      why: trendDecrease.why,
      nextSteps: [
        'Keep logging transactions so this view stays up to date.',
        'Open Analytics when you want month-over-month charts and category detail.',
      ],
      highlightBudget: null,
      priority: 'normal',
      empty: false,
    }
  }

  return {
    ok: true,
    attention: 'No urgent budget or spending flags.',
    why:
      totals.netPaise >= 0
        ? `Income and expenses leave ${formatInrFromPaise(totals.netPaise)} remaining in ${monthLabel}.`
        : `Remaining balance is ${formatInrFromPaise(totals.netPaise)} in ${monthLabel}; no category budgets are over limit.`,
    nextSteps: [
      'Keep logging transactions so this view stays up to date.',
      'Open Analytics when you want month-over-month charts and category detail.',
    ],
    highlightBudget: null,
    priority: 'normal',
    empty: false,
  }
}
