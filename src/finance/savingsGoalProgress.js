import { goalSavedBalancePaise } from '../data/savingsGoal.js'

export function goalProgressPercent(savedPaise, targetPaise) {
  if (!Number.isSafeInteger(savedPaise) || !Number.isSafeInteger(targetPaise) || targetPaise < 1) {
    return 0
  }
  if (savedPaise <= 0) return 0
  return Math.min(100, Math.floor((savedPaise * 100) / targetPaise))
}

/** Ring stroke (0–1) and display percent; stroke capped at 1 for valid SVG arcs. */
export function goalRingMetrics(savedPaise, targetPaise) {
  if (!Number.isSafeInteger(savedPaise) || savedPaise < 0) {
    return { displayPercent: 0, strokeFraction: 0, complete: false, valid: false }
  }
  if (!Number.isSafeInteger(targetPaise) || targetPaise < 1) {
    return { displayPercent: 0, strokeFraction: 0, complete: false, valid: false }
  }

  const ratio = savedPaise / targetPaise
  if (!Number.isFinite(ratio)) {
    return { displayPercent: 0, strokeFraction: 0, complete: false, valid: false }
  }

  const strokeFraction = Math.min(1, Math.max(0, ratio))
  const displayPercent = Math.max(0, Math.floor((savedPaise * 100) / targetPaise))

  return {
    displayPercent,
    strokeFraction,
    complete: savedPaise >= targetPaise,
    valid: true,
  }
}

export function goalProgressBarWidth(savedPaise, targetPaise) {
  return goalProgressPercent(savedPaise, targetPaise)
}

export function goalRemainingPaise(savedPaise, targetPaise) {
  if (!Number.isSafeInteger(savedPaise) || !Number.isSafeInteger(targetPaise)) return null
  return Math.max(0, targetPaise - savedPaise)
}

export function goalIsComplete(savedPaise, targetPaise) {
  return Number.isSafeInteger(savedPaise) && Number.isSafeInteger(targetPaise) && savedPaise >= targetPaise
}

export function summarizeSavingsGoals(goals) {
  if (!Array.isArray(goals)) return { ok: false, errors: ['Savings goals must be a list.'] }

  let totalSavedPaise = 0
  let totalTargetPaise = 0
  let activeGoals = 0
  let completedGoals = 0

  for (const goal of goals) {
    const saved = goalSavedBalancePaise(goal.entries)
    if (saved === null) return { ok: false, errors: ['Invalid savings goal entries.'] }
    totalSavedPaise += saved
    totalTargetPaise += goal.targetPaise
    activeGoals += 1
    if (saved >= goal.targetPaise) completedGoals += 1
  }

  return {
    ok: true,
    goalCount: goals.length,
    activeGoals,
    completedGoals,
    totalSavedPaise,
    totalTargetPaise,
  }
}

export function compareSavingsEntries(left, right) {
  if (left.date !== right.date) return right.date.localeCompare(left.date)
  if (left.createdAt !== right.createdAt) return right.createdAt.localeCompare(left.createdAt)
  return left.id.localeCompare(right.id)
}

export function sortedSavingsEntries(entries) {
  if (!Array.isArray(entries)) return []
  return [...entries].sort(compareSavingsEntries)
}
