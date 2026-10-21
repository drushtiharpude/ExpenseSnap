import { isBudgetMonthKey, validateBudgets } from '../data/budget.js'
import { categoryLabel } from '../transactions/categories.js'
import { summarizeForMonth } from './analyze.js'

const APPROACHING_PERCENT = 80

function percentUsedFromSpent(spentPaise, limitPaise) {
  if (spentPaise === 0) return 0
  const numerator = spentPaise * 100
  if (!Number.isSafeInteger(numerator)) return null
  return Math.floor(numerator / limitPaise)
}

function statusFromSpent(spentPaise, limitPaise) {
  if (spentPaise > limitPaise) return 'exceeded'
  if (spentPaise * 100 >= limitPaise * APPROACHING_PERCENT) return 'approaching'
  return 'ok'
}

/**
 * Pure budget progress for one calendar month. Expense spending comes from summarizeForMonth.
 */
export function budgetStatusForMonth(budgets, transactions, monthKey, customCategories = []) {
  if (!isBudgetMonthKey(monthKey)) return { ok: false, error: 'invalid' }
  if (!Array.isArray(transactions)) return { ok: false, error: 'invalid' }

  const validated = validateBudgets(budgets, customCategories)
  if (!validated.ok) {
    return { ok: false, error: 'invalid', errors: validated.errors }
  }

  const summary = summarizeForMonth(transactions, monthKey)
  if (!summary.ok) return { ok: false, error: summary.error }

  const spentByCategory = new Map(
    summary.categories.map((row) => [row.categoryId, row.amountPaise]),
  )

  const items = []
  for (const budget of validated.budgets) {
    if (budget.month !== monthKey) continue

    const spentPaise = spentByCategory.get(budget.categoryId) ?? 0
    const remainingPaise = budget.limitPaise - spentPaise
    if (!Number.isSafeInteger(remainingPaise)) return { ok: false, error: 'overflow' }

    const percentUsed = percentUsedFromSpent(spentPaise, budget.limitPaise)
    if (percentUsed === null) return { ok: false, error: 'overflow' }

    items.push({
      id: budget.id,
      month: budget.month,
      categoryId: budget.categoryId,
      categoryLabel: categoryLabel(budget.categoryId, customCategories),
      limitPaise: budget.limitPaise,
      spentPaise,
      remainingPaise,
      percentUsed,
      status: statusFromSpent(spentPaise, budget.limitPaise),
    })
  }

  items.sort(
    (left, right) =>
      left.categoryLabel.localeCompare(right.categoryLabel) ||
      left.categoryId.localeCompare(right.categoryId),
  )

  return { ok: true, month: monthKey, items }
}

/** Factual budget lines for Smart Spending Insights (not the Monthly Budget Alerts panel). */
export function buildBudgetInsights(statusResult) {
  if (!statusResult?.ok) return []

  const insights = []
  for (const item of statusResult.items) {
    if (item.status === 'exceeded') {
      insights.push({
        id: `budget-exceeded:${item.id}`,
        budgetId: item.id,
        categoryId: item.categoryId,
        overPaise: -item.remainingPaise,
      })
    } else if (item.status === 'approaching') {
      insights.push({
        id: `budget-approaching:${item.id}`,
        budgetId: item.id,
        categoryId: item.categoryId,
        percentUsed: item.percentUsed,
        remainingPaise: item.remainingPaise,
        atLimit: item.percentUsed === 100,
      })
    }
  }
  return insights
}
