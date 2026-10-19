export function calendarMonthKey(now) {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

export function addPaise(total, amount) {
  const next = total + amount
  if (!Number.isSafeInteger(next)) return null
  return next
}

export function summarizeTransactions(transactions, now = new Date()) {
  if (!Array.isArray(transactions)) return { ok: false, error: 'invalid' }

  const month = calendarMonthKey(now)
  let incomePaise = 0
  let expensePaise = 0
  let monthIncomePaise = 0
  let monthExpensePaise = 0
  const categoryPaise = new Map()

  for (const transaction of transactions) {
    const amount = transaction?.amountPaise
    const inMonth = typeof transaction?.date === 'string' && transaction.date.slice(0, 7) === month
    if (!Number.isSafeInteger(amount) || amount < 1) return { ok: false, error: 'invalid' }

    if (transaction.type === 'income') {
      incomePaise = addPaise(incomePaise, amount)
      if (inMonth) monthIncomePaise = addPaise(monthIncomePaise, amount)
    } else if (transaction.type === 'expense') {
      expensePaise = addPaise(expensePaise, amount)
      if (inMonth) monthExpensePaise = addPaise(monthExpensePaise, amount)
      const categoryId = transaction.categoryId
      categoryPaise.set(categoryId, addPaise(categoryPaise.get(categoryId) ?? 0, amount))
    } else {
      return { ok: false, error: 'invalid' }
    }

    if (
      incomePaise === null ||
      expensePaise === null ||
      monthIncomePaise === null ||
      monthExpensePaise === null ||
      [...categoryPaise.values()].some((value) => value === null)
    ) {
      return { ok: false, error: 'overflow' }
    }
  }

  const netPaise = incomePaise - expensePaise
  if (!Number.isSafeInteger(netPaise)) return { ok: false, error: 'overflow' }

  const categories = [...categoryPaise.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amountPaise: amount }))
    .sort((left, right) => right.amountPaise - left.amountPaise || left.categoryId.localeCompare(right.categoryId))

  return {
    ok: true,
    month,
    incomePaise,
    expensePaise,
    netPaise,
    monthIncomePaise,
    monthExpensePaise,
    categories,
  }
}
