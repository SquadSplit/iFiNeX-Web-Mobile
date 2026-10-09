-- iFiNeX UPGRADE to v8.1 — run ONCE in Supabase SQL Editor on your LIVE project (works from v7.8 or v8.0; every statement is safe to re-run).
-- Part 1 = device alerts (v8.0).  Part 2 = security hardening (v8.1).  Part 3 = views/functions tightening (v8.1b).
-- NOTE: Claude already applied all three parts to your live project on 2026-10-04; keep this file for clones / disaster recovery.

-- ################ PART 1 / 3 — DEVICE ALERTS ################
-- ============================================================================
-- iFiNeX v8.0 — DEVICE ALERTS  (background notifications with NO Firebase / APNs / third party)
-- Run ONCE in Supabase Dashboard -> SQL Editor (as postgres) on your LIVE project. Safe to re-run.
-- Adds:  public.bill_devices  +  register_device()  +  unregister_device()  +  poll_notifications()
--
-- How it fits together
--   * Signed-in user taps "Enable background alerts" in the Android app  -> register_device(device_id, secret)   [authenticated]
--   * The phone wakes itself every ~2 min and calls poll_notifications(device_id, secret, last_id)  [public anon key + secret]
--   * Only the SHA-256 of the secret is stored. 256-bit random secret => cannot be guessed.
--   * Logout -> unregister_device(); the secret stops working immediately.
-- ============================================================================

create table if not exists public.bill_devices (
  id            bigint generated always as identity primary key,
  device_id     uuid        not null unique,
  user_email    text        not null,
  secret_hash   text        not null,
  platform      text        not null default 'android' check (platform in ('android','ios','web')),
  label         text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);
create index if not exists idx_bill_devices_user on public.bill_devices (lower(user_email));
comment on table public.bill_devices is 'iFiNeX v8.0: one row per phone that receives background alerts. Only the SHA-256 of its secret is stored. No direct access: use the RPCs.';

alter table public.bill_devices enable row level security;           -- no policies on purpose => nobody reads/writes it directly
revoke all on table public.bill_devices from public, anon, authenticated;

-- 1) Register (or re-register) THIS phone for the signed-in user -----------------------------------------------------
create or replace function public.register_device(p_device_id uuid, p_secret text, p_label text default null, p_platform text default 'android')
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_email text := my_email();
  v_hash  text;
  v_owner text;
begin
  if v_email = '' then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if p_device_id is null or p_secret is null or length(p_secret) < 32 or length(p_secret) > 200 then
    return jsonb_build_object('ok', false, 'error', 'bad_secret');
  end if;
  if not exists (select 1 from app_users where lower(email) = v_email) then
    return jsonb_build_object('ok', false, 'error', 'unknown_user');          -- open sign-up can not register devices
  end if;
  if p_platform is null or p_platform not in ('android','ios','web') then p_platform := 'android'; end if;
  v_hash := encode(sha256(convert_to(p_secret, 'utf8')), 'hex');

  select lower(user_email) into v_owner from bill_devices where device_id = p_device_id;
  if v_owner is not null and v_owner <> v_email then
    return jsonb_build_object('ok', false, 'error', 'device_owned_by_other');
  end if;

  insert into bill_devices (device_id, user_email, secret_hash, platform, label)
  values (p_device_id, v_email, v_hash, p_platform, left(coalesce(p_label, ''), 80))
  on conflict (device_id) do update
    set secret_hash = excluded.secret_hash, platform = excluded.platform, label = excluded.label, last_seen_at = null;

  -- keep at most 8 phones per person: drop the oldest extras
  delete from bill_devices d
   where lower(d.user_email) = v_email
     and d.id in (select id from bill_devices where lower(user_email) = v_email order by created_at desc, id desc offset 8);

  return jsonb_build_object('ok', true);
end
$fn$;

-- 2) Unregister (logout / "turn off alerts") ----------------------------------------------------------------------------
create or replace function public.unregister_device(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_email text := my_email();
  n int;
begin
  if v_email = '' then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  delete from bill_devices where device_id = p_device_id and lower(user_email) = v_email;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'removed', n);
end
$fn$;

-- 3) Poll (called by the phone with the PUBLIC anon key; the secret is the credential) ------------------------------------
--    p_after < 0  => "baseline": returns the newest id and NO items (a fresh install never replays old history)
--    otherwise    => up to 20 newer rows + a 3-minute look-back (ids can commit out of order; the app de-dupes by id)
create or replace function public.poll_notifications(p_device_id uuid, p_secret text, p_after bigint default -1)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  d        record;
  v_hash   text;
  v_items  jsonb;
  v_cnt    int;
  v_last   bigint;
  v_newest bigint;
  v_more   boolean;
  v_cursor bigint;
