import { readCategories } from '../data/categoryStore.js'
import { readTransactions } from '../data/transactionStore.js'
import { summarizeTransactions } from '../finance/summarize.js'
import { categoryLabel } from '../transactions/categories.js'
import { formatInrFromPaise } from '../transactions/money.js'

function storageReadErrorMessage(result, noun) {
  if (result.error === 'unavailable') {
    return `Browser storage is unavailable. ${noun} could not be read.`
  }
  if (result.error === 'malformed' && Array.isArray(result.errors)) {
    return result.errors.join(' ')
  }
  if (result.error === 'malformed') {
    return `Saved ${noun} could not be read.`
  }
  return `Saved ${noun} could not be read.`
}

/**
 * @param {Storage} [storage]
 * @returns {{ ok: true, rows: Array<{ date: string, type: string, description: string, category: string, amountInr: string, amountPaise: number }>, summary: { incomeInr: string, expenseInr: string, netInr: string, incomePaise: number, expensePaise: number, netPaise: number }, generatedAt: string } | { ok: false, error: string }}
 */
export function prepareTransactionExportData(storage) {
  const transactionsResult = readTransactions(storage)
  if (!transactionsResult.ok) {
    return { ok: false, error: storageReadErrorMessage(transactionsResult, 'transactions') }
  }
  const categoriesResult = readCategories(storage)
  if (!categoriesResult.ok) {
    return { ok: false, error: storageReadErrorMessage(categoriesResult, 'categories') }
  }

  const customCategories = categoriesResult.categories
  const transactions = [...transactionsResult.transactions].sort((left, right) => {
    const dateCompare = String(left.date).localeCompare(String(right.date))
    if (dateCompare !== 0) return dateCompare
    return String(left.id).localeCompare(String(right.id))
  })

  const summaryResult = summarizeTransactions(transactions)
  if (!summaryResult.ok) {
    return { ok: false, error: 'Transaction totals could not be calculated.' }
  }

  const rows = transactions.map((transaction) => {
    const typeLabel = transaction.type === 'income' ? 'Income' : 'Expense'
    const description =
      typeof transaction.description === 'string' && transaction.description.trim() !== ''
        ? transaction.description.trim()
        : '—'
    return {
      date: transaction.date,
      type: typeLabel,
      description,
      category: categoryLabel(transaction.categoryId, customCategories),
      amountInr: formatInrFromPaise(transaction.amountPaise),
      amountPaise: transaction.amountPaise,
    }
  })

  return {
    ok: true,
    rows,
    summary: {
      incomeInr: formatInrFromPaise(summaryResult.incomePaise),
      expenseInr: formatInrFromPaise(summaryResult.expensePaise),
      netInr: formatInrFromPaise(summaryResult.netPaise),
      incomePaise: summaryResult.incomePaise,
      expensePaise: summaryResult.expensePaise,
      netPaise: summaryResult.netPaise,
    },
    generatedAt: new Date().toISOString(),
  }
}

export function exportFilenameStem(prefix, generatedAt) {
  const date =
    typeof generatedAt === 'string' && generatedAt.length >= 10
      ? generatedAt.slice(0, 10)
      : 'unknown-date'
  return `expensesnap-${prefix}-${date}`
}
