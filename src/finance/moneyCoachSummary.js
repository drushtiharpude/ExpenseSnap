import { isBudgetMonthKey } from '../data/budget.js'
import { categoryLabel } from '../transactions/categories.js'
import { buildAnalyticsInsights, summarizeForMonth } from './analyze.js'
import { budgetStatusForMonth } from './budgetStatus.js'
import { monthCalendarMeta, safeToSpendForMonth } from './safeToSpend.js'
import { calendarMonthKey } from './summarize.js'

export const MONEY_COACH_SUMMARY_VERSION = 1
/** safeToSpend.mode when saved budgets could not be read — budget-derived fields must be null. */
export const SAFE_TO_SPEND_MODE_BUDGET_UNAVAILABLE = 'budget_data_unavailable'
export const MAX_COACH_TOP_CATEGORIES = 8
export const MAX_COACH_BUDGET_ROWS = 10
export const MAX_COACH_ANALYTICS_FACTS = 12

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SUMMARY_ROOT_KEYS = new Set([
  'version',
  'currency',
  'month',
  'budgetDataStatus',
  'totals',
  'safeToSpend',
  'topExpenseCategories',
  'budgets',
  'analyticsFacts',
])

const TOTALS_KEYS = new Set(['incomePaise', 'expensePaise', 'netPaise'])

const SAFE_TO_SPEND_KEYS = new Set([
  'mode',
  'headlinePaise',
  'hasBudgets',
  'budgetLimitPaise',
  'budgetSpentPaise',
  'budgetRemainingPaise',
  'unbudgetedExpensePaise',
  'dayOfMonth',
  'daysInMonth',
])

const CATEGORY_ROW_KEYS = new Set(['label', 'amountPaise'])

const BUDGET_ROW_KEYS = new Set([
  'label',
  'limitPaise',
  'spentPaise',
  'remainingPaise',
  'status',
])

