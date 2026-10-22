# RLS isolation verification checklist

Run after applying `migrations/20260325120000_expensesnap_schema_rls_import.sql`.

## Setup

1. Create two email/password users: **User A** and **User B**.
2. Sign in as **User A** in the app and complete **Import device data to cloud** (with local test data).
3. Sign out. Sign in as **User B**.

## Expected results

| Test | User B |
|------|--------|
| Settings → Cloud migration → cloud counts | All zeros (empty tenant) |
| Supabase client `select` on `transactions` | No rows from User A |
| Attempt to `update` User A's row id if known | 0 rows affected / policy denial |
| `import_user_data` with User B session | Only creates rows for B's `auth.uid()` |

## Idempotency

1. As User A, start import; simulate network failure (offline) if possible.
2. Retry import with same pending idempotency key (app reuses key until success).
3. Confirm no duplicate transactions for the same ids (counts match preview, or `skipped` in RPC result).

## Interrupted migration

1. If import fails (e.g. invalid payload), cloud counts should remain at prior state (transaction rolled back).
2. Local browser financial keys remain unchanged.

## Restoration

1. JSON backup download from Settings still exports local data.
2. Cloud import does not delete or overwrite local `expensesnap.*.v1` keys.
