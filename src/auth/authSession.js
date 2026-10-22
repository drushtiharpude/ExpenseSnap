/** @typedef {{ id: string, username: string, email_confirmed_at?: string }} LocalDemoUser */

/** @param {LocalDemoUser | null | undefined} user */
export function isEmailConfirmed(user) {
  if (!user) return false
  return true
}

/** @typedef {'loading' | 'signed_out' | 'signed_in'} AuthViewState */

/** @param {{ loading: boolean, session: { user: LocalDemoUser } | null }} input */
export function resolveAuthViewState({ loading, session }) {
  if (loading) return 'loading'
  if (!session?.user) return 'signed_out'
  return 'signed_in'
}
