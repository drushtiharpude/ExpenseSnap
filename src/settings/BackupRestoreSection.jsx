import { useRef, useState } from 'react'
import {
  applyBackupRestore,
  backupFilename,
  getBackupRestoreStorageState,
  parseBackupJson,
  readBackupForExport,
} from '../data/backup.js'
import './BackupRestoreSection.css'

function storageErrorMessage(result, noun) {
  if (result.error === 'unavailable') {
    return `Browser storage is unavailable. Existing ${noun} were left unchanged.`
  }
  if (result.error === 'malformed') {
    const detail = Array.isArray(result.errors) ? ` ${result.errors.join(' ')}` : ''
    return `Saved ${noun} could not be read. They were left unchanged.${detail}`
  }
  if (result.error === 'quota') return 'Browser storage is full. This change was not saved.'
  if (result.error === 'invalid' && Array.isArray(result.errors)) return result.errors.join(' ')
  return `This change could not be saved. Existing ${noun} were left unchanged.`
}

function formatSuccessSummary(summary) {
  if (summary.mode === 'replace') {
    const recoveryPrefix = summary.recoveredFromMalformedStorage
      ? 'Recovery replace complete: unreadable local data was overwritten. '
      : ''
    return `${recoveryPrefix}Restore complete: ${summary.transactionsRestored} transaction${
      summary.transactionsRestored === 1 ? '' : 's'
    } and ${summary.categoriesRestored} custom categor${
      summary.categoriesRestored === 1 ? 'y' : 'ies'
    } replaced saved data.`
  }
  return `Merge complete: added ${summary.transactionsAdded} transaction${
    summary.transactionsAdded === 1 ? '' : 's'
  } and ${summary.categoriesAdded} custom categor${
    summary.categoriesAdded === 1 ? 'y' : 'ies'
  }. Kept ${summary.transactionsKept} matching transaction${
    summary.transactionsKept === 1 ? '' : 's'
  } and ${summary.categoriesKept} matching categor${
    summary.categoriesKept === 1 ? 'y' : 'ies'
  } unchanged.`
}

