-- ExpenseSnap: per-user financial schema, RLS, and import RPC.
-- Apply manually via Supabase CLI or Dashboard (do not run from the frontend).

-- ---------------------------------------------------------------------------
-- Profiles & preferences
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  migration_status text not null default 'none'
    check (
      migration_status in (
        'none',
        'previewed',
        'importing',
        'import_failed',
        'import_complete',
        'verified'
      )
    ),
  last_import_at timestamptz,
  last_import_source text,
  sync_enabled boolean not null default false
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Financial entities (tenant column: user_id; never trust client-supplied user_id)
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  type text not null check (type in ('income', 'expense')),
  name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create index if not exists categories_user_id_idx on public.categories (user_id);

create table if not exists public.transactions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  type text not null check (type in ('income', 'expense')),
  amount_paise bigint not null check (amount_paise > 0),
  date date not null,
  category_id text not null,
  description text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create index if not exists transactions_user_id_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_user_id_updated_idx on public.transactions (user_id, updated_at desc);

create table if not exists public.budgets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  month text not null,
  category_id text not null,
  limit_paise bigint not null check (limit_paise > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id),
  unique (user_id, month, category_id)
);

create index if not exists budgets_user_id_month_idx on public.budgets (user_id, month);

create table if not exists public.recurring_bills (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  title text not null,
  amount_paise bigint not null check (amount_paise > 0),
  category_id text not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  next_due_date date not null,
  status text not null check (status in ('active', 'paused')),
  last_paid_due_date date,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create index if not exists recurring_bills_user_id_idx on public.recurring_bills (user_id);

create table if not exists public.savings_goals (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  name text not null,
  target_paise bigint not null check (target_paise > 0),
  target_date date,
  notes text,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create index if not exists savings_goals_user_id_idx on public.savings_goals (user_id);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  status text not null check (status in ('pending', 'running', 'succeeded', 'failed', 'rolled_back')),
  source text not null,
  counts jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists import_jobs_user_id_created_idx on public.import_jobs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Signup hook
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_bills enable row level security;
alter table public.savings_goals enable row level security;
alter table public.import_jobs enable row level security;

create policy profiles_select_own on public.profiles
  for select using (auth.uid() = user_id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy user_preferences_select_own on public.user_preferences
  for select using (auth.uid() = user_id);
create policy user_preferences_insert_own on public.user_preferences
  for insert with check (auth.uid() = user_id);
create policy user_preferences_update_own on public.user_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy categories_select_own on public.categories
  for select using (auth.uid() = user_id);
create policy categories_insert_own on public.categories
  for insert with check (auth.uid() = user_id);
create policy categories_update_own on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy categories_delete_own on public.categories
  for delete using (auth.uid() = user_id);

create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);
create policy transactions_insert_own on public.transactions
  for insert with check (auth.uid() = user_id);
create policy transactions_update_own on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_delete_own on public.transactions
  for delete using (auth.uid() = user_id);

create policy budgets_select_own on public.budgets
  for select using (auth.uid() = user_id);
create policy budgets_insert_own on public.budgets
  for insert with check (auth.uid() = user_id);
create policy budgets_update_own on public.budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy budgets_delete_own on public.budgets
  for delete using (auth.uid() = user_id);

create policy recurring_bills_select_own on public.recurring_bills
  for select using (auth.uid() = user_id);
create policy recurring_bills_insert_own on public.recurring_bills
  for insert with check (auth.uid() = user_id);
create policy recurring_bills_update_own on public.recurring_bills
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy recurring_bills_delete_own on public.recurring_bills
  for delete using (auth.uid() = user_id);

create policy savings_goals_select_own on public.savings_goals
  for select using (auth.uid() = user_id);
create policy savings_goals_insert_own on public.savings_goals
  for insert with check (auth.uid() = user_id);
create policy savings_goals_update_own on public.savings_goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy savings_goals_delete_own on public.savings_goals
  for delete using (auth.uid() = user_id);

create policy import_jobs_select_own on public.import_jobs
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Import RPC (SECURITY DEFINER: sets user_id from auth.uid() only)
-- ---------------------------------------------------------------------------

create or replace function public.import_user_data(payload jsonb, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing_job public.import_jobs%rowtype;
  job_id uuid;
  v_version int;
  cat jsonb;
  row jsonb;
  ins_categories int := 0;
  ins_budgets int := 0;
  ins_recurring int := 0;
  ins_savings int := 0;
  ins_transactions int := 0;
  skip_categories int := 0;
  skip_budgets int := 0;
  skip_recurring int := 0;
  skip_savings int := 0;
  skip_transactions int := 0;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if idempotency_key is null or length(trim(idempotency_key)) < 8 then
    raise exception 'invalid_idempotency_key';
  end if;

  select * into existing_job
  from public.import_jobs
  where user_id = uid and import_jobs.idempotency_key = import_user_data.idempotency_key;

  if found and existing_job.status = 'succeeded' then
    return jsonb_build_object(
      'ok', true,
      'idempotentReplay', true,
      'jobId', existing_job.id,
      'counts', existing_job.counts
    );
  end if;

  if found and existing_job.status = 'running' then
    raise exception 'import_in_progress';
  end if;

  if found and existing_job.status = 'failed' then
    delete from public.import_jobs where id = existing_job.id;
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  v_version := (payload ->> 'backupVersion')::int;
  if v_version is null or v_version < 1 or v_version > 4 then
    raise exception 'unsupported_backup_version';
  end if;

  insert into public.import_jobs (user_id, idempotency_key, status, source)
  values (
    uid,
    import_user_data.idempotency_key,
    'running',
    coalesce(payload ->> 'importSource', 'local_device')
  )
  returning id into job_id;

  begin
    -- Categories
    for cat in select * from jsonb_array_elements(coalesce(payload -> 'categories', '[]'::jsonb))
    loop
      begin
        insert into public.categories (user_id, id, type, name, created_at, updated_at)
        values (
          uid,
          (cat ->> 'id')::uuid,
          cat ->> 'type',
          cat ->> 'name',
          (cat ->> 'createdAt')::timestamptz,
          (cat ->> 'updatedAt')::timestamptz
        );
        ins_categories := ins_categories + 1;
      exception
        when unique_violation then
          if exists (
            select 1 from public.categories c
            where c.user_id = uid
              and c.id = (cat ->> 'id')::uuid
              and c.type = cat ->> 'type'
              and c.name = cat ->> 'name'
              and c.created_at = (cat ->> 'createdAt')::timestamptz
              and c.updated_at = (cat ->> 'updatedAt')::timestamptz
          ) then
            skip_categories := skip_categories + 1;
          else
            raise exception 'category_id_conflict';
          end if;
      end;
    end loop;

    -- Budgets (v2+)
    if v_version >= 2 then
      for row in select * from jsonb_array_elements(coalesce(payload -> 'budgets', '[]'::jsonb))
      loop
        begin
          insert into public.budgets (user_id, id, month, category_id, limit_paise, created_at, updated_at)
          values (
            uid,
            (row ->> 'id')::uuid,
            row ->> 'month',
            row ->> 'categoryId',
            (row ->> 'limitPaise')::bigint,
            (row ->> 'createdAt')::timestamptz,
            (row ->> 'updatedAt')::timestamptz
          );
          ins_budgets := ins_budgets + 1;
        exception
          when unique_violation then
            raise exception 'budget_id_or_month_conflict';
        end;
      end loop;
    end if;

    -- Recurring bills (v3+)
    if v_version >= 3 then
      for row in select * from jsonb_array_elements(coalesce(payload -> 'recurringBills', '[]'::jsonb))
      loop
        begin
          insert into public.recurring_bills (
            user_id, id, title, amount_paise, category_id, frequency,
            next_due_date, status, last_paid_due_date, created_at, updated_at
          )
          values (
            uid,
            (row ->> 'id')::uuid,
            row ->> 'title',
            (row ->> 'amountPaise')::bigint,
            row ->> 'categoryId',
            row ->> 'frequency',
            (row ->> 'nextDueDate')::date,
            row ->> 'status',
            nullif(row ->> 'lastPaidDueDate', '')::date,
            (row ->> 'createdAt')::timestamptz,
            (row ->> 'updatedAt')::timestamptz
          );
          ins_recurring := ins_recurring + 1;
        exception
          when unique_violation then
            raise exception 'recurring_bill_id_conflict';
        end;
      end loop;
    end if;

    -- Savings goals (v4)
    if v_version >= 4 then
      for row in select * from jsonb_array_elements(coalesce(payload -> 'savingsGoals', '[]'::jsonb))
      loop
        begin
          insert into public.savings_goals (
            user_id, id, name, target_paise, target_date, notes, entries, created_at, updated_at
          )
          values (
            uid,
            (row ->> 'id')::uuid,
            row ->> 'name',
            (row ->> 'targetPaise')::bigint,
            nullif(row ->> 'targetDate', '')::date,
            nullif(row ->> 'notes', ''),
            coalesce(row -> 'entries', '[]'::jsonb),
            (row ->> 'createdAt')::timestamptz,
            (row ->> 'updatedAt')::timestamptz
          );
          ins_savings := ins_savings + 1;
        exception
          when unique_violation then
            raise exception 'savings_goal_id_conflict';
        end;
      end loop;
    end if;

    -- Transactions (after categories)
    for row in select * from jsonb_array_elements(coalesce(payload -> 'transactions', '[]'::jsonb))
    loop
      begin
        insert into public.transactions (
          user_id, id, type, amount_paise, date, category_id, description, created_at, updated_at
        )
        values (
          uid,
          (row ->> 'id')::uuid,
          row ->> 'type',
          (row ->> 'amountPaise')::bigint,
          (row ->> 'date')::date,
          row ->> 'categoryId',
          coalesce(row ->> 'description', ''),
          (row ->> 'createdAt')::timestamptz,
          (row ->> 'updatedAt')::timestamptz
        );
        ins_transactions := ins_transactions + 1;
      exception
        when unique_violation then
          if exists (
            select 1 from public.transactions t
            where t.user_id = uid
              and t.id = (row ->> 'id')::uuid
              and t.type = row ->> 'type'
              and t.amount_paise = (row ->> 'amountPaise')::bigint
              and t.date = (row ->> 'date')::date
              and t.category_id = row ->> 'categoryId'
              and t.description = coalesce(row ->> 'description', '')
          ) then
            skip_transactions := skip_transactions + 1;
          else
            raise exception 'transaction_id_conflict';
          end if;
      end;
    end loop;

    update public.import_jobs
    set
      status = 'succeeded',
      finished_at = now(),
      counts = jsonb_build_object(
        'categories', jsonb_build_object('inserted', ins_categories, 'skipped', skip_categories),
        'budgets', jsonb_build_object('inserted', ins_budgets, 'skipped', skip_budgets),
        'recurringBills', jsonb_build_object('inserted', ins_recurring, 'skipped', skip_recurring),
        'savingsGoals', jsonb_build_object('inserted', ins_savings, 'skipped', skip_savings),
        'transactions', jsonb_build_object('inserted', ins_transactions, 'skipped', skip_transactions)
      )
    where id = job_id;

    update public.profiles
    set
      migration_status = 'import_complete',
      last_import_at = now(),
      last_import_source = coalesce(payload ->> 'importSource', 'local_device'),
      updated_at = now()
    where user_id = uid;

    return jsonb_build_object(
      'ok', true,
      'idempotentReplay', false,
      'jobId', job_id,
      'counts', (select counts from public.import_jobs where id = job_id)
    );
  exception
    when others then
      update public.import_jobs
      set
        status = 'failed',
        finished_at = now(),
        error_summary = sqlerrm
      where id = job_id;

      update public.profiles
      set migration_status = 'import_failed', updated_at = now()
      where user_id = uid;

      raise;
  end;
end;
$$;

revoke all on function public.import_user_data(jsonb, text) from public;
grant execute on function public.import_user_data(jsonb, text) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;
grant select, insert, update, delete on public.recurring_bills to authenticated;
grant select, insert, update, delete on public.savings_goals to authenticated;
grant select on public.import_jobs to authenticated;
