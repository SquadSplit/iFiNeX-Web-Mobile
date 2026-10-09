-- ============================================================================
-- iFiNeX v8.1 — EMERGENCY ROLLBACK of the security hardening (ONLY if the live app is locked out and you cannot fix it another way).
-- WARNING: this puts the OLD, INSECURE access rules back (squad data open to everyone, strangers can read users/cards, notifications spoofable).
-- It keeps bill_devices / alerts and the new delete_payee_with_reason() function. Re-run v8_1_UPGRADE_run_once_on_live.sql afterwards to secure it again.
-- ============================================================================
do $$ declare t text; begin
  foreach t in array array['app_users','bill_card_payments','bill_card_shares','bill_cards','bill_deleted_history','bill_expenses','bill_notifications','bill_owed','bill_payee_entries','bill_payees','bill_plan_payments','bill_plans','bill_push_subscriptions','bill_report_log','bill_settlements','bill_user_prefs','et_categories','et_entries','et_trackers','expenses','members_config','prev_balances','settlements'] loop
    execute format('drop policy if exists ifx_registered_gate on public.%I', t);
  end loop;
end $$;
drop policy if exists squad_expenses_select on public.expenses; drop policy if exists squad_expenses_insert on public.expenses; drop policy if exists squad_expenses_update on public.expenses; drop policy if exists squad_expenses_delete on public.expenses;
drop policy if exists squad_settlements_select on public.settlements; drop policy if exists squad_settlements_insert on public.settlements; drop policy if exists squad_settlements_update on public.settlements; drop policy if exists squad_settlements_delete on public.settlements;
drop policy if exists squad_prevbal_select on public.prev_balances; drop policy if exists squad_prevbal_insert on public.prev_balances; drop policy if exists squad_prevbal_update on public.prev_balances; drop policy if exists squad_prevbal_delete on public.prev_balances;
drop policy if exists squad_members_select on public.members_config; drop policy if exists squad_members_insert on public.members_config; drop policy if exists squad_members_update on public.members_config; drop policy if exists squad_members_delete on public.members_config;
drop policy if exists bill_payees_select on public.bill_payees; drop policy if exists bill_payees_insert on public.bill_payees; drop policy if exists bill_payees_update on public.bill_payees;
drop policy if exists "Allow all" on public.expenses;
create policy "Allow all" on public.expenses as PERMISSIVE for ALL to public using (true) with check (true);
drop policy if exists "Allow all" on public.prev_balances;
create policy "Allow all" on public.prev_balances as PERMISSIVE for ALL to public using (true) with check (true);
drop policy if exists "Allow all" on public.settlements;
create policy "Allow all" on public.settlements as PERMISSIVE for ALL to public using (true) with check (true);
drop policy if exists "Allow all" on public.members_config;
create policy "Allow all" on public.members_config as PERMISSIVE for ALL to public using (true) with check (true);
drop policy if exists app_users_select on public.app_users;
create policy app_users_select on public.app_users as PERMISSIVE for SELECT to authenticated using (true);
drop policy if exists bill_cards_select on public.bill_cards;
create policy bill_cards_select on public.bill_cards as PERMISSIVE for SELECT to authenticated using (true);
drop policy if exists bill_notifications_insert on public.bill_notifications;
create policy bill_notifications_insert on public.bill_notifications as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1 FROM app_users WHERE (lower(app_users.email) = lower(bill_notifications.recipient_email)))));
drop policy if exists bill_payee_entries_delete on public.bill_payee_entries;
create policy bill_payee_entries_delete on public.bill_payee_entries as PERMISSIVE for DELETE to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_payee_entries.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin) OR (EXISTS ( SELECT 1 FROM bill_payees bp WHERE ((bp.id = bill_payee_entries.payee_id) AND (lower(COALESCE(bp.party_email, ''::text)) = ( SELECT my_email() AS my_email)))))));
drop policy if exists bill_settlements_delete on public.bill_settlements;
create policy bill_settlements_delete on public.bill_settlements as PERMISSIVE for DELETE to public using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR is_delegate_for(user_email) OR is_bill_admin()));
drop policy if exists bill_owed_delete on public.bill_owed;
create policy bill_owed_delete on public.bill_owed as PERMISSIVE for DELETE to public using ((is_bill_admin() OR is_admin_delegate()));
drop policy if exists bill_payees_all on public.bill_payees;
create policy bill_payees_all on public.bill_payees as PERMISSIVE for ALL to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_payees.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin) OR (lower(COALESCE(party_email, ''::text)) = ( SELECT my_email() AS my_email)))) with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_payees.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
alter view public.app_users_directory set (security_invoker = false);
alter view public.bill_cards_directory set (security_invoker = false);
create or replace view public.app_users_directory as select email, name from public.app_users;
grant select on public.app_users_directory, public.bill_cards_directory to anon, authenticated;
grant all on all tables in schema public to anon;
grant all on all sequences in schema public to anon;
