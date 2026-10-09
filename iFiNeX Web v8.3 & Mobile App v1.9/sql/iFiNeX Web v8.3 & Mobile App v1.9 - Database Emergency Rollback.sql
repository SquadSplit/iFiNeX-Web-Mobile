-- Rolls v8.3 database additions back. Data in bp_* tables and any 'trip' trackers is DELETED. Run only if you really need to.
drop function if exists public.ifx_bulk_import(text, text, jsonb);
drop function if exists public.ifx_bulk_notify(text, int, text);
drop table if exists public.bp_goals, public.bp_items, public.bp_income;
delete from public.et_entries where tracker_id in (select id from public.et_trackers where kind = 'trip');
delete from public.et_trackers where kind = 'trip';
alter table public.et_trackers drop constraint if exists et_trackers_kind_check;
alter table public.et_trackers add constraint et_trackers_kind_check check (kind in ('period','occasion'));
alter table public.bill_user_prefs drop constraint if exists bill_user_prefs_bg_fit_check;
alter table public.bill_user_prefs drop column if exists bg_zoom, drop column if exists bg_x, drop column if exists bg_y;
-- notify_people keeps its harmless "bulk" guard (it only matters while ifx_bulk_import exists).
