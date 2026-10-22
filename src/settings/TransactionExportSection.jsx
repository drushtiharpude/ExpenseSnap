import { useState } from 'react'
import {
  exportTransactionsToExcel,
  exportTransactionsToPdf,
} from './transactionExportFiles.js'
import './TransactionExportSection.css'

function ExportIcon({ name }) {
  if (name === 'excel') {
    return (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M8 13h5M8 17h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

export default function TransactionExportSection() {
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  function handleExcelExport() {
    setError(null)
    setMessage(null)
    setBusy('excel')
    const result = exportTransactionsToExcel()
    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(
      `Excel file downloaded (${result.rowCount} transaction${result.rowCount === 1 ? '' : 's'}).`,
    )
  }

  function handlePdfExport() {
    setError(null)
    setMessage(null)
    setBusy('pdf')
    const result = exportTransactionsToPdf()
    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(
      `PDF report downloaded (${result.rowCount} transaction${result.rowCount === 1 ? '' : 's'}).`,
    )
  }

  return (
    <section className="transaction-export settings-panel" aria-labelledby="transaction-export-title">
      <header className="section-head section-head--in-panel">
        <h2 id="transaction-export-title" className="section-head__title">
          Export transactions
        </h2>
        <p className="section-head__sub">
          Download your saved transactions as a spreadsheet or printable report. Files are created on
          this device and are not uploaded anywhere.
        </p>
      </header>

      <div className="transaction-export-actions">
        <button
          type="button"
          className="btn btn--primary transaction-export-btn"
          onClick={handleExcelExport}
          disabled={busy !== null}
          aria-label="Export to Excel"
        >
          <span className="transaction-export-btn__icon">
            <ExportIcon name="excel" />
          </span>
          {busy === 'excel' ? 'Preparing Excel…' : 'Export to Excel'}
        </button>
        <button
          type="button"
          className="btn transaction-export-btn"
          onClick={handlePdfExport}
          disabled={busy !== null}
          aria-label="Export to PDF"
        >
          <span className="transaction-export-btn__icon">
            <ExportIcon name="pdf" />
          </span>
          {busy === 'pdf' ? 'Preparing PDF…' : 'Export to PDF'}
        </button>
      </div>

      <p className="transaction-export-note" role="note">
        Both exports include date, type, description, category, and amount in INR, plus income,
        expense, and net totals on the PDF report.
      </p>

      {message ? (
        <div className="transaction-export-alert transaction-export-alert--success" role="status">
          <p>{message}</p>
        </div>
      ) : null}
      {error ? (
        <div className="transaction-export-alert" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
    </section>
  )
}
