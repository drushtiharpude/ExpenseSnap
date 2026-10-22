import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useFinanceData } from '../finance/FinanceDataProvider.jsx'
import { fetchCloudEntityCounts } from './cloudData.js'
import { migrationCountsTotal } from './migrationCounts.js'
import { getMigrationRecord } from './migrationState.js'
import {
  readLocalMigrationBackup,
  runLocalDeviceCloudImport,
  verifyMigrationAgainstCloud,
} from './runCloudImport.js'
import './MigrationSection.css'

function CountsTable({ title, counts }) {
  if (!counts) return null
  return (
    <div className="migration-counts-block">
      <h3 className="migration-counts-title">{title}</h3>
      <ul className="migration-counts-list">
        <li>Transactions: {counts.transactions}</li>
        <li>Custom categories: {counts.categories}</li>
        <li>Monthly budgets: {counts.budgets}</li>
        <li>Recurring bills: {counts.recurringBills}</li>
        <li>Savings goals: {counts.savingsGoals}</li>
      </ul>
    </div>
  )
}

export default function MigrationSection() {
  const { user, emailConfirmed } = useAuth()
  const userId = user?.id ?? ''
  const { reloadFinanceData } = useFinanceData()

  const [localPreview, setLocalPreview] = useState(null)
  const [cloudCounts, setCloudCounts] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const refreshPreview = useCallback(async () => {
    setLoadError(null)
    const local = readLocalMigrationBackup()
    if (!local.ok) {
      setLocalPreview(null)
      setLoadError(local.errors.join(' '))
    } else {
      setLocalPreview(local)
    }

    const cloud = await fetchCloudEntityCounts()
    if (!cloud.ok) {
      setCloudCounts(null)
      setLoadError((current) => current ?? cloud.error)
    } else {
      setCloudCounts(cloud.counts)
    }
  }, [])

  useEffect(() => {
    refreshPreview()
  }, [refreshPreview])

  const migrationRecord = userId ? getMigrationRecord(userId) : null

  async function handleImport() {
    if (!confirmed) return
    setBusy(true)
    setError(null)
    setMessage(null)
    const result = await runLocalDeviceCloudImport(userId)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(
      result.result?.idempotentReplay
        ? 'Import completed (retried with the same idempotency key; no duplicate rows).'
        : 'Import completed. Review cloud counts below, then verify migration. Local data on this device is unchanged.',
    )
    await refreshPreview()
    await reloadFinanceData()
  }

  async function handleVerify() {
    if (!localPreview?.counts) return
    setBusy(true)
    setError(null)
    setMessage(null)
    const result = await verifyMigrationAgainstCloud(userId, localPreview.counts)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(
      'Migration verified. Cloud profile marked verified; local financial storage is still kept on this device until a later step removes it.',
    )
    await refreshPreview()
    await reloadFinanceData()
  }

  if (!emailConfirmed) {
    return (
      <section className="settings-panel migration-section" aria-labelledby="migration-title">
        <div className="section-head">
          <h2 id="migration-title" className="section-head__title">
            Cloud migration
          </h2>
          <p className="section-head__sub">
            Confirm your email before importing data to your account.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="settings-panel migration-section" aria-labelledby="migration-title">
      <div className="section-head">
        <h2 id="migration-title" className="section-head__title">
          Cloud migration
        </h2>
        <p className="section-head__sub">
          Copy financial data from this browser into your signed-in account. Nothing is uploaded until
          you confirm import. Local storage is not cleared automatically. Database row access is
          enforced by server policies applied in Supabase.
        </p>
      </div>

      {loadError && (
        <div className="form-alert" role="alert">
          <p>{loadError}</p>
        </div>
      )}

      <div className="migration-preview-grid">
        <CountsTable title="On this device (preview)" counts={localPreview?.counts} />
        <CountsTable title="On your account (cloud)" counts={cloudCounts} />
      </div>

      {migrationRecord?.status && (
        <p className="migration-status-line">
          Last migration status: <strong>{migrationRecord.status}</strong>
          {migrationRecord.lastError ? ` — ${migrationRecord.lastError}` : ''}
        </p>
      )}

      {localPreview && migrationCountsTotal(localPreview.counts) > 0 ? (
        <label className="migration-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I want to import the device data shown above into account{' '}
          <strong>{user?.username ?? 'signed in'}</strong>. I understand this does not delete local
          copies on this browser.
        </label>
      ) : (
        <p className="section-head__sub">No local financial records were found to import.</p>
      )}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || !confirmed || !localPreview || localPreview.empty}
          onClick={handleImport}
        >
          {busy ? 'Working…' : 'Import device data to cloud'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !localPreview?.counts}
          onClick={handleVerify}
        >
          Verify migration
        </button>
        <button type="button" className="btn" disabled={busy} onClick={refreshPreview}>
          Refresh preview
        </button>
      </div>

      {error && (
        <div className="form-alert" role="alert">
          <p>{error}</p>
        </div>
      )}
      {message && (
        <div className="alert alert--success" role="status">
          <p>{message}</p>
        </div>
      )}
    </section>
  )
}
