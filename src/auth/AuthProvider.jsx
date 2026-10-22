import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { resetFinanceSession } from '../data/financeSession.js'
import { isSupabaseConfigured } from '../lib/supabaseConfig.js'
import { isEmailConfirmed, resolveAuthViewState } from './authSession.js'
import {
  registerLocalDemoUser,
  resolveLocalDemoSessionUser,
  saveDisplayNameForUser,
  saveMottoForUser,
  signInLocalDemoUser,
  signOutLocalDemoUser,
  validateRegistration,
} from './localDemoAuth.js'
import {
  readProfilePhotoDataUrl,
  removeProfilePhotoForUser,
  saveProfilePhotoForUser,
} from './profileMediaStore.js'
import { prepareProfilePhotoFromFile } from './profilePhotoProcess.js'

const AuthContext = createContext(null)

function buildSession(user) {
  if (!user) return null
  const profilePhotoUrl = readProfilePhotoDataUrl(user.id)
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? '',
      motto: user.motto ?? '',
      createdAt: user.createdAt ?? '',
      profilePhotoUrl,
      email_confirmed_at: new Date(0).toISOString(),
    },
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionPending, setActionPending] = useState(false)

  useEffect(() => {
    const user = resolveLocalDemoSessionUser()
    setSession(buildSession(user))
    setLoading(false)
  }, [])

  const signUp = useCallback(async (username, password, confirmPassword) => {
    const validation = validateRegistration({ username, password, confirmPassword })
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }
    setActionPending(true)
    try {
      const result = await registerLocalDemoUser(username, password, confirmPassword)
      if (!result.ok) return result
      setSession(buildSession(result.user))
      return { ok: true, needsEmailConfirmation: false }
    } finally {
      setActionPending(false)
    }
  }, [])

  const signIn = useCallback(async (username, password) => {
    setActionPending(true)
    try {
      const result = await signInLocalDemoUser(username, password)
      if (!result.ok) return result
      setSession(buildSession(result.user))
      return { ok: true }
    } finally {
      setActionPending(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    setActionPending(true)
    try {
      resetFinanceSession()
      const result = signOutLocalDemoUser()
      if (!result.ok) return result
      setSession(null)
      return { ok: true }
    } finally {
      setActionPending(false)
    }
  }, [])

  const resendConfirmationEmail = useCallback(async () => {
    return { ok: false, error: 'Email confirmation is not used in local demo mode.' }
  }, [])

  const updateDisplayName = useCallback(async (displayName) => {
    const userId = session?.user?.id
    if (!userId) {
      return { ok: false, error: 'You must be signed in to save profile changes.' }
    }
    setActionPending(true)
    try {
      const result = saveDisplayNameForUser(userId, displayName)
      if (!result.ok) return result
      setSession(buildSession(result.user))
      return { ok: true, displayName: result.displayName }
    } finally {
      setActionPending(false)
    }
  }, [session?.user?.id])

  const updateMotto = useCallback(async (motto) => {
    const userId = session?.user?.id
    if (!userId) {
      return { ok: false, error: 'You must be signed in to save profile changes.' }
    }
    setActionPending(true)
    try {
      const result = saveMottoForUser(userId, motto)
      if (!result.ok) return result
      setSession(buildSession(result.user))
      return { ok: true, motto: result.motto }
    } finally {
      setActionPending(false)
    }
  }, [session?.user?.id])

  const uploadProfilePhoto = useCallback(async (file) => {
    const userId = session?.user?.id
    if (!userId) {
      return { ok: false, error: 'You must be signed in to save a photo.' }
    }
    setActionPending(true)
    try {
      const prepared = await prepareProfilePhotoFromFile(file)
      if (!prepared.ok) {
        return { ok: false, error: prepared.message }
      }
      const saved = saveProfilePhotoForUser(userId, {
        mime: prepared.mime,
        dataBase64: prepared.dataBase64,
      })
      if (!saved.ok) {
        return { ok: false, error: saved.message ?? 'Photo could not be saved.' }
      }
      setSession((current) => {
        if (!current?.user) return current
        return {
          user: {
            ...current.user,
            profilePhotoUrl: saved.dataUrl ?? readProfilePhotoDataUrl(userId),
          },
        }
      })
      return { ok: true }
    } finally {
      setActionPending(false)
    }
  }, [session?.user?.id])

  const removeProfilePhoto = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) {
      return { ok: false, error: 'You must be signed in to remove a photo.' }
    }
    setActionPending(true)
    try {
      const result = removeProfilePhotoForUser(userId)
      if (!result.ok) {
        return { ok: false, error: result.message ?? 'Photo could not be removed.' }
      }
      setSession((current) => {
        if (!current?.user) return current
        return { user: { ...current.user, profilePhotoUrl: null } }
      })
      return { ok: true }
    } finally {
      setActionPending(false)
    }
  }, [session?.user?.id])

  const viewState = resolveAuthViewState({ loading, session })
  const user = session?.user ?? null
  const cloudConfigured = isSupabaseConfigured()

  const value = useMemo(
    () => ({
      isLocalDemoAuth: true,
      cloudConfigured,
      configured: cloudConfigured,
      loading,
      viewState,
      session,
      user,
      username: user?.username ?? '',
      emailConfirmed: isEmailConfirmed(user),
      actionPending,
      signUp,
      signIn,
      signOut,
      resendConfirmationEmail,
      updateDisplayName,
      updateMotto,
      uploadProfilePhoto,
      removeProfilePhoto,
    }),
    [
      cloudConfigured,
      loading,
      viewState,
      session,
      user,
      actionPending,
      signUp,
      signIn,
      signOut,
      resendConfirmationEmail,
      updateDisplayName,
      updateMotto,
      uploadProfilePhoto,
      removeProfilePhoto,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
