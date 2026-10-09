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
