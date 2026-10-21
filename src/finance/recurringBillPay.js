import { createTransaction } from '../data/transaction.js'
import { readRecurringBills, saveRecurringBills } from '../data/recurringBillStore.js'
import {
  readTransactions,
  readTransactionsStorageRaw,
  restoreTransactionsStorageRaw,
  saveTransactions,
} from '../data/transactionStore.js'
import {
  readRecurringBillsStorageRaw,
  restoreRecurringBillsStorageRaw,
} from '../data/recurringBillStore.js'
import { billAfterPayment } from './recurringBillSchedule.js'

function rollbackPayment(storage, snapshot) {
  const txRollback = restoreTransactionsStorageRaw(storage, snapshot.transactionsRaw)
  const billsRollback = restoreRecurringBillsStorageRaw(storage, snapshot.recurringBillsRaw)
  return { ok: txRollback.ok && billsRollback.ok }
}

/**
 * Marks one bill paid: one expense transaction + advanced due date, with rollback on failure.
 */
export function payRecurringBill(billId, options = {}) {
  const { now = new Date(), storage, customCategories = [] } = options
  const billsRead = readRecurringBills(storage, { customCategories })
  if (!billsRead.ok) return { ok: false, error: billsRead.error, errors: billsRead.errors }

  const txRead = readTransactions(storage)
  if (!txRead.ok) return { ok: false, error: txRead.error, errors: txRead.errors }

  const index = billsRead.bills.findIndex((bill) => bill.id === billId)
  if (index < 0) return { ok: false, errors: ['Recurring bill was not found.'] }

  const payment = billAfterPayment(billsRead.bills[index], now)
  if (!payment.ok) return payment

  const created = createTransaction(payment.transactionInput, now)
  if (!created.ok) return created

  const nextBills = billsRead.bills.map((bill, billIndex) =>
    billIndex === index ? payment.bill : bill,
  )
  const nextTransactions = [...txRead.transactions, created.transaction]

  const txRaw = readTransactionsStorageRaw(storage)
  const billsRaw = readRecurringBillsStorageRaw(storage)
  if (!txRaw.ok || !billsRaw.ok) {
    return { ok: false, error: 'unavailable', errors: ['Storage could not be read for rollback.'] }
  }
  const snapshot = {
    transactionsRaw: txRaw.raw,
    recurringBillsRaw: billsRaw.raw,
  }

  const savedTx = saveTransactions(nextTransactions, storage)
  if (!savedTx.ok) {
    return { ok: false, error: savedTx.error, errors: savedTx.errors }
  }

  const savedBills = saveRecurringBills(nextBills, storage, { customCategories })
  if (!savedBills.ok) {
    rollbackPayment(storage, snapshot)
    return {
      ok: false,
      error: savedBills.error,
      errors: savedBills.errors,
      message: 'Payment was rolled back because the bill could not be saved.',
    }
  }

  return {
    ok: true,
    bill: payment.bill,
    transaction: created.transaction,
  }
}