begin
  if p_device_id is null or p_secret is null then return jsonb_build_object('ok', false, 'error', 'invalid_device'); end if;
  v_hash := encode(sha256(convert_to(p_secret, 'utf8')), 'hex');
  select * into d from bill_devices where device_id = p_device_id and secret_hash = v_hash;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_device'); end if;

  if d.last_seen_at is null or d.last_seen_at < now() - interval '1 minute' then
    update bill_devices set last_seen_at = now() where id = d.id;
  end if;

  select coalesce(max(id), 0) into v_newest from bill_notifications where lower(recipient_email) = lower(d.user_email);

  if p_after is null or p_after < 0 then
    return jsonb_build_object('ok', true, 'baseline', true, 'max_id', v_newest, 'has_more', false, 'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'message', t.message, 'created_at', t.created_at) order by t.id), '[]'::jsonb),
         count(*), max(t.id)
    into v_items, v_cnt, v_last
  from (
    select id, title, message, created_at
      from bill_notifications
     where lower(recipient_email) = lower(d.user_email)
       and created_at > now() - interval '7 days'
       and (id > p_after or (id > p_after - 200 and created_at > now() - interval '3 minutes'))
     order by id
     limit 20
  ) t;

  if v_cnt = 20 then                                   -- page is full: continue after the last row we returned
    v_more   := exists (select 1 from bill_notifications where lower(recipient_email) = lower(d.user_email) and id > v_last);
    v_cursor := v_last;
  else                                                 -- caught up (also skips anything older than 7 days)
    v_more   := false;
    v_cursor := greatest(p_after, v_newest);
  end if;

  return jsonb_build_object('ok', true, 'items', v_items, 'max_id', v_cursor, 'has_more', v_more);
end
$fn$;

-- Permissions: nothing is callable by default; open exactly what each caller needs.
revoke execute on function public.register_device(uuid,text,text,text), public.unregister_device(uuid), public.poll_notifications(uuid,text,bigint) from public, anon, authenticated;
grant  execute on function public.register_device(uuid,text,text,text), public.unregister_device(uuid) to authenticated;
grant  execute on function public.poll_notifications(uuid,text,bigint) to anon, authenticated;

-- Housekeeping: forget phones that have not checked in for 120 days (runs 03:30 UTC daily). Needs pg_cron (already used by this project).
select cron.schedule('purge-stale-devices', '30 3 * * *',
  $cron$delete from public.bill_devices where coalesce(last_seen_at, created_at) < now() - interval '120 days'$cron$);


-- ################ PART 2 / 3 — SECURITY HARDENING ################
-- ============================================================================
-- iFiNeX v8.1 — SECURITY HARDENING   (run ONCE in Supabase SQL Editor on your LIVE project; safe to re-run)
-- Closes:
--  1. Squad tables (expenses, settlements, prev_balances, members_config) were "Allow all" for EVERYONE, even logged-out visitors.
--     -> squad members read; members add expenses/settlements/carry-forwards; ONLY admins edit/delete/change the roster.
--  2. Admin takeover chain (anyone could plant an is_admin row in members_config, then Import-from-Squad made them admin).
--  3. Open sign-up: any stranger with an e-mail could read app_users + every card + create trackers/rows.
--     -> every table now refuses anyone who is not a registered user (or a registered user's delegate).
--  4. Anyone logged in could spoof notifications (and push messages) to any user -> you can only notify yourself.
--  5. app_users_directory (all e-mails) was readable by logged-out visitors -> registered users only.
--  6. Deleting a party silently wiped its whole ledger (and the linked party could do it) -> reason + history + notification, owner side only.
--  7. Raw REST deletes bypassed the audited delete functions -> direct DELETE removed on ledger entries / settlements / owed.
--  8. Tracker currency was raw HTML-able text -> markup characters rejected.
--  9. anon (logged-out) role loses ALL table access.
-- ============================================================================

-- 0) who is who ---------------------------------------------------------------------------------------------------------
create or replace function public.is_registered() returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from app_users u where lower(u.email) = my_email() or lower(coalesce(u.delegate_email,'')) = my_email())
$fn$;
create or replace function public.is_squad_member() returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from app_users u where u.group_type = 'squad_split'
                   and (lower(u.email) = my_email() or lower(coalesce(u.delegate_email,'')) = my_email()))
$fn$;
create or replace function public.is_squad_admin() returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from members_config m where m.is_admin = true and lower(coalesce(m.email,'')) = my_email())
      or exists (select 1 from app_users u where u.is_admin = true and (lower(u.email) = my_email() or lower(coalesce(u.delegate_email,'')) = my_email()))
$fn$;
revoke execute on function public.is_registered(), public.is_squad_member(), public.is_squad_admin() from public, anon;
grant  execute on function public.is_registered(), public.is_squad_member(), public.is_squad_admin() to authenticated;

