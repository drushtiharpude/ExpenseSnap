import { previousMonthKey, summarizeForMonth } from './analyze.js'

/** Teal / amber–leaning palette aligned with design tokens (use as SVG/CSS var()). */
export const DASHBOARD_CATEGORY_COLORS = [
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-5)',
  'var(--chart-4)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-1)',
  'var(--chart-8)',
]

export function shortMonthLabel(monthKey) {
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) return ''
  const [year, monthNumber] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(
    new Date(year, monthNumber - 1, 1),
  )
}

/** Oldest → newest window of calendar months ending at anchorMonth. */
export function monthKeysWindowEnding(anchorMonth, count = 4) {
  if (typeof anchorMonth !== 'string' || count < 1) return []
  const keys = [anchorMonth]
  let cursor = anchorMonth
  while (keys.length < count) {
    const prev = previousMonthKey(cursor)
    if (!prev) break
    keys.unshift(prev)
    cursor = prev
  }
  return keys
}

export function buildCategoryDonutSegments(categories, totalExpensePaise) {
  if (!Array.isArray(categories) || !Number.isSafeInteger(totalExpensePaise) || totalExpensePaise < 1) {
    return []
  }

  let startFraction = 0
  const segments = []

  categories.forEach((category, index) => {
    if (!Number.isSafeInteger(category.amountPaise) || category.amountPaise < 1) return
    const fraction = category.amountPaise / totalExpensePaise
    if (fraction <= 0) return
    segments.push({
      categoryId: category.categoryId,
      amountPaise: category.amountPaise,
      fraction,
      startFraction,
      color: DASHBOARD_CATEGORY_COLORS[index % DASHBOARD_CATEGORY_COLORS.length],
    })
    startFraction += fraction
  })

  return segments
}

export function buildDashboardCashFlow(transactions, anchorMonth, count = 4) {
  const months = monthKeysWindowEnding(anchorMonth, count)
  const rows = months.map((monthKey) => {
    const summary = summarizeForMonth(transactions, monthKey)
    return {
      monthKey,
      label: shortMonthLabel(monthKey),
      incomePaise: summary.ok ? summary.incomePaise : 0,
      expensePaise: summary.ok ? summary.expensePaise : 0,
    }
  })

  let maxPaise = 0
  for (const row of rows) {
    maxPaise = Math.max(maxPaise, row.incomePaise, row.expensePaise)
  }

  return { ok: true, rows, maxPaise: Math.max(maxPaise, 1) }
}
