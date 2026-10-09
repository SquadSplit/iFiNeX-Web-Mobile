-- UPGRADE from v8.2 -> v8.3. NOTE: already applied to the live project (lznnetxeklmdrykxtsbm) on 2026-10-08; safe to re-run.

-- ############################################################################
-- #  iFiNeX Web v8.3 / Mobile App v1.9  — additions (idempotent, safe to re-run)
-- ############################################################################
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

-- ===== v8.3b: background fit (zoom / position) + Trip tracker kind =====
alter table public.bill_user_prefs
  add column if not exists bg_zoom numeric not null default 100,
  add column if not exists bg_x numeric not null default 50,
  add column if not exists bg_y numeric not null default 50;
alter table public.bill_user_prefs drop constraint if exists bill_user_prefs_bg_fit_check;
alter table public.bill_user_prefs add constraint bill_user_prefs_bg_fit_check
  check (bg_zoom between 40 and 400 and bg_x between 0 and 100 and bg_y between 0 and 100);
alter table public.et_trackers drop constraint if exists et_trackers_kind_check;
alter table public.et_trackers add constraint et_trackers_kind_check check (kind in ('period','occasion','trip'));

-- ===== v8.3d/e: bulk import without notification spam =====
create or replace function public.notify_people(p_actor_email text, p_emails text[], p_title text, p_message text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_actor text := lower(coalesce(p_actor_email, ''));
  v_email text;
  v_seen text[] := '{}';
begin
  if coalesce(current_setting('ifinex.bulk', true), '') = '1' then return; end if;
  foreach v_email in array p_emails loop
    v_email := lower(coalesce(v_email, ''));
    if v_email = '' or v_email = v_actor then continue; end if;
    if v_email = any(v_seen) then continue; end if;
    if not exists (
      select 1 from app_users
      where lower(email) = v_email or lower(coalesce(delegate_email,'')) = v_email
    ) then continue; end if;
    insert into bill_notifications (recipient_email, title, message)
    values (v_email, p_title, p_message);
    v_seen := v_seen || v_email;
  end loop;
end;
$function$;

create or replace function public.ifx_bulk_notify(p_owner text, p_n int, p_label text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_actor text := (select my_email());
begin
  if not (lower(p_owner) = v_actor or (select is_delegate_for(p_owner)) or (select is_bill_admin())) then return; end if;
  perform set_config('ifinex.bulk', '0', true);
  perform notify_people(v_actor, array[p_owner, delegate_of(p_owner)], '📥 Bulk import',
    format('%s imported %s %s', coalesce(nullif(v_actor,''),'Someone'), p_n, left(coalesce(p_label,'entries'),60)));
end $function$;
revoke all on function public.ifx_bulk_notify(text, int, text) from public, anon;
grant execute on function public.ifx_bulk_notify(text, int, text) to authenticated;

create or replace function public.ifx_bulk_import(p_kind text, p_owner text, p_rows jsonb)
 returns jsonb language plpgsql security invoker set search_path to 'public' as $function$
declare
  n int := 0; v_actor text := (select my_email());
  v_label text;
begin
  if p_owner is null or length(p_owner) > 200 then raise exception 'bad_owner'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 2000 then raise exception 'bad_rows'; end if;
  perform set_config('ifinex.bulk', '1', true);
  if p_kind = 'bill_expenses' then
    insert into bill_expenses (user_email, description, amount, card_id, category, date, month)
    select p_owner, x.description, x.amount, x.card_id, coalesce(nullif(x.category,''),'other'), x.date, to_char(x.date,'YYYY-MM')
    from jsonb_to_recordset(p_rows) as x(description text, amount numeric, card_id bigint, category text, date date);
    v_label := 'personal spend entries';
  elsif p_kind = 'bill_owed' then
    insert into bill_owed (user_email, amount, month, note)
    select p_owner, x.amount, x.month, coalesce(x.note,'')
    from jsonb_to_recordset(p_rows) as x(amount numeric, month text, note text);
    v_label := 'owed-to-admin entries';
  elsif p_kind = 'bill_payee_entries' then
    insert into bill_payee_entries (user_email, payee_id, amount, entry_type, note, date, month, created_by_email, payment_method, card_id)
    select p_owner, x.payee_id, x.amount, x.entry_type, coalesce(x.note,''), x.date, to_char(x.date,'YYYY-MM'), v_actor, coalesce(nullif(x.payment_method,''),'cash'), x.card_id
    from jsonb_to_recordset(p_rows) as x(payee_id bigint, amount numeric, entry_type text, note text, date date, payment_method text, card_id bigint);
    v_label := 'party-ledger entries';
  else
    raise exception 'unsupported_kind';
  end if;
  get diagnostics n = row_count;
  perform set_config('ifinex.bulk', '0', true);
  perform public.ifx_bulk_notify(p_owner, n, v_label);
  return jsonb_build_object('ok', true, 'inserted', n);
end $function$;
revoke all on function public.ifx_bulk_import(text, text, jsonb) from public, anon;
grant execute on function public.ifx_bulk_import(text, text, jsonb) to authenticated;
