-- ============================================================================
-- iFiNeX v8.1b — directory views run with the caller's rights; older SECURITY DEFINER functions are signed-in only.
-- (Applied to the live project on 2026-10-04 as migration "ifinex_v8_1b_views_invoker_and_function_grants".)
-- ============================================================================
alter view public.app_users_directory set (security_invoker = true);
alter view public.bill_cards_directory set (security_invoker = true);

revoke execute on function public.delete_owed_entry(bigint,text), public.delete_payee_entry(bigint,text), public.delete_settlement_entry(bigint,text), public.is_admin_delegate() from public, anon;
grant  execute on function public.delete_owed_entry(bigint,text), public.delete_payee_entry(bigint,text), public.delete_settlement_entry(bigint,text), public.is_admin_delegate() to authenticated, service_role;
