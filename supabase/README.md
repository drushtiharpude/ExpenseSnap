# ExpenseSnap Supabase database

This folder contains **SQL migrations only**. They are not applied automatically by the React app.

## Apply migrations (requires your approval)

1. Install [Supabase CLI](https://supabase.com/docs/guides/cli) and link your project, **or** run the SQL file in the Supabase Dashboard → SQL Editor.
2. Apply:

   ```bash
   supabase db push
   ```

   Or paste the contents of `migrations/20260325120000_expensesnap_schema_rls_import.sql` into the SQL editor and execute.

3. Confirm in Dashboard → **Authentication → Providers** that Email is enabled.
4. Set **Site URL** and redirect URLs for your dev/production origins.

## Verify RLS (manual)

Use two test users (A and B). As user A, insert rows via the app import or SQL with `auth.uid()`. As user B, run:

```sql
-- Should return zero rows when executed with user B's JWT (e.g. Supabase client with B's session)
select * from public.transactions;
```

See `tests/rls_isolation.md` for a full checklist.

## Import RPC

- Function: `public.import_user_data(payload jsonb, idempotency_key text)`
- Callable by **authenticated** users only.
- `user_id` on all rows is set from `auth.uid()` inside the function; client payload must not supply tenant IDs.

## Frontend configuration

Set in `.env` (not committed):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (anon/publishable key only)

Never put the service role key in Vite env or client code.