function isNonNegativePaise(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function assertRequiredKeys(value, requiredKeys, path, errors) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${path} must be an object.`)
    return
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) {
      errors.push(`${path}.${key} is required.`)
    }
  }
}

function assertExactKeys(value, allowedKeys, path, errors) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${path} must be an object.`)
    return
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${path} contains unexpected field "${key}".`)
    }
  }
}

function nullablePaise(value) {
  return value === undefined ? null : value
}

function nonNullishIntegerPaise(value, fallback = 0) {
  if (value === undefined || value === null) return fallback
  return value
}

/**
 * Ensures the summary matches the wire schema after JSON serialization (no undefined keys).
 * Normalizes budget-unavailable summaries that incorrectly carry zero budget placeholders.
 */
export function sealMoneyCoachSummary(summary) {
  if (summary === null || typeof summary !== 'object' || Array.isArray(summary)) {
    return summary
  }

  const unavailable =
    summary.budgetDataStatus === 'unavailable' ||
    summary.safeToSpend?.mode === SAFE_TO_SPEND_MODE_BUDGET_UNAVAILABLE
  const sts =
    summary.safeToSpend !== null && typeof summary.safeToSpend === 'object'
      ? summary.safeToSpend
      : {}

  let safeToSpend
  if (unavailable) {
    safeToSpend = {
      mode: SAFE_TO_SPEND_MODE_BUDGET_UNAVAILABLE,
      headlinePaise: null,
      hasBudgets: false,
      budgetLimitPaise: null,
      budgetSpentPaise: null,
      budgetRemainingPaise: null,
      unbudgetedExpensePaise: null,
      dayOfMonth: nullablePaise(sts.dayOfMonth),
      daysInMonth: nullablePaise(sts.daysInMonth),
    }
  } else {
    safeToSpend = {
      mode: typeof sts.mode === 'string' ? sts.mode : 'empty_month',
      headlinePaise: nullablePaise(sts.headlinePaise),
      hasBudgets: sts.hasBudgets === true,
      budgetLimitPaise: nonNullishIntegerPaise(sts.budgetLimitPaise, 0),
      budgetSpentPaise: nonNullishIntegerPaise(sts.budgetSpentPaise, 0),
      budgetRemainingPaise: nonNullishIntegerPaise(sts.budgetRemainingPaise, 0),
      unbudgetedExpensePaise: nonNullishIntegerPaise(sts.unbudgetedExpensePaise, 0),
      dayOfMonth: nullablePaise(sts.dayOfMonth),
      daysInMonth: nullablePaise(sts.daysInMonth),
    }
  }

  return {
    version: summary.version,
    currency: summary.currency,
    month: summary.month,
    budgetDataStatus: unavailable ? 'unavailable' : summary.budgetDataStatus,
    totals: {
      incomePaise: summary.totals?.incomePaise ?? 0,
      expensePaise: summary.totals?.expensePaise ?? 0,
      netPaise: summary.totals?.netPaise ?? 0,
    },
    safeToSpend,
    topExpenseCategories: Array.isArray(summary.topExpenseCategories)
      ? summary.topExpenseCategories
      : [],
    budgets: unavailable
      ? []
      : Array.isArray(summary.budgets)
        ? summary.budgets
        : [],
    analyticsFacts: Array.isArray(summary.analyticsFacts) ? summary.analyticsFacts : [],
  }
}

function analyticsFactsFromInsights(insights, customCategories) {
  if (!Array.isArray(insights)) return []
  const facts = []
  for (const insight of insights) {
    if (facts.length >= MAX_COACH_ANALYTICS_FACTS) break
    if (insight.id === 'top-category') {
      facts.push({
        type: 'top_category',
        label: categoryLabel(insight.categoryId, customCategories),
        amountPaise: insight.amountPaise,
      })
      continue
    }
    if (insight.id === 'expense-vs-previous') {
      const fact = {
        type: 'expense_vs_previous',
        previousMonth: insight.previousMonth,
        diffPaise: insight.diffPaise,
      }
      if (Number.isSafeInteger(insight.percentChange)) {
        fact.percentChange = insight.percentChange
      }
      facts.push(fact)
      continue
    }
    if (insight.id === 'month-net') {
      facts.push({
        type: 'month_net',
        netPaise: insight.netPaise,
      })
      continue
    }
    if (typeof insight.id === 'string' && insight.id.startsWith('category-mom-up:')) {
      facts.push({
        type: 'category_increase',
        previousMonth: insight.previousMonth,
        label: categoryLabel(insight.categoryId, customCategories),
        deltaPaise: insight.deltaPaise,
      })
    }
  }
  return facts
}

/**
 * Builds a versioned, privacy-minimized summary for Money Coach (current calendar month).
 * @param {{ budgetDataStatus?: 'ok' | 'unavailable' }} options — when 'unavailable', budget rows are omitted and status is flagged incomplete.
 */
export function buildMoneyCoachSummary({
  transactions,
  budgets = [],
  customCategories = [],
  now = new Date(),
  budgetDataStatus = 'ok',
}) {
  if (!Array.isArray(transactions)) return { ok: false, error: 'invalid' }
  if (!Array.isArray(budgets)) return { ok: false, error: 'invalid' }
  if (budgetDataStatus !== 'ok' && budgetDataStatus !== 'unavailable') {
    return { ok: false, error: 'invalid' }
  }

  const monthKey = calendarMonthKey(now)
  if (!isBudgetMonthKey(monthKey)) return { ok: false, error: 'invalid_month' }

  const monthSummary = summarizeForMonth(transactions, monthKey)
  if (!monthSummary.ok) return { ok: false, error: monthSummary.error }

  let budgetRows = []
  if (budgetDataStatus === 'ok') {
    const budgetStatus = budgetStatusForMonth(budgets, transactions, monthKey, customCategories)
    if (!budgetStatus.ok) return { ok: false, error: 'invalid' }
    budgetRows = budgetStatus.items.slice(0, MAX_COACH_BUDGET_ROWS).map((item) => ({
      label: item.categoryLabel,
      limitPaise: item.limitPaise,
      spentPaise: item.spentPaise,
      remainingPaise: item.remainingPaise,
      status: item.status,
    }))
  }

  let safeToSpendBlock
  if (budgetDataStatus === 'unavailable') {
    const calendar = monthCalendarMeta(now)
    safeToSpendBlock = {
      mode: SAFE_TO_SPEND_MODE_BUDGET_UNAVAILABLE,
      headlinePaise: null,
      hasBudgets: false,
      budgetLimitPaise: null,
      budgetSpentPaise: null,
      budgetRemainingPaise: null,
      unbudgetedExpensePaise: null,
      dayOfMonth: calendar.dayOfMonth,
      daysInMonth: calendar.daysInMonth,
    }
  } else {
    const safeToSpend = safeToSpendForMonth(
      transactions,
      budgets,
      monthKey,
      customCategories,
      now,
    )
    if (!safeToSpend.ok) return { ok: false, error: safeToSpend.error ?? 'invalid' }
    safeToSpendBlock = {
      mode: safeToSpend.mode,
      headlinePaise: safeToSpend.headlinePaise,
      hasBudgets: safeToSpend.hasBudgets,
      budgetLimitPaise: safeToSpend.budgetLimitPaise,
      budgetSpentPaise: safeToSpend.budgetSpentPaise,
      budgetRemainingPaise: safeToSpend.budgetRemainingPaise,
      unbudgetedExpensePaise: safeToSpend.unbudgetedExpensePaise,
      dayOfMonth: safeToSpend.dayOfMonth,
      daysInMonth: safeToSpend.daysInMonth,
    }
  }

  const insights = buildAnalyticsInsights(transactions, monthKey)

  const topExpenseCategories = monthSummary.categories
    .slice(0, MAX_COACH_TOP_CATEGORIES)
    .map((row) => ({
      label: categoryLabel(row.categoryId, customCategories),
      amountPaise: row.amountPaise,
    }))

  const summary = sealMoneyCoachSummary({
    version: MONEY_COACH_SUMMARY_VERSION,
    currency: 'INR',
    month: monthKey,
    budgetDataStatus,
    totals: {
      incomePaise: monthSummary.incomePaise,
      expensePaise: monthSummary.expensePaise,
      netPaise: monthSummary.netPaise,
    },
    safeToSpend: safeToSpendBlock,
    topExpenseCategories,
    budgets: budgetRows,
    analyticsFacts: analyticsFactsFromInsights(insights, customCategories),
  })

  return { ok: true, month: monthKey, summary }
}

function validateTotals(totals, errors) {
  assertRequiredKeys(totals, TOTALS_KEYS, 'totals', errors)
  assertExactKeys(totals, TOTALS_KEYS, 'totals', errors)
  if (errors.some((entry) => entry.startsWith('totals'))) return
  for (const key of TOTALS_KEYS) {
    if (!Number.isSafeInteger(totals[key])) {
      errors.push(`totals.${key} must be a safe integer.`)
    }
  }
}

const BUDGET_DEPENDENT_PAISE_FIELDS = [
  'headlinePaise',
  'budgetLimitPaise',
  'budgetSpentPaise',
  'budgetRemainingPaise',
  'unbudgetedExpensePaise',
]

function validateSafeToSpendBudgetDataStatus(summary, errors) {
  const block = summary.safeToSpend
  if (summary.budgetDataStatus === 'unavailable') {
    if (block.mode !== SAFE_TO_SPEND_MODE_BUDGET_UNAVAILABLE) {
      errors.push('safeToSpend.mode must be budget_data_unavailable when budget data is unavailable.')
    }
    if (block.hasBudgets !== false) {
      errors.push('safeToSpend.hasBudgets must be false when budget data is unavailable.')
    }
    for (const key of BUDGET_DEPENDENT_PAISE_FIELDS) {
      if (block[key] !== null) {
        errors.push(`safeToSpend.${key} must be null when budget data is unavailable.`)
      }
    }
    return
  }
  if (block.mode === SAFE_TO_SPEND_MODE_BUDGET_UNAVAILABLE) {
    errors.push('safeToSpend.mode must not be budget_data_unavailable when budget data is ok.')
  }
}

function validateSafeToSpendBlock(block, errors) {
  assertRequiredKeys(block, SAFE_TO_SPEND_KEYS, 'safeToSpend', errors)
  assertExactKeys(block, SAFE_TO_SPEND_KEYS, 'safeToSpend', errors)
  if (errors.some((entry) => entry.startsWith('safeToSpend'))) return
  if (typeof block.mode !== 'string' || block.mode.length < 1 || block.mode.length > 64) {
    errors.push('safeToSpend.mode is invalid.')
  }
  if (typeof block.hasBudgets !== 'boolean') {
    errors.push('safeToSpend.hasBudgets must be a boolean.')
  }
  for (const key of BUDGET_DEPENDENT_PAISE_FIELDS) {
    const value = block[key]
    if (value !== null && !Number.isSafeInteger(value)) {
      errors.push(`safeToSpend.${key} must be an integer or null.`)
    }
  }
  for (const key of ['dayOfMonth', 'daysInMonth']) {
    const value = block[key]
    if (value !== null && (!Number.isSafeInteger(value) || value < 1 || value > 31)) {
      errors.push(`safeToSpend.${key} is invalid.`)
    }
  }
}

function validateCategoryRows(rows, fieldName, maxLen, errors) {
  if (!Array.isArray(rows)) {
    errors.push(`${fieldName} must be an array.`)
    return
  }
  if (rows.length > maxLen) {
    errors.push(`${fieldName} exceeds the allowed length.`)
    return
  }
  rows.forEach((row, index) => {
    const path = `${fieldName}[${index}]`
    assertRequiredKeys(row, CATEGORY_ROW_KEYS, path, errors)
    assertExactKeys(row, CATEGORY_ROW_KEYS, path, errors)
    if (typeof row.label !== 'string' || row.label.length < 1 || row.label.length > 128) {
      errors.push(`${path}.label is invalid.`)
    }
    if (!isNonNegativePaise(row.amountPaise)) {
      errors.push(`${path}.amountPaise is invalid.`)
    }
  })
}

function validateBudgetRows(rows, errors) {
  if (!Array.isArray(rows)) {
    errors.push('budgets must be an array.')
    return
  }
  if (rows.length > MAX_COACH_BUDGET_ROWS) {
    errors.push('budgets exceeds the allowed length.')
    return
  }
  const statuses = new Set(['ok', 'approaching', 'exceeded'])
  rows.forEach((row, index) => {
    const path = `budgets[${index}]`
    assertRequiredKeys(row, BUDGET_ROW_KEYS, path, errors)
    assertExactKeys(row, BUDGET_ROW_KEYS, path, errors)
    if (typeof row.label !== 'string' || row.label.length < 1 || row.label.length > 128) {
      errors.push(`${path}.label is invalid.`)
    }
    for (const key of ['limitPaise', 'spentPaise']) {
      if (!isNonNegativePaise(row[key])) {
        errors.push(`${path}.${key} is invalid.`)
      }
    }
    if (!Number.isSafeInteger(row.remainingPaise)) {
      errors.push(`${path}.remainingPaise is invalid.`)
    }
    if (!statuses.has(row.status)) {
      errors.push(`${path}.status is invalid.`)
    }
  })
}

function validateAnalyticsFact(fact, index, errors) {
  const path = `analyticsFacts[${index}]`
  if (fact === null || typeof fact !== 'object' || Array.isArray(fact)) {
    errors.push(`${path} must be an object.`)
    return
  }
  if (typeof fact.type !== 'string') {
    errors.push(`${path}.type is invalid.`)
    return
  }
  if (fact.type === 'top_category') {
    assertRequiredKeys(fact, new Set(['type', 'label', 'amountPaise']), path, errors)
    assertExactKeys(fact, new Set(['type', 'label', 'amountPaise']), path, errors)
    if (typeof fact.label !== 'string' || fact.label.length < 1 || fact.label.length > 128) {
      errors.push(`${path}.label is invalid.`)
    }
    if (!isNonNegativePaise(fact.amountPaise)) {
      errors.push(`${path}.amountPaise is invalid.`)
    }
    return
  }
  if (fact.type === 'expense_vs_previous') {
    const allowed = new Set(['type', 'previousMonth', 'diffPaise', 'percentChange'])
    assertRequiredKeys(fact, new Set(['type', 'previousMonth', 'diffPaise']), path, errors)
    assertExactKeys(fact, allowed, path, errors)
    if (!isBudgetMonthKey(fact.previousMonth)) {
      errors.push(`${path}.previousMonth is invalid.`)
    }
    if (!Number.isSafeInteger(fact.diffPaise)) {
      errors.push(`${path}.diffPaise is invalid.`)
    }
    if (
      Object.hasOwn(fact, 'percentChange') &&
      !Number.isSafeInteger(fact.percentChange)
    ) {
      errors.push(`${path}.percentChange is invalid.`)
    }
    return
  }
  if (fact.type === 'month_net') {
    assertRequiredKeys(fact, new Set(['type', 'netPaise']), path, errors)
    assertExactKeys(fact, new Set(['type', 'netPaise']), path, errors)
    if (!Number.isSafeInteger(fact.netPaise)) {
      errors.push(`${path}.netPaise is invalid.`)
    }
    return
  }
  if (fact.type === 'category_increase') {
    assertRequiredKeys(
      fact,
      new Set(['type', 'previousMonth', 'label', 'deltaPaise']),
      path,
      errors,
    )
    assertExactKeys(
      fact,
      new Set(['type', 'previousMonth', 'label', 'deltaPaise']),
      path,
      errors,
    )
    if (!isBudgetMonthKey(fact.previousMonth)) {
      errors.push(`${path}.previousMonth is invalid.`)
    }
    if (typeof fact.label !== 'string' || fact.label.length < 1 || fact.label.length > 128) {
      errors.push(`${path}.label is invalid.`)
    }
    if (!Number.isSafeInteger(fact.deltaPaise) || fact.deltaPaise < 1) {
      errors.push(`${path}.deltaPaise is invalid.`)
    }
    return
  }
  errors.push(`${path}.type is invalid.`)
}

function validateAnalyticsFacts(facts, errors) {
  if (!Array.isArray(facts)) {
    errors.push('analyticsFacts must be an array.')
    return
  }
  if (facts.length > MAX_COACH_ANALYTICS_FACTS) {
    errors.push('analyticsFacts exceeds the allowed length.')
    return
  }
  facts.forEach((fact, index) => validateAnalyticsFact(fact, index, errors))
}

/** Validates the canonical Money Coach summary object (privacy and shape checks). */
export function validateMoneyCoachSummary(summary) {
  const errors = []
  if (summary === null || typeof summary !== 'object' || Array.isArray(summary)) {
    return { ok: false, errors: ['summary must be an object.'] }
  }

  assertRequiredKeys(summary, SUMMARY_ROOT_KEYS, 'summary', errors)
  assertExactKeys(summary, SUMMARY_ROOT_KEYS, 'summary', errors)
  for (const key of Object.keys(summary)) {
    if (key === 'description' || key === 'id' || key.endsWith('Id')) {
      errors.push(`summary must not include field "${key}".`)
    }
  }

  if (summary.version !== MONEY_COACH_SUMMARY_VERSION) {
    errors.push('summary.version is invalid.')
  }
  if (summary.currency !== 'INR') {
    errors.push('summary.currency must be INR.')
  }
  if (!isBudgetMonthKey(summary.month)) {
    errors.push('summary.month must be YYYY-MM.')
  }
  if (summary.budgetDataStatus !== 'ok' && summary.budgetDataStatus !== 'unavailable') {
    errors.push('summary.budgetDataStatus is invalid.')
  }

  validateTotals(summary.totals, errors)
  validateSafeToSpendBlock(summary.safeToSpend, errors)
  validateCategoryRows(summary.topExpenseCategories, 'topExpenseCategories', MAX_COACH_TOP_CATEGORIES, errors)
  validateBudgetRows(summary.budgets, errors)
  validateAnalyticsFacts(summary.analyticsFacts, errors)

  if (summary.budgetDataStatus === 'unavailable' && summary.budgets.length > 0) {
    errors.push('summary.budgets must be empty when budgetDataStatus is unavailable.')
  }

  validateSafeToSpendBudgetDataStatus(summary, errors)

  const serialized = JSON.stringify(summary)
  if (serialized.includes('"description"')) {
    errors.push('summary must not contain descriptions.')
  }
  if (UUID_PATTERN.test(serialized)) {
    errors.push('summary must not contain UUIDs.')
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true }
}