-- 1) squad tables -------------------------------------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['expenses','members_config','prev_balances','settlements'] loop
    execute format('drop policy if exists "Allow all" on public.%I', t);
  end loop;
end $$;

drop policy if exists squad_expenses_select on public.expenses;  drop policy if exists squad_expenses_insert on public.expenses;
drop policy if exists squad_expenses_update on public.expenses;  drop policy if exists squad_expenses_delete on public.expenses;
create policy squad_expenses_select on public.expenses for select to authenticated using ((select is_squad_member()) or (select is_squad_admin()));
create policy squad_expenses_insert on public.expenses for insert to authenticated with check ((select is_squad_member()) or (select is_squad_admin()));
create policy squad_expenses_update on public.expenses for update to authenticated using ((select is_squad_admin())) with check ((select is_squad_admin()));
create policy squad_expenses_delete on public.expenses for delete to authenticated using ((select is_squad_admin()));

drop policy if exists squad_settlements_select on public.settlements;  drop policy if exists squad_settlements_insert on public.settlements;
drop policy if exists squad_settlements_update on public.settlements;  drop policy if exists squad_settlements_delete on public.settlements;
create policy squad_settlements_select on public.settlements for select to authenticated using ((select is_squad_member()) or (select is_squad_admin()));
create policy squad_settlements_insert on public.settlements for insert to authenticated with check ((select is_squad_member()) or (select is_squad_admin()));
create policy squad_settlements_update on public.settlements for update to authenticated using ((select is_squad_admin())) with check ((select is_squad_admin()));
create policy squad_settlements_delete on public.settlements for delete to authenticated using ((select is_squad_admin()));

drop policy if exists squad_prevbal_select on public.prev_balances;  drop policy if exists squad_prevbal_insert on public.prev_balances;
drop policy if exists squad_prevbal_update on public.prev_balances;  drop policy if exists squad_prevbal_delete on public.prev_balances;
create policy squad_prevbal_select on public.prev_balances for select to authenticated using ((select is_squad_member()) or (select is_squad_admin()));
create policy squad_prevbal_insert on public.prev_balances for insert to authenticated with check ((select is_squad_member()) or (select is_squad_admin()));
create policy squad_prevbal_update on public.prev_balances for update to authenticated using ((select is_squad_admin())) with check ((select is_squad_admin()));
create policy squad_prevbal_delete on public.prev_balances for delete to authenticated using ((select is_squad_admin()));

drop policy if exists squad_members_select on public.members_config;  drop policy if exists squad_members_write on public.members_config;
drop policy if exists squad_members_insert on public.members_config;  drop policy if exists squad_members_update on public.members_config;  drop policy if exists squad_members_delete on public.members_config;
create policy squad_members_select on public.members_config for select to authenticated using ((select is_squad_member()) or (select is_squad_admin()));
create policy squad_members_insert on public.members_config for insert to authenticated with check ((select is_squad_admin()));
create policy squad_members_update on public.members_config for update to authenticated using ((select is_squad_admin())) with check ((select is_squad_admin()));
create policy squad_members_delete on public.members_config for delete to authenticated using ((select is_squad_admin()));

-- 2/3) no stranger sees users or cards; registered users keep today's behaviour -----------------------------------------------
drop policy if exists app_users_select on public.app_users;
create policy app_users_select on public.app_users for select to authenticated using ((select is_registered()));
drop policy if exists bill_cards_select on public.bill_cards;
create policy bill_cards_select on public.bill_cards for select to authenticated using ((select is_registered()));

-- 4) notifications: only to yourself from the browser/app (triggers + functions are SECURITY DEFINER and are unaffected) -------
drop policy if exists bill_notifications_insert on public.bill_notifications;
create policy bill_notifications_insert on public.bill_notifications for insert to authenticated with check (lower(recipient_email) = (select my_email()));

-- 5) directory views: registered users only; logged-out visitors get nothing -------------------------------------------------
create or replace view public.app_users_directory as select email, name from public.app_users where public.is_registered();
revoke all on public.app_users_directory, public.bill_cards_directory from public, anon;
grant select on public.app_users_directory, public.bill_cards_directory to authenticated;