function BackupRestoreSection({ onRestored }) {
  const [backupMessage, setBackupMessage] = useState(null)
  const [backupError, setBackupError] = useState(null)
  const [restoreMode, setRestoreMode] = useState('merge')
  const [restoreErrors, setRestoreErrors] = useState([])
  const [restoreSuccess, setRestoreSuccess] = useState(null)
  const [pendingReplace, setPendingReplace] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [parsedBackup, setParsedBackup] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const fileInputRef = useRef(null)
  const restoreStorageState = getBackupRestoreStorageState()

  function finish() {
    submittingRef.current = false
    setSubmitting(false)
  }

  function handleDownloadBackup() {
    setBackupError(null)
    setBackupMessage(null)
    const result = readBackupForExport()
    if (!result.ok) {
      if (result.error === 'malformed') {
        setBackupError(storageErrorMessage(result, 'data'))
        return
      }
      setBackupError(storageErrorMessage(result, 'data'))
      return
    }
    const json = JSON.stringify(result.document, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = backupFilename(result.document.exportedAt)
    link.click()
    URL.revokeObjectURL(url)
    setBackupMessage(
      result.empty
        ? 'Downloaded a backup with no saved transactions or custom categories.'
        : `Downloaded a backup with ${result.document.transactions.length} transaction${
            result.document.transactions.length === 1 ? '' : 's'
          } and ${result.document.categories.length} custom categor${
            result.document.categories.length === 1 ? 'y' : 'ies'
          }.`,
    )
  }

  function handleFileChange(event) {
    setRestoreErrors([])
    setRestoreSuccess(null)
    setPendingReplace(false)
    const file = event.target.files?.[0]
    if (!file) {
      setSelectedFileName('')
      setParsedBackup(null)
      return
    }
    setSelectedFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseBackupJson(typeof reader.result === 'string' ? reader.result : '')
      if (!parsed.ok) {
        setParsedBackup(null)
        setRestoreErrors(parsed.errors)
        return
      }
      setParsedBackup(parsed.backup)
      setRestoreErrors([])
    }
    reader.onerror = () => {
      setParsedBackup(null)
      setRestoreErrors(['The backup file could not be read.'])
    }
    reader.readAsText(file)
  }

  function resetFileInput() {
    setSelectedFileName('')
    setParsedBackup(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function runRestore(mode) {
    if (submittingRef.current || !parsedBackup) return
    submittingRef.current = true
    setSubmitting(true)
    setRestoreErrors([])
    setRestoreSuccess(null)

    const result = applyBackupRestore(mode, parsedBackup)
    if (!result.ok) {
      setRestoreErrors(result.errors ?? ['Restore did not complete.'])
      setPendingReplace(false)
      finish()
      return
    }

    setRestoreSuccess(formatSuccessSummary(result.summary))
    setPendingReplace(false)
    resetFileInput()
    onRestored?.({
      transactions: result.transactions,
      categories: result.categories,
    })
    finish()
  }

  function handleRestoreSubmit(event) {
    event.preventDefault()
    if (!parsedBackup) {
      setRestoreErrors(['Choose a valid backup file first.'])
      return
    }
    if (restoreMode === 'replace') {
      if (!pendingReplace) {
        setPendingReplace(true)
        setRestoreErrors([])
        return
      }
      runRestore('replace')
      return
    }
    runRestore('merge')
  }

  return (
    <section className="backup-restore settings-panel" aria-labelledby="backup-restore-title">
      <h2 id="backup-restore-title">Backup and restore</h2>
      <p>
        Download a JSON copy of your saved transactions and custom categories, or restore one on
        this device. Backups stay on your computer and are not uploaded.
      </p>

      <div className="backup-block backup-block--export">
        <h3 className="backup-block-title">Download backup</h3>
        <p>Includes every saved transaction, every custom category, a format version, and export time.</p>
        <button type="button" className="btn btn--primary" onClick={handleDownloadBackup}>
          Download JSON backup
        </button>
        {backupMessage && (
          <div className="backup-alert backup-alert-success" role="status">
            <p>{backupMessage}</p>
          </div>
        )}
        {backupError && (
          <div className="backup-alert" role="alert">
            <p>{backupError}</p>
          </div>
        )}
      </div>

      <form className="backup-block backup-block--restore" onSubmit={handleRestoreSubmit}>
        <h3 className="backup-block-title">Restore from backup</h3>
        <label className="backup-file-label">
          Backup file
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
          />
        </label>
        {selectedFileName && <p className="backup-file-name">Selected: {selectedFileName}</p>}

        <fieldset>
          <legend>Restore mode</legend>
          <label>
            <input
              type="radio"
              name="restore-mode"
              value="merge"
              checked={restoreMode === 'merge'}
              onChange={() => {
                setRestoreMode('merge')
                setPendingReplace(false)
              }}
            />
            Merge with existing data
          </label>
          <label>
            <input
              type="radio"
              name="restore-mode"
              value="replace"
              checked={restoreMode === 'replace'}
              onChange={() => {
                setRestoreMode('replace')
                setPendingReplace(false)
              }}
            />
            Replace existing data
          </label>
        </fieldset>

        {restoreMode === 'merge' ? (
          <p className="backup-note">
            Merge adds new records by id. Matching ids must be identical; conflicting ids are
            rejected without changing saved data.
            {!restoreStorageState.mergeAllowed && restoreStorageState.recoveryReplaceNeeded && (
              <>
                {' '}
                Merge is not available while saved transactions or custom categories cannot be read.
                Use Replace with a valid backup to recover.
              </>
            )}
          </p>
        ) : (
          <p className="backup-note">
            Replace removes all saved transactions and custom categories before restoring the
            backup. Built-in categories are unchanged.
          </p>
        )}

        {pendingReplace && restoreMode === 'replace' && restoreStorageState.recoveryReplaceNeeded && (
          <div className="backup-alert alert--warning" role="alert">
            <p>
              Saved transactions or custom categories in this browser could not be read. If you
              continue, that unreadable local data will be overwritten by this backup.
            </p>
          </div>
        )}

        {pendingReplace && restoreMode === 'replace' && (
          <div className="backup-alert alert--warning" role="alert">
            <p>Replace all saved transactions and custom categories with this backup?</p>
            <div className="backup-confirm-actions">
              <button type="submit" className="btn btn--primary" disabled={submitting || !parsedBackup}>
                Yes, replace saved data
              </button>
              <button
                type="button"
                className="btn"
                disabled={submitting}
                onClick={() => setPendingReplace(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {restoreErrors.length > 0 && (
          <div className="backup-alert" role="alert">
            {restoreErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}

        {restoreSuccess && (
          <div className="backup-alert backup-alert-success" role="status">
            <p>{restoreSuccess}</p>
          </div>
        )}

        {!pendingReplace && (
          <button type="submit" className="btn btn--primary" disabled={submitting || !parsedBackup}>
            {restoreMode === 'replace' ? 'Continue to replace' : 'Restore backup'}
          </button>
        )}
      </form>
    </section>
  )
}

export default BackupRestoreSection
