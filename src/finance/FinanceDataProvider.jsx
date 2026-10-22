import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { hydrateFinanceCacheFromCloud } from '../data/cloudFinanceStore.js'
import { getFinanceSession, resetFinanceSession, setFinanceSession } from '../data/financeSession.js'
import { getSupabaseClient } from '../lib/supabaseClient.js'
import { getMigrationRecord } from '../migration/migrationState.js'
import { applyTheme, saveTheme } from '../settings/themeStore.js'
import './financeData.css'

const FinanceDataContext = createContext(null)

async function shouldUseCloudForUser(userId) {
  const localRecord = getMigrationRecord(userId)
  if (localRecord?.status === 'verified' || localRecord?.status === 'import_complete') {
    const client = getSupabaseClient()
    if (!client) return false
    const { data, error } = await client
      .from('profiles')
      .select('sync_enabled, migration_status')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) {
      return (
        localRecord?.status === 'verified' || localRecord?.status === 'import_complete'
      )
    }
    return (
      data.sync_enabled === true ||
      data.migration_status === 'verified' ||
      data.migration_status === 'import_complete'
    )
  }
  return false
}

async function loadCloudTheme(userId) {
  const client = getSupabaseClient()
  if (!client) return
  const { data } = await client
    .from('user_preferences')
    .select('theme')
    .eq('user_id', userId)
    .maybeSingle()
  if (data?.theme === 'light' || data?.theme === 'dark') {
    applyTheme(data.theme)
    saveTheme(data.theme)
  }
}

export function FinanceDataProvider({ children }) {
  const { user, session } = useAuth()
  const userId = user?.id ?? null
  const [status, setStatus] = useState('loading')
  const [mode, setMode] = useState('local')
  const [error, setError] = useState(null)
  const [dataRevision, setDataRevision] = useState(0)
  const loadSeqRef = useRef(0)

  const reloadAfterLocalRestore = useCallback(() => {
    if (!userId) return
    resetFinanceSession()
    setFinanceSession({
      userId,
      mode: 'local',
      status: 'ready',
      ready: true,
      cache: null,
    })
    setMode('local')
    setStatus('ready')
    setError(null)
    setDataRevision((value) => value + 1)
  }, [userId])

  const reloadFinanceData = useCallback(async () => {
    const loadSeq = ++loadSeqRef.current

    if (!userId || !session) {
      resetFinanceSession()
      setStatus('idle')
      setMode('local')
      setError(null)
      return
    }

    resetFinanceSession()
    setFinanceSession({ userId, status: 'loading', ready: false, mode: 'local' })
    setStatus('loading')
    setError(null)
    const useCloud = await shouldUseCloudForUser(userId)
    if (loadSeq !== loadSeqRef.current) return
    if (!useCloud) {
      setFinanceSession({
        userId,
        mode: 'local',
        status: 'ready',
        ready: true,
        cache: null,
      })
      setMode('local')
      setStatus('ready')
      setDataRevision((value) => value + 1)
      return
    }

    const hydrated = await hydrateFinanceCacheFromCloud(userId, () => loadSeq !== loadSeqRef.current)
    if (loadSeq !== loadSeqRef.current || hydrated.aborted) return
    if (!hydrated.ok) {
      setFinanceSession({
        userId,
        mode: 'cloud',
        status: hydrated.offline ? 'offline' : 'error',
        ready: false,
        error: hydrated.error,
      })
      setMode('cloud')
      setStatus(hydrated.offline ? 'offline' : 'error')
      setError(hydrated.error ?? 'Could not load account data.')
      return
    }

    await loadCloudTheme(userId)
    if (loadSeq !== loadSeqRef.current) return
    setMode('cloud')
    setStatus('ready')
    setDataRevision((value) => value + 1)
  }, [session, userId])

  useEffect(() => {
    reloadFinanceData()
    return () => {
      resetFinanceSession()
    }
  }, [reloadFinanceData])

  const value = useMemo(
    () => ({
      status,
      mode,
      error,
      ready: status === 'ready',
      dataRevision,
      reloadFinanceData,
      reloadAfterLocalRestore,
    }),
    [status, mode, error, dataRevision, reloadFinanceData, reloadAfterLocalRestore],
  )

  return <FinanceDataContext.Provider value={value}>{children}</FinanceDataContext.Provider>
}

export function useFinanceData() {
  const context = useContext(FinanceDataContext)
  if (!context) {
    throw new Error('useFinanceData must be used within FinanceDataProvider')
  }
  return context
}

export function FinanceDataGate({ children }) {
  const { status, error, reloadFinanceData } = useFinanceData()
  const syncError = getFinanceSession().syncError

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="finance-data-gate" role="status" aria-live="polite">
        <p>Loading your account data…</p>
      </div>
    )
  }

  if (status === 'offline') {
    return (
      <div className="finance-data-gate finance-data-gate--error" role="alert">
        <p>You appear to be offline. Account data was not loaded to avoid showing stale information.</p>
        <button type="button" className="btn btn--primary" onClick={reloadFinanceData}>
          Retry
        </button>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="finance-data-gate finance-data-gate--error" role="alert">
        <p>{error ?? 'Could not load account data.'}</p>
        <button type="button" className="btn btn--primary" onClick={reloadFinanceData}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      {syncError ? (
        <div className="alert alert--warning finance-sync-alert" role="status">
          <p>Cloud save issue: {syncError}. Your last change is kept in memory; retry or reload after reconnecting.</p>
        </div>
      ) : null}
      {children}
    </>
  )
}
