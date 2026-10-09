
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
