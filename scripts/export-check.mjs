import * as XLSX from 'xlsx'
import { createTransaction } from '../src/data/transaction.js'
import { saveTransactions } from '../src/data/transactionStore.js'
import { saveCategories } from '../src/data/categoryStore.js'
import {
  exportFilenameStem,
  prepareTransactionExportData,
} from '../src/settings/transactionExportData.js'

function check(label, pass) {
  if (!pass) {
    console.error('FAIL', label)
    process.exitCode = 1
    return
  }
  console.log('OK', label)
}

function memoryStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(key, value)
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}

const mem = memoryStorage()
const tx = createTransaction({
  type: 'expense',
  amountPaise: 12_500,
  date: '2026-03-15',
  categoryId: 'food',
  description: 'Lunch',
})
const income = createTransaction({
  type: 'income',
  amountPaise: 50_000,
  date: '2026-03-01',
  categoryId: 'salary',
  description: 'Pay',
})
if (!tx.ok || !income.ok) throw new Error('fixture transactions invalid')
saveTransactions([tx.transaction, income.transaction], mem)
saveCategories([], mem)

const prepared = prepareTransactionExportData(mem)
check('export data ok', prepared.ok === true)
check('export row count', prepared.rows.length === 2)
check('export category label', prepared.rows[0].category === 'Food' || prepared.rows[1].category === 'Food')
check('export inr format', prepared.rows.some((row) => row.amountInr.includes('₹')))
check('export summary net', prepared.summary.netPaise === 50_000 - 12_500)

const emptyMem = memoryStorage()
saveTransactions([], emptyMem)
saveCategories([], emptyMem)
const empty = prepareTransactionExportData(emptyMem)
check('empty export data ok', empty.ok === true && empty.rows.length === 0)

check(
  'filename stem',
  exportFilenameStem('transactions', '2026-03-15T12:00:00.000Z') ===
    'expensesnap-transactions-2026-03-15',
)

const sheetRows = [
  ['Date', 'Type', 'Description', 'Category', 'Amount (INR)'],
  ...prepared.rows.map((row) => [row.date, row.type, row.description, row.category, row.amountInr]),
]
const worksheet = XLSX.utils.aoa_to_sheet(sheetRows)
const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions')
const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
check('xlsx buffer created', Buffer.isBuffer(buffer) && buffer.length > 0)
const parsed = XLSX.read(buffer, { type: 'buffer' })
check('xlsx sheet name', parsed.SheetNames[0] === 'Transactions')
check('xlsx header cell', parsed.Sheets.Transactions.A1.v === 'Date')

if (process.exitCode) {
  console.error('EXPORT CHECKS FAILED')
} else {
  console.log('ALL EXPORT CHECKS PASSED')
}
