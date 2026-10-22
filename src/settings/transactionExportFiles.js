import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { exportFilenameStem, prepareTransactionExportData } from './transactionExportData.js'

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * @param {Storage} [storage]
 * @returns {{ ok: true, filename: string, rowCount: number } | { ok: false, error: string, empty?: boolean }}
 */
export function exportTransactionsToExcel(storage) {
  const prepared = prepareTransactionExportData(storage)
  if (!prepared.ok) {
    return { ok: false, error: prepared.error }
  }
  if (prepared.rows.length === 0) {
    return {
      ok: false,
      empty: true,
      error: 'There are no transactions to export yet. Add transactions first.',
    }
  }

  try {
    const sheetRows = [
      ['Date', 'Type', 'Description', 'Category', 'Amount (INR)'],
      ...prepared.rows.map((row) => [
        row.date,
        row.type,
        row.description,
        row.category,
        row.amountInr,
      ]),
    ]
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows)
    worksheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 32 }, { wch: 18 }, { wch: 16 }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const filename = `${exportFilenameStem('transactions', prepared.generatedAt)}.xlsx`
    triggerDownload(blob, filename)
    return { ok: true, filename, rowCount: prepared.rows.length }
  } catch {
    return { ok: false, error: 'Could not create the Excel file. Try again.' }
  }
}

/**
 * @param {Storage} [storage]
 * @returns {{ ok: true, filename: string, rowCount: number } | { ok: false, error: string, empty?: boolean }}
 */
export function exportTransactionsToPdf(storage) {
  const prepared = prepareTransactionExportData(storage)
  if (!prepared.ok) {
    return { ok: false, error: prepared.error }
  }
  if (prepared.rows.length === 0) {
    return {
      ok: false,
      empty: true,
      error: 'There are no transactions to export yet. Add transactions first.',
    }
  }

  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const generatedLabel = new Date(prepared.generatedAt).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    doc.setFontSize(18)
    doc.text('ExpenseSnap — Financial Report', 40, 48)
    doc.setFontSize(10)
    doc.setTextColor(80, 90, 105)
    doc.text(`Generated: ${generatedLabel}`, 40, 66)

    doc.setTextColor(30, 41, 59)
    doc.setFontSize(11)
    doc.text(`Income total: ${prepared.summary.incomeInr}`, 40, 92)
    doc.text(`Expense total: ${prepared.summary.expenseInr}`, 40, 108)
    doc.text(`Net balance: ${prepared.summary.netInr}`, 40, 124)

    autoTable(doc, {
      startY: 140,
      head: [['Date', 'Type', 'Description', 'Category', 'Amount (INR)']],
      body: prepared.rows.map((row) => [
        row.date,
        row.type,
        row.description,
        row.category,
        row.amountInr,
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [16, 40, 56], textColor: 248, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      margin: { left: 40, right: 40 },
      showHead: 'everyPage',
    })

    const filename = `${exportFilenameStem('report', prepared.generatedAt)}.pdf`
    doc.save(filename)
    return { ok: true, filename, rowCount: prepared.rows.length }
  } catch {
    return { ok: false, error: 'Could not create the PDF report. Try again.' }
  }
}
