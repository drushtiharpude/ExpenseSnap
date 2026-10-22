import {
  USERS_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  validateUsernameFormat,
  validatePassword,
  validateRegistration,
  registerLocalDemoUser,
  signInLocalDemoUser,
  signOutLocalDemoUser,
  readLocalDemoSession,
  resolveLocalDemoSessionUser,
  recordLoginName,
} from '../src/auth/localDemoAuth.js'

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

function resetAuthStorage() {
  globalThis.localStorage = memoryStorage()
  globalThis.sessionStorage = memoryStorage()
}

resetAuthStorage()

check('username rejects empty', !validateUsernameFormat('').ok)
check('username rejects short', !validateUsernameFormat('ab').ok)
check('username rejects invalid chars', !validateUsernameFormat('bad name').ok)
check('username accepts valid', validateUsernameFormat('Demo_User.1').ok)
check(
  'username normalizes case',
  validateUsernameFormat('Demo_User.1').username === 'demo_user.1',
)

check('password rejects short', !validatePassword('1234567').ok)
check('password accepts eight chars', validatePassword('12345678').ok)

check(
  'registration rejects mismatch',
  !validateRegistration({
    username: 'demo_user',
    password: 'password1',
    confirmPassword: 'password2',
  }).ok,
)

async function runAsyncChecks() {
  resetAuthStorage()
  const created = await registerLocalDemoUser('demo_user', 'password1', 'password1')
  check('register succeeds', created.ok === true)

  signOutLocalDemoUser()
  const login = await signInLocalDemoUser('DEMO_USER', 'password1')
  check('login case insensitive username', login.ok === true)

  signOutLocalDemoUser()
  const duplicate = await registerLocalDemoUser('Demo_User', 'password1', 'password1')
  check('duplicate username rejected', duplicate.ok === false)

  signOutLocalDemoUser()
  const badLogin = await signInLocalDemoUser('demo_user', 'wrongpass')
  check('wrong password rejected', badLogin.ok === false)

  signOutLocalDemoUser()
  await signInLocalDemoUser('demo_user', 'password1')
  check('session stored', readLocalDemoSession()?.username === 'demo_user')
  check('session resolves user', resolveLocalDemoSessionUser()?.username === 'demo_user')

  const signedIn = resolveLocalDemoSessionUser()
  const { saveDisplayNameForUser } = await import('../src/auth/localDemoAuth.js')
  const profileSave = saveDisplayNameForUser(signedIn.id, 'Sam Taylor')
  check('display name saves for session user', profileSave.ok && profileSave.displayName === 'Sam Taylor')
  check(
    'display name restored on resolve',
    resolveLocalDemoSessionUser()?.displayName === 'Sam Taylor',
  )
  check('display name rejects wrong user id', !saveDisplayNameForUser('missing-user-id', 'Sam').ok)
  check(
    'display name can be cleared',
    saveDisplayNameForUser(signedIn.id, '').ok &&
      resolveLocalDemoSessionUser()?.displayName === '',
  )

  const { saveMottoForUser } = await import('../src/auth/localDemoAuth.js')
  check(
    'motto saves for session user',
    saveMottoForUser(signedIn.id, '  Stay steady  ').ok &&
      resolveLocalDemoSessionUser()?.motto === 'Stay steady',
  )
  check(
    'motto can be cleared',
    saveMottoForUser(signedIn.id, '').ok && resolveLocalDemoSessionUser()?.motto === '',
  )

  const { saveProfilePhotoForUser, readProfilePhotoDataUrl, removeProfilePhotoForUser } =
    await import('../src/auth/profileMediaStore.js')
  const tinyPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+BQwAECzG0AAAAAElFTkSuQmCC'
  check(
    'profile photo saves and reads',
    saveProfilePhotoForUser(signedIn.id, { mime: 'image/png', dataBase64: tinyPng }).ok &&
      readProfilePhotoDataUrl(signedIn.id)?.startsWith('data:image/png;base64,'),
  )
  check(
    'profile photo removes',
    removeProfilePhotoForUser(signedIn.id).ok && readProfilePhotoDataUrl(signedIn.id) === null,
  )

  signOutLocalDemoUser()
  check('logout clears session', readLocalDemoSession() === null)

  resetAuthStorage()
  const legacyPassword = 'legacypass'
  const seed = await registerLocalDemoUser('legacyholder', legacyPassword, legacyPassword)
  check('legacy seed register', seed.ok === true)
  const raw = JSON.parse(globalThis.localStorage.getItem(USERS_STORAGE_KEY))
  const row = raw.users[0]
  raw.users[0] = {
    id: row.id,
    email: 'legacy@example.com',
    salt: row.salt,
    hash: row.hash,
  }
  globalThis.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(raw))
  signOutLocalDemoUser()

  globalThis.sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ userId: row.id, email: 'legacy@example.com' }),
  )
  check(
    'legacy email session resolves',
    resolveLocalDemoSessionUser()?.username === 'legacy@example.com',
  )

  signOutLocalDemoUser()
  const legacyLogin = await signInLocalDemoUser('Legacy@Example.com', legacyPassword)
  check('legacy email account login', legacyLogin.ok === true)

  const migrated = JSON.parse(globalThis.localStorage.getItem(USERS_STORAGE_KEY))
  check(
    'legacy record gains username on read',
    migrated.users.some(
      (user) => user.email === 'legacy@example.com' && user.username === 'legacy@example.com',
    ),
  )
  check(
    'legacy record login name preserved',
    recordLoginName(migrated.users.find((user) => user.email === 'legacy@example.com')) ===
      'legacy@example.com',
  )
}

await runAsyncChecks()

if (process.exitCode) {
  console.error('LOCAL DEMO AUTH CHECKS FAILED')
} else {
  console.log('ALL LOCAL DEMO AUTH CHECKS PASSED')
}