-- 9) the logged-out role gets no table access at all ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- gate: every app table refuses anyone who is not a registered user (or a registered user's delegate) — belt and braces ----------
do $$ declare t text; begin
  foreach t in array array['app_users','bill_card_payments','bill_card_shares','bill_cards','bill_deleted_history','bill_expenses','bill_notifications',
    'bill_owed','bill_payee_entries','bill_payees','bill_plan_payments','bill_plans','bill_push_subscriptions','bill_report_log','bill_settlements',
    'bill_user_prefs','et_categories','et_entries','et_trackers','expenses','members_config','prev_balances','settlements'] loop
    execute format('drop policy if exists ifx_registered_gate on public.%I', t);
    execute format('create policy ifx_registered_gate on public.%I as restrictive for all to authenticated using ((select public.is_registered())) with check ((select public.is_registered()))', t);
  end loop;
end $$;

-- 7) audited deletes only (the app already uses delete_payee_entry / delete_settlement_entry / delete_owed_entry) -------------
drop policy if exists bill_payee_entries_delete on public.bill_payee_entries;
drop policy if exists bill_settlements_delete   on public.bill_settlements;
drop policy if exists bill_owed_delete          on public.bill_owed;

-- 6) parties: read by owner side or the linked party; create/edit by the owner side only; delete ONLY through the function below
do $$ declare q text; begin
  select qual into q from pg_policies where schemaname='public' and tablename='bill_payees' and policyname='bill_payees_all';
  if q is not null then
    drop policy bill_payees_all on public.bill_payees;
    execute format('create policy bill_payees_select on public.bill_payees for select to authenticated using (%s)', q);
  end if;
end $$;
drop policy if exists bill_payees_insert on public.bill_payees;  drop policy if exists bill_payees_update on public.bill_payees;
create policy bill_payees_insert on public.bill_payees for insert to authenticated
  with check ((lower(user_email) = (select my_email())) or (select is_delegate_for(user_email)) or (select is_bill_admin()));
create policy bill_payees_update on public.bill_payees for update to authenticated
  using      ((lower(user_email) = (select my_email())) or (select is_delegate_for(user_email)) or (select is_bill_admin()))
  with check ((lower(user_email) = (select my_email())) or (select is_delegate_for(user_email)) or (select is_bill_admin()));

create or replace function public.delete_payee_with_reason(p_payee_id bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_payee  bill_payees%rowtype;
  v_caller text := my_email();
  v_n      int;
begin
  if v_caller = '' then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select * into v_payee from bill_payees where id = p_payee_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (lower(v_payee.user_email) = v_caller or is_delegate_for(v_payee.user_email) or is_bill_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');          -- the linked party must NOT be able to wipe the owner's ledger
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;

  insert into bill_deleted_history (source, owner_email, party_email, amount, entry_type, note, original_created_at, deleted_by_email, reason)
  select 'payee_entry', e.user_email, v_payee.party_email, e.amount, e.entry_type, e.note, e.date::timestamptz, v_caller,
         p_reason || ' (party "' || v_payee.party_name || '" removed)'
    from bill_payee_entries e where e.payee_id = p_payee_id;
  get diagnostics v_n = row_count;

  if v_payee.party_email is not null and length(trim(v_payee.party_email)) > 0 and lower(v_payee.party_email) <> v_caller then
    insert into bill_notifications (recipient_email, title, message)
    values (lower(v_payee.party_email), '🗑️ A shared ledger was removed',
            format('%s removed the party "%s" and its %s entr%s — reason: %s', v_caller, v_payee.party_name, v_n, case when v_n = 1 then 'y' else 'ies' end, p_reason));
  end if;
  delete from bill_payees where id = p_payee_id;     -- entries cascade, but they are archived above
  return jsonb_build_object('ok', true, 'archived', v_n);
end
$fn$;
revoke execute on function public.delete_payee_with_reason(bigint, text) from public, anon;
grant  execute on function public.delete_payee_with_reason(bigint, text) to authenticated;

-- 8) tracker currency: no markup characters (NOT VALID = old rows untouched, every new/edited row is checked) -----------------
alter table public.et_trackers drop constraint if exists et_trackers_currency_safe;
alter table public.et_trackers add constraint et_trackers_currency_safe
  check (currency is null or (length(currency) <= 12 and currency !~ '[<>"''&]')) not valid;


-- ################ PART 3 / 3 — VIEWS + FUNCTION GRANTS ################
-- ============================================================================
-- iFiNeX v8.1b — directory views run with the caller's rights; older SECURITY DEFINER functions are signed-in only.
-- (Applied to the live project on 2026-10-04 as migration "ifinex_v8_1b_views_invoker_and_function_grants".)
-- ============================================================================
alter view public.app_users_directory set (security_invoker = true);
alter view public.bill_cards_directory set (security_invoker = true);

revoke execute on function public.delete_owed_entry(bigint,text), public.delete_payee_entry(bigint,text), public.delete_settlement_entry(bigint,text), public.is_admin_delegate() from public, anon;
grant  execute on function public.delete_owed_entry(bigint,text), public.delete_payee_entry(bigint,text), public.delete_settlement_entry(bigint,text), public.is_admin_delegate() to authenticated, service_role;
