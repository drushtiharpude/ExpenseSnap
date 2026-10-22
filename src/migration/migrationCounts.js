/** @param {{ transactions?: unknown[], categories?: unknown[], budgets?: unknown[], recurringBills?: unknown[], savingsGoals?: unknown[] }} backup */
export function migrationEntityCounts(backup) {
  if (!backup || typeof backup !== 'object') {
    return {
      transactions: 0,
      categories: 0,
      budgets: 0,
      recurringBills: 0,
      savingsGoals: 0,
    }
  }
  return {
    transactions: Array.isArray(backup.transactions) ? backup.transactions.length : 0,
    categories: Array.isArray(backup.categories) ? backup.categories.length : 0,
    budgets: Array.isArray(backup.budgets) ? backup.budgets.length : 0,
    recurringBills: Array.isArray(backup.recurringBills) ? backup.recurringBills.length : 0,
    savingsGoals: Array.isArray(backup.savingsGoals) ? backup.savingsGoals.length : 0,
  }
}

/** @param {ReturnType<typeof migrationEntityCounts>} counts */
export function migrationCountsTotal(counts) {
  return (
    counts.transactions +
    counts.categories +
    counts.budgets +
    counts.recurringBills +
    counts.savingsGoals
  )
}

/** Cloud row counts from Supabase head requests. */
export function cloudCountsFromRows(rows) {
  return {
    transactions: rows.transactions ?? 0,
    categories: rows.categories ?? 0,
    budgets: rows.budgets ?? 0,
    recurringBills: rows.recurringBills ?? 0,
    savingsGoals: rows.savingsGoals ?? 0,
  }
}

/** First-time import requires empty cloud tenant (no cross-account merge). */
export function isCloudEmptyForImport(counts) {
  return migrationCountsTotal(counts) === 0
}
