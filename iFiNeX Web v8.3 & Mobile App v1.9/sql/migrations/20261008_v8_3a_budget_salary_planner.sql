-- ============================================================================
-- iFiNeX v8.3 — BUDGET & SALARY PLANNER (additive; touches no existing table)
-- Tables: bp_income (salary / other income per month), bp_items (budget lines per month), bp_goals (savings goals)
-- Safe to re-run. Access = owner OR owner's delegate OR bill admin (same rule as et_trackers) + registered-users gate.
-- ============================================================================
create table if not exists public.bp_income (
  id bigint generated always as identity primary key,
  user_email text not null,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  source text not null check (length(source) between 1 and 120),
  kind text not null default 'salary' check (kind in ('salary','bonus','allowance','freelance','other')),
  amount numeric(14,2) not null check (amount >= 0),
  pay_date date,
  note text default '' check (length(note) <= 500),
  created_by_email text,
  created_at timestamptz not null default now()
);
create table if not exists public.bp_items (
  id bigint generated always as identity primary key,
  user_email text not null,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  category text not null check (length(category) between 1 and 80),
  bucket text not null default 'needs' check (bucket in ('needs','wants','savings','debt','other')),
  planned numeric(14,2) not null check (planned >= 0),
  note text default '' check (length(note) <= 500),
  created_by_email text,
  created_at timestamptz not null default now()
);
create table if not exists public.bp_goals (
  id bigint generated always as identity primary key,
  user_email text not null,
  name text not null check (length(name) between 1 and 120),
  target numeric(14,2) not null check (target > 0),
  saved numeric(14,2) not null default 0 check (saved >= 0),
  due_date date,
  note text default '' check (length(note) <= 500),
  created_by_email text,
  created_at timestamptz not null default now()
);
create index if not exists bp_income_user_month_idx on public.bp_income (lower(user_email), month);
create unique index if not exists bp_items_unique_line on public.bp_items (lower(user_email), month, lower(category));
create index if not exists bp_goals_user_idx on public.bp_goals (lower(user_email));

alter table public.bp_income enable row level security;
alter table public.bp_items  enable row level security;
alter table public.bp_goals  enable row level security;

do $$ declare t text; begin
  foreach t in array array['bp_income','bp_items','bp_goals'] loop
    execute format('drop policy if exists %I on public.%I', t||'_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (lower(user_email) = (select my_email()) or (select is_delegate_for(%I.user_email)) or (select is_bill_admin())) with check (lower(user_email) = (select my_email()) or (select is_delegate_for(%I.user_email)) or (select is_bill_admin()))', t||'_all', t, t, t);
    execute format('drop policy if exists ifx_registered_gate on public.%I', t);
    execute format('create policy ifx_registered_gate on public.%I as restrictive for all to authenticated using ((select public.is_registered())) with check ((select public.is_registered()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
