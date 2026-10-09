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
