/** Map Supabase auth errors to safe user-facing copy (no tokens or secrets). */
export function authErrorMessage(error) {
  if (!error) return 'Something went wrong. Try again.'
  const message = typeof error.message === 'string' ? error.message : ''
  const code = typeof error.code === 'string' ? error.code : ''
  const lower = message.toLowerCase()

  if (code === 'invalid_credentials' || lower.includes('invalid login credentials')) {
    return 'Email or password is incorrect.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirm your email address before signing in.'
  }
  if (lower.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in.'
  }
  if (lower.includes('password') && lower.includes('least')) {
    return 'Choose a stronger password (see Supabase project password rules).'
  }
  if (lower.includes('rate limit') || code === 'over_request_rate_limit') {
    return 'Too many attempts. Wait a moment and try again.'
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Could not reach the authentication service. Check your connection and try again.'
  }
  if (message !== '') return message
  return 'Something went wrong. Try again.'
}
