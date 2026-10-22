import './auth.css'

export default function AuthSetupMissing({ missingVars }) {
  const list = Array.isArray(missingVars) ? missingVars : []
  return (
    <div className="auth-page">
      <div className="auth-card settings-panel">
        <div className="section-head">
          <h1 className="section-head__title">Sign-in setup needed</h1>
          <p className="section-head__sub">
            Your expense data on this device is safe. Add Supabase settings below to enable log in
            and create account.
          </p>
        </div>
        <ol className="auth-setup-steps">
          <li>
            Copy <code>.env.example</code> to <code>.env</code> in the project folder.
          </li>
          <li>
            In the Supabase dashboard (Project Settings → API), copy the project URL and the{' '}
            <strong>publishable (anon)</strong> key into <code>.env</code> — not the secret service
            role key.
          </li>
          <li>Restart the dev server (<code>npm run dev</code>).</li>
          <li>Apply the database migration in <code>supabase/migrations/</code> (see Supabase SQL editor or CLI).</li>
        </ol>
        {list.length > 0 && (
          <div className="alert alert--warning" role="alert">
            <p>Missing in <code>.env</code>: {list.join(', ')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
