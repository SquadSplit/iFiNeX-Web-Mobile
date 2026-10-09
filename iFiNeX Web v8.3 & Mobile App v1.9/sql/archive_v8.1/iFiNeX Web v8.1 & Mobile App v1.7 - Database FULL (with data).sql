-- ============================================================================
-- iFiNeX (Squad Split + Bill Tracker + Expense Tracker) — FULL SCHEMA, WITH DATA  (v8.1 · 2026-10-04)
-- BEFORE YOU RUN: replace the text __PUSH_SECRET__ (inside dispatch_push_for_notification) with your send-push secret, otherwise browser web-push stays silent.
-- NEW in v8.1: SECURITY HARDENING (last section: registered-only access, squad tables locked, audited deletes).
-- NEW in v8.0: bill_devices + register_device / unregister_device / poll_notifications (native background alerts, see the section at the very end).
-- Source project: lznnetxeklmdrykxtsbm (Supabase, PG17)
-- Run in: Supabase Dashboard -> SQL Editor (as postgres), on an EMPTY project.
-- Order: extensions -> sequences -> tables -> constraints -> indexes -> functions -> views
-- ============================================================================
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto   with schema extensions;
create extension if not exists pg_net     with schema extensions;
create extension if not exists pg_cron;   -- if this errors: Dashboard -> Database -> Extensions -> enable pg_cron, re-run

-- SEQUENCES (tables that use nextval defaults)
create sequence if not exists public.app_users_id_seq;
create sequence if not exists public.bill_card_payments_id_seq;
create sequence if not exists public.bill_cards_id_seq;
create sequence if not exists public.bill_deleted_history_id_seq;
create sequence if not exists public.bill_expenses_id_seq;
create sequence if not exists public.bill_notifications_id_seq;
create sequence if not exists public.bill_owed_id_seq;
create sequence if not exists public.bill_payee_entries_id_seq;
create sequence if not exists public.bill_payees_id_seq;
create sequence if not exists public.bill_push_subscriptions_id_seq;
create sequence if not exists public.bill_report_log_id_seq;
create sequence if not exists public.bill_settlements_id_seq;
create sequence if not exists public.expenses_id_seq;
create sequence if not exists public.prev_balances_id_seq;
create sequence if not exists public.settlements_id_seq;

-- TABLES
create table if not exists public.app_users (
  id bigint default nextval('app_users_id_seq'::regclass) not null,
  email text not null,
  name text not null,
  group_type text default 'general'::text not null,
  is_admin boolean default false,
  emoji text default '😎'::text,
  color text default '#4d96ff'::text,
  created_at timestamp with time zone default now(),
  delegate_email text
);
create table if not exists public.bill_cards (
  id bigint default nextval('bill_cards_id_seq'::regclass) not null,
  user_email text not null,
  card_name text not null,
  color text default '#4d96ff'::text,
  created_at timestamp with time zone default now(),
  due_day integer,
  reminder_enabled boolean default true not null
);
create table if not exists public.bill_payees (
  id bigint default nextval('bill_payees_id_seq'::regclass) not null,
  user_email text not null,
  party_name text not null,
  color text default '#ff922b'::text,
  created_at timestamp with time zone default now(),
  party_email text
);
create table if not exists public.bill_card_shares (
  id bigint generated always as identity not null,
  card_id bigint not null,
  owner_email text not null,
  shared_with_email text not null,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.bill_card_payments (
  id bigint default nextval('bill_card_payments_id_seq'::regclass) not null,
  card_id bigint not null,
  user_email text not null,
  month text not null,
  due_date date not null,
  amount_due numeric default 0 not null,
  status text default 'pending'::text not null,
  paid_at timestamp with time zone,
  reminder_sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  push_sent_at timestamp with time zone
);
create table if not exists public.bill_deleted_history (
  id bigint default nextval('bill_deleted_history_id_seq'::regclass) not null,
  source text not null,
  owner_email text not null,
  party_email text,
  amount numeric not null,
  entry_type text,
  note text,
  original_created_at timestamp with time zone,
  deleted_at timestamp with time zone default now() not null,
  deleted_by_email text not null,
  reason text not null
);
create table if not exists public.bill_expenses (
  id bigint default nextval('bill_expenses_id_seq'::regclass) not null,
  user_email text not null,
  description text not null,
  amount numeric not null,
  card_id bigint,
  category text default 'other'::text,
  date date not null,
  month text not null,
  created_at timestamp with time zone default now()
);
create table if not exists public.bill_notifications (
  id bigint default nextval('bill_notifications_id_seq'::regclass) not null,
  recipient_email text not null,
  title text not null,
  message text not null,
  is_read boolean default false not null,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.bill_owed (
  id bigint default nextval('bill_owed_id_seq'::regclass) not null,
  user_email text not null,
  amount numeric not null,
  note text default ''::text,
  month text not null,
  created_at timestamp with time zone default now()
);
create table if not exists public.bill_payee_entries (
  id bigint default nextval('bill_payee_entries_id_seq'::regclass) not null,
  user_email text not null,
  payee_id bigint,
  amount numeric not null,
  entry_type text not null,
  note text default ''::text,
  date date not null,
  month text not null,
  created_at timestamp with time zone default now(),
  entered_by_email text,
  created_by_email text,
  payment_method text,
  card_id bigint,
  payment_type text default 'cash'::text not null
);
create table if not exists public.bill_plans (
  id bigint generated always as identity not null,
  user_email text not null,
  plan_type text default 'epp'::text not null,
  event_name text default 'General'::text not null,
  title text not null,
  ledger text default 'own'::text not null,
  payee_id bigint,
  card_id bigint,
  total_amount numeric not null,
  installments integer not null,
  start_date date not null,
  end_date date not null,
  due_day integer not null,
  notes text default ''::text,
  created_by_email text,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.bill_plan_payments (
  id bigint generated always as identity not null,
  plan_id bigint not null,
  user_email text not null,
  seq integer not null,
  due_date date not null,
  amount numeric not null,
  status text default 'pending'::text not null,
  paid_at timestamp with time zone,
  paid_by_email text
);
create table if not exists public.bill_push_subscriptions (
  id bigint default nextval('bill_push_subscriptions_id_seq'::regclass) not null,
  user_email text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default now() not null
);
create table if not exists public.bill_report_log (
  id bigint default nextval('bill_report_log_id_seq'::regclass) not null,
  user_email text not null,
  report_type text not null,
  month text not null,
  sent_at timestamp with time zone default now()
);
create table if not exists public.bill_settlements (
  id bigint default nextval('bill_settlements_id_seq'::regclass) not null,
  user_email text not null,
  amount numeric not null,
  month text not null,
  note text default ''::text,
  created_at timestamp with time zone default now()
);
create table if not exists public.bill_user_prefs (
  user_email text not null,
  theme text default 'default'::text not null,
  bg_url text,
  bg_opacity numeric default 0.30 not null,
  updated_at timestamp with time zone default now() not null
);
create table if not exists public.expenses (
  id bigint default nextval('expenses_id_seq'::regclass) not null,
  name text not null,
  amount numeric not null,
  paid_by text not null,
  split_between text[] not null,
  date date not null,
  category text default 'other'::text,
  month text not null,
  created_at timestamp with time zone default now()
);
create table if not exists public.members_config (
  id text not null,
  name text not null,
  email text default ''::text,
  emoji text default '😎'::text,
  color text default '#4d96ff'::text,
  is_admin boolean default false,
  sort_order integer default 0
);
create table if not exists public.prev_balances (
  id bigint default nextval('prev_balances_id_seq'::regclass) not null,
  from_member text not null,
  to_member text not null,
  amount numeric not null,
  month text not null,
  created_at timestamp with time zone default now()
);
create table if not exists public.settlements (
  id bigint default nextval('settlements_id_seq'::regclass) not null,
  from_member text not null,
  to_member text not null,
  amount numeric not null,
  month text not null,
  created_at timestamp with time zone default now()
);

-- sequence ownership
alter sequence public.app_users_id_seq owned by public.app_users.id;
alter sequence public.bill_card_payments_id_seq owned by public.bill_card_payments.id;
alter sequence public.bill_cards_id_seq owned by public.bill_cards.id;
alter sequence public.bill_deleted_history_id_seq owned by public.bill_deleted_history.id;
alter sequence public.bill_expenses_id_seq owned by public.bill_expenses.id;
alter sequence public.bill_notifications_id_seq owned by public.bill_notifications.id;
alter sequence public.bill_owed_id_seq owned by public.bill_owed.id;
alter sequence public.bill_payee_entries_id_seq owned by public.bill_payee_entries.id;
alter sequence public.bill_payees_id_seq owned by public.bill_payees.id;
alter sequence public.bill_push_subscriptions_id_seq owned by public.bill_push_subscriptions.id;
alter sequence public.bill_report_log_id_seq owned by public.bill_report_log.id;
alter sequence public.bill_settlements_id_seq owned by public.bill_settlements.id;
alter sequence public.expenses_id_seq owned by public.expenses.id;
alter sequence public.prev_balances_id_seq owned by public.prev_balances.id;
alter sequence public.settlements_id_seq owned by public.settlements.id;

-- PRIMARY KEY / UNIQUE / CHECK
alter table public.app_users add constraint app_users_group_type_check CHECK ((group_type = ANY (ARRAY['squad_split'::text, 'general'::text])));
alter table public.app_users add constraint app_users_pkey PRIMARY KEY (id);
alter table public.app_users add constraint app_users_email_key UNIQUE (email);
alter table public.bill_card_payments add constraint bill_card_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text])));
alter table public.bill_card_payments add constraint bill_card_payments_pkey PRIMARY KEY (id);
alter table public.bill_card_payments add constraint bill_card_payments_card_id_month_key UNIQUE (card_id, month);
alter table public.bill_card_shares add constraint bill_card_shares_pkey PRIMARY KEY (id);
alter table public.bill_card_shares add constraint bill_card_shares_card_id_shared_with_email_key UNIQUE (card_id, shared_with_email);
alter table public.bill_cards add constraint bill_cards_due_day_check CHECK (((due_day >= 1) AND (due_day <= 31)));
alter table public.bill_cards add constraint bill_cards_due_day_range CHECK (((due_day IS NULL) OR ((due_day >= 1) AND (due_day <= 31))));
alter table public.bill_cards add constraint bill_cards_pkey PRIMARY KEY (id);
alter table public.bill_deleted_history add constraint bill_deleted_history_pkey PRIMARY KEY (id);
alter table public.bill_expenses add constraint bill_expenses_pkey PRIMARY KEY (id);
alter table public.bill_notifications add constraint bill_notifications_pkey PRIMARY KEY (id);
alter table public.bill_owed add constraint bill_owed_pkey PRIMARY KEY (id);
alter table public.bill_payee_entries add constraint bill_payee_entries_entry_type_check CHECK ((entry_type = ANY (ARRAY['owe'::text, 'paid'::text])));
alter table public.bill_payee_entries add constraint bill_payee_entries_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'account'::text, 'card'::text])));
alter table public.bill_payee_entries add constraint bill_payee_entries_payment_type_chk CHECK ((payment_type = ANY (ARRAY['cash'::text, 'account'::text, 'card'::text])));
alter table public.bill_payee_entries add constraint bill_payee_entries_pkey PRIMARY KEY (id);
alter table public.bill_payees add constraint bill_payees_pkey PRIMARY KEY (id);
alter table public.bill_plan_payments add constraint bill_plan_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text])));
alter table public.bill_plan_payments add constraint bill_plan_payments_pkey PRIMARY KEY (id);
alter table public.bill_plan_payments add constraint bill_plan_payments_plan_id_seq_key UNIQUE (plan_id, seq);
alter table public.bill_plans add constraint bill_plans_check CHECK ((end_date >= start_date));
alter table public.bill_plans add constraint bill_plans_due_day_check CHECK (((due_day >= 1) AND (due_day <= 31)));
alter table public.bill_plans add constraint bill_plans_installments_check CHECK (((installments >= 1) AND (installments <= 120)));
alter table public.bill_plans add constraint bill_plans_ledger_check CHECK ((ledger = ANY (ARRAY['own'::text, 'owe_admin'::text, 'owe_other'::text, 'owed_to_you'::text])));
alter table public.bill_plans add constraint bill_plans_plan_type_check CHECK ((plan_type = ANY (ARRAY['epp'::text, 'gold'::text])));
alter table public.bill_plans add constraint bill_plans_total_amount_check CHECK ((total_amount > (0)::numeric));
alter table public.bill_plans add constraint bill_plans_pkey PRIMARY KEY (id);
alter table public.bill_push_subscriptions add constraint bill_push_subscriptions_pkey PRIMARY KEY (id);
alter table public.bill_push_subscriptions add constraint bill_push_subscriptions_endpoint_key UNIQUE (endpoint);
alter table public.bill_report_log add constraint bill_report_log_pkey PRIMARY KEY (id);
alter table public.bill_report_log add constraint bill_report_log_user_email_report_type_month_key UNIQUE (user_email, report_type, month);
alter table public.bill_settlements add constraint bill_settlements_pkey PRIMARY KEY (id);
alter table public.bill_user_prefs add constraint bill_user_prefs_bg_opacity_check CHECK (((bg_opacity >= 0.05) AND (bg_opacity <= 0.9)));
alter table public.bill_user_prefs add constraint bill_user_prefs_theme_check CHECK ((theme = ANY (ARRAY['default'::text, 'ocean'::text, 'sunset'::text, 'forest'::text, 'mono'::text, 'glass-aqua'::text, 'glass-dark'::text, 'neo-light'::text, 'neo-dark'::text, 'aurora'::text, 'noise-dark'::text, 'sandstone'::text, 'custom-photo'::text])));
alter table public.bill_user_prefs add constraint bill_user_prefs_pkey PRIMARY KEY (user_email);
alter table public.expenses add constraint expenses_pkey PRIMARY KEY (id);
alter table public.members_config add constraint members_config_pkey PRIMARY KEY (id);
alter table public.prev_balances add constraint prev_balances_pkey PRIMARY KEY (id);
alter table public.settlements add constraint settlements_pkey PRIMARY KEY (id);

-- FOREIGN KEYS
alter table public.bill_card_payments add constraint bill_card_payments_card_id_fkey FOREIGN KEY (card_id) REFERENCES bill_cards(id) ON DELETE CASCADE;
alter table public.bill_card_shares add constraint bill_card_shares_card_id_fkey FOREIGN KEY (card_id) REFERENCES bill_cards(id) ON DELETE CASCADE;
alter table public.bill_expenses add constraint bill_expenses_card_id_fkey FOREIGN KEY (card_id) REFERENCES bill_cards(id) ON DELETE SET NULL;
alter table public.bill_payee_entries add constraint bill_payee_entries_card_id_fkey FOREIGN KEY (card_id) REFERENCES bill_cards(id) ON DELETE SET NULL;
alter table public.bill_payee_entries add constraint bill_payee_entries_payee_id_fkey FOREIGN KEY (payee_id) REFERENCES bill_payees(id) ON DELETE CASCADE;
alter table public.bill_plan_payments add constraint bill_plan_payments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES bill_plans(id) ON DELETE CASCADE;
alter table public.bill_plans add constraint bill_plans_card_id_fkey FOREIGN KEY (card_id) REFERENCES bill_cards(id) ON DELETE SET NULL;
alter table public.bill_plans add constraint bill_plans_payee_id_fkey FOREIGN KEY (payee_id) REFERENCES bill_payees(id) ON DELETE SET NULL;

-- INDEXES
CREATE INDEX bill_plan_payments_plan_idx ON public.bill_plan_payments USING btree (plan_id, due_date);
CREATE INDEX bill_plans_user_idx ON public.bill_plans USING btree (lower(user_email));
CREATE INDEX idx_app_users_delegate ON public.app_users USING btree (lower(delegate_email));
CREATE INDEX idx_app_users_email ON public.app_users USING btree (lower(email));
CREATE INDEX idx_bcp_due_date ON public.bill_card_payments USING btree (due_date);
CREATE INDEX idx_bcp_email ON public.bill_card_payments USING btree (lower(user_email));
CREATE INDEX idx_bcp_reminder ON public.bill_card_payments USING btree (due_date, reminder_sent_at, status);
CREATE INDEX idx_bdh_owner ON public.bill_deleted_history USING btree (lower(owner_email));
CREATE INDEX idx_bdh_party ON public.bill_deleted_history USING btree (lower(COALESCE(party_email, ''::text)));
CREATE INDEX idx_bill_card_payments_email ON public.bill_card_payments USING btree (lower(user_email));
CREATE INDEX idx_bill_cards_email ON public.bill_cards USING btree (lower(user_email));
CREATE INDEX idx_bill_expenses_email ON public.bill_expenses USING btree (lower(user_email));
CREATE INDEX idx_bill_expenses_month ON public.bill_expenses USING btree (month);
CREATE INDEX idx_bill_notifications_recipient ON public.bill_notifications USING btree (lower(recipient_email), is_read);
CREATE INDEX idx_bill_owed_email ON public.bill_owed USING btree (lower(user_email));
CREATE INDEX idx_bill_payee_entries_card ON public.bill_payee_entries USING btree (card_id) WHERE (card_id IS NOT NULL);
CREATE INDEX idx_bill_payee_entries_email ON public.bill_payee_entries USING btree (lower(user_email));
CREATE INDEX idx_bill_payee_entries_payee ON public.bill_payee_entries USING btree (payee_id);
CREATE INDEX idx_bill_payees_email ON public.bill_payees USING btree (lower(user_email));
CREATE INDEX idx_bill_payees_linked ON public.bill_payees USING btree (lower(party_email));
CREATE INDEX idx_bill_push_subscriptions_email ON public.bill_push_subscriptions USING btree (lower(user_email));
CREATE INDEX idx_bill_settlements_email ON public.bill_settlements USING btree (lower(user_email));
CREATE INDEX idx_bpe_card ON public.bill_payee_entries USING btree (card_id) WHERE (card_id IS NOT NULL);
CREATE INDEX idx_push_email ON public.bill_push_subscriptions USING btree (lower(user_email));

-- ============================================================================
-- FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.my_email() RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', ''));
$function$;

CREATE OR REPLACE FUNCTION public.delegate_of(p_owner_email text) RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  select delegate_email from app_users where lower(email) = lower(p_owner_email) limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_delegate_for(target_email text) RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE lower(email) = lower(target_email)
    AND delegate_email IS NOT NULL
    AND lower(delegate_email) = (SELECT my_email())
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_bill_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE lower(email) = (SELECT my_email()) AND is_admin = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_delegate() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select exists (
    select 1 from app_users
    where is_admin = true
      and delegate_email is not null
      and lower(delegate_email) = (select my_email())
  );
$function$;

CREATE OR REPLACE FUNCTION public.notify_people(p_actor_email text, p_emails text[], p_title text, p_message text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_actor text := lower(coalesce(p_actor_email, ''));
  v_email text;
  v_seen text[] := '{}';
begin
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

CREATE OR REPLACE FUNCTION public.delete_owed_entry(p_id bigint, p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_row bill_owed%rowtype;
  v_caller text := (select my_email());
begin
  select * into v_row from bill_owed where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (is_bill_admin() or is_admin_delegate()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  insert into bill_notifications (recipient_email, title, message)
  values (
    lower(v_row.user_email), '⚖️ An owed amount was removed',
    format('An owed entry of AED %s (%s) was deleted by %s — reason: %s', v_row.amount, coalesce(v_row.note,'—'), v_caller, p_reason)
  );

  insert into bill_deleted_history (source, owner_email, party_email, amount, entry_type, note, original_created_at, deleted_by_email, reason)
  values ('owed', v_row.user_email, null, v_row.amount, null, v_row.note, v_row.created_at, v_caller, p_reason);

  delete from bill_owed where id = p_id;
  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_payee_entry(p_entry_id bigint, p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_entry bill_payee_entries%ROWTYPE;
  v_payee bill_payees%ROWTYPE;
  v_caller TEXT := (SELECT my_email());
  v_recipient TEXT;
  v_actor_is_owner_side BOOLEAN;
BEGIN
  SELECT * INTO v_entry FROM bill_payee_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  SELECT * INTO v_payee FROM bill_payees WHERE id = v_entry.payee_id;

  v_actor_is_owner_side := (lower(v_entry.user_email) = v_caller OR is_delegate_for(v_entry.user_email) OR is_bill_admin());
  IF NOT (v_actor_is_owner_side OR lower(COALESCE(v_payee.party_email,'')) = v_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  v_recipient := CASE WHEN v_actor_is_owner_side THEN v_payee.party_email ELSE v_entry.user_email END;

  IF v_recipient IS NOT NULL AND length(trim(v_recipient)) > 0 THEN
    INSERT INTO bill_notifications (recipient_email, title, message)
    VALUES (
      lower(v_recipient), '🗑️ A ledger entry was deleted',
      format('%s deleted a %s entry of AED %s%s — reason: %s', v_caller, v_entry.entry_type, v_entry.amount,
             CASE WHEN v_entry.note IS NOT NULL AND v_entry.note <> '' THEN ' ('||v_entry.note||')' ELSE '' END, p_reason)
    );
  END IF;

  INSERT INTO bill_deleted_history (source, owner_email, party_email, amount, entry_type, note, original_created_at, deleted_by_email, reason)
  VALUES ('payee_entry', v_entry.user_email, v_payee.party_email, v_entry.amount, v_entry.entry_type, v_entry.note, v_entry.date::timestamptz, v_caller, p_reason);

  DELETE FROM bill_payee_entries WHERE id = p_entry_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_settlement_entry(p_id bigint, p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_row bill_settlements%rowtype;
  v_caller text := (select my_email());
  v_caller_is_admin boolean := is_bill_admin();
begin
  select * into v_row from bill_settlements where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if not (
    lower(v_row.user_email) = v_caller
    or is_delegate_for(v_row.user_email)
    or v_caller_is_admin
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  if v_caller_is_admin then
    insert into bill_notifications (recipient_email, title, message)
    values (lower(v_row.user_email), '🗑️ A payment record was removed',
      format('Admin deleted your payment record of AED %s (%s) — reason: %s', v_row.amount, v_row.month, p_reason));
  else
    insert into bill_notifications (recipient_email, title, message)
    select lower(email), '🗑️ A payment record was deleted',
      format('%s deleted their payment record of AED %s (%s) — reason: %s', v_caller, v_row.amount, v_row.month, p_reason)
    from app_users where is_admin = true and lower(email) <> v_caller;
  end if;

  insert into bill_deleted_history (source, owner_email, party_email, amount, entry_type, note, original_created_at, deleted_by_email, reason)
  values ('settlement', v_row.user_email, null, v_row.amount, 'paid', v_row.note, v_row.created_at, v_caller, p_reason);

  delete from bill_settlements where id = p_id;
  return jsonb_build_object('ok', true);
end;
$function$;

-- Push dispatch: calls the send-push Edge Function on every new notification.
-- !! Replace __PUSH_SECRET__ with the Bearer token your send-push function expects
-- !! (the secret was removed from this export on purpose). Also replace the project ref in the URL.
CREATE OR REPLACE FUNCTION public.dispatch_push_for_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  perform net.http_post(
    url := 'https://lznnetxeklmdrykxtsbm.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Authorization', 'Bearer __PUSH_SECRET__',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'mode', 'notify',
      'recipient_email', new.recipient_email,
      'title', new.title,
      'body', new.message
    )
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_card_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_actor text := my_email();
begin
  if TG_OP = 'DELETE' then
    perform notify_people(v_actor, array[old.user_email, delegate_of(old.user_email)],
      '🗑️ Card removed', format('%s removed the card "%s"', coalesce(nullif(v_actor,''),'Someone'), old.card_name));
    return old;
  elsif TG_OP = 'INSERT' then
    perform notify_people(v_actor, array[new.user_email, delegate_of(new.user_email)],
      '💳 Card added', format('%s added a new card: "%s"', coalesce(nullif(v_actor,''),'Someone'), new.card_name));
    return new;
  elsif TG_OP = 'UPDATE' then
    perform notify_people(v_actor, array[new.user_email, delegate_of(new.user_email)],
      '✏️ Card updated', format('%s updated the card "%s"', coalesce(nullif(v_actor,''),'Someone'), new.card_name));
    return new;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_card_payment_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_actor text := my_email();
  v_card_name text;
begin
  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    select card_name into v_card_name from bill_cards where id = new.card_id;
    perform notify_people(v_actor, array[new.user_email, delegate_of(new.user_email)],
      '💳 Card payment status changed',
      format('%s marked %s (AED %s, %s) as %s', coalesce(nullif(v_actor,''),'System'), coalesce(v_card_name,'a card'),
             to_char(new.amount_due,'FM999999990.00'), new.month, new.status));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_card_share_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_actor text := my_email();
  v_card_name text;
begin
  if TG_OP = 'INSERT' then
    select card_name into v_card_name from bill_cards where id = new.card_id;
    perform notify_people(v_actor, array[new.shared_with_email, delegate_of(new.shared_with_email)],
      '🔗 Card access granted', format('%s gave you access to log against "%s"', coalesce(nullif(v_actor,''),'Someone'), coalesce(v_card_name,'a card')));
    return new;
  elsif TG_OP = 'DELETE' then
    select card_name into v_card_name from bill_cards where id = old.card_id;
    perform notify_people(v_actor, array[old.shared_with_email, delegate_of(old.shared_with_email)],
      '🔒 Card access removed', format('%s removed your access to "%s"', coalesce(nullif(v_actor,''),'Someone'), coalesce(v_card_name,'a card')));
    return old;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_expense_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_actor text := my_email();
begin
  if TG_OP = 'DELETE' then
    perform notify_people(v_actor, array[old.user_email, delegate_of(old.user_email)],
      '🗑️ Personal spend deleted',
      format('%s deleted a spend entry: %s — AED %s', coalesce(nullif(v_actor,''),'Someone'), old.description, to_char(old.amount,'FM999999990.00')));
    return old;
  elsif TG_OP = 'INSERT' then
    perform notify_people(v_actor, array[new.user_email, delegate_of(new.user_email)],
      '💵 Personal spend added',
      format('%s added a spend: %s — AED %s', coalesce(nullif(v_actor,''),'Someone'), new.description, to_char(new.amount,'FM999999990.00')));
    return new;
  elsif TG_OP = 'UPDATE' then
    perform notify_people(v_actor, array[new.user_email, delegate_of(new.user_email)],
      '✏️ Personal spend edited',
      format('%s edited a spend entry: %s (AED %s -> AED %s)', coalesce(nullif(v_actor,''),'Someone'), new.description, to_char(old.amount,'FM999999990.00'), to_char(new.amount,'FM999999990.00')));
    return new;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_owed_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_actor text := my_email();
begin
  if TG_OP = 'INSERT' then
    perform notify_people(v_actor, array[new.user_email, delegate_of(new.user_email)],
      '🏦 Owed amount added',
      format('An owed amount of AED %s was added%s', to_char(new.amount,'FM999999990.00'),
             case when new.note is not null and new.note <> '' then ' ('||new.note||')' else '' end));
  elsif TG_OP = 'UPDATE' and (old.amount is distinct from new.amount or old.note is distinct from new.note or old.month is distinct from new.month) then
    perform notify_people(v_actor, array[new.user_email, delegate_of(new.user_email)],
      '🏦 Owed amount updated',
      format('Owed amount changed: AED %s -> AED %s', to_char(old.amount,'FM999999990.00'), to_char(new.amount,'FM999999990.00')));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_payee_entry_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_payee record;
  v_actor text := coalesce(new.created_by_email, new.user_email);
  v_owner_name text;
  v_party_label text;
  v_recipients text[];
  v_msg text;
begin
  select * into v_payee from bill_payees where id = new.payee_id;
  select name into v_owner_name from app_users where lower(email) = lower(new.user_email);
  v_owner_name := coalesce(v_owner_name, new.user_email);
  v_party_label := coalesce(v_payee.party_name, v_payee.party_email, 'their party');

  v_recipients := array[new.user_email, delegate_of(new.user_email), v_payee.party_email, delegate_of(v_payee.party_email)];

  if TG_OP = 'INSERT' then
    v_msg := case new.entry_type
      when 'paid' then format('%s recorded a settlement of AED %s between %s and %s', v_actor, to_char(new.amount,'FM999999990.00'), v_owner_name, v_party_label)
      else format('%s logged AED %s that %s owes %s%s', v_actor, to_char(new.amount,'FM999999990.00'), v_owner_name, v_party_label,
                   case when new.card_id is not null then ' on a shared card' else '' end)
    end;
    perform notify_people(v_actor, v_recipients, '🤝 Party Ledger update', v_msg);
  elsif TG_OP = 'UPDATE' and (
        old.amount is distinct from new.amount
     or old.note   is distinct from new.note
     or old.date   is distinct from new.date
     or old.card_id is distinct from new.card_id
     or old.entry_type is distinct from new.entry_type) then
    v_msg := format('%s edited an entry between %s and %s: AED %s -> AED %s', v_actor, v_owner_name, v_party_label,
                     to_char(old.amount,'FM999999990.00'), to_char(new.amount,'FM999999990.00'));
    perform notify_people(v_actor, v_recipients, '✏️ Party Ledger entry edited', v_msg);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_settlement_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_actor text := coalesce(my_email(), '');
  v_admins text[];
begin
  select array_agg(lower(email)) into v_admins from app_users where is_admin = true;
  perform notify_people(v_actor, coalesce(v_admins, '{}'::text[]) || array[new.user_email, delegate_of(new.user_email)],
    '💰 Payment recorded',
    format('A payment of AED %s was recorded for %s (%s)', to_char(new.amount,'FM999999990.00'), new.user_email, new.month));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_plan_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare r public.bill_plans; act text := coalesce((select my_email()),''); who text[]; ttl text; msg text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  who := array[lower(r.user_email), lower(coalesce((select delegate_email from app_users where lower(email)=lower(r.user_email) limit 1),''))];
  ttl := case tg_op when 'INSERT' then '📅 Plan created' when 'UPDATE' then '📅 Plan updated' else '📅 Plan deleted' end;
  msg := initcap(r.plan_type)||' plan "'||r.title||'" ('||r.event_name||') — '||r.installments||' payments, total '||r.total_amount||' AED';
  perform notify_people(act, who, ttl, msg);
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.notify_plan_payment_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare p public.bill_plans; act text := coalesce((select my_email()),''); who text[];
begin
  if new.status is not distinct from old.status then return new; end if;
  select * into p from bill_plans where id = new.plan_id;
  if not found then return new; end if;
  who := array[lower(p.user_email), lower(coalesce((select delegate_email from app_users where lower(email)=lower(p.user_email) limit 1),''))];
  perform notify_people(act, who, case when new.status='paid' then '✅ Installment paid' else '↩️ Installment reopened' end,
    '"'||p.title||'" payment #'||new.seq||' of '||p.installments||' ('||new.amount||' AED, due '||new.due_date||')');
  return new;
end $function$;

-- FUNCTION PERMISSIONS (matches live project)
revoke execute on function public.notify_people(text,text[],text,text), public.notify_owed_change(), public.notify_payee_entry_change(),
  public.notify_settlement_change(), public.notify_card_payment_change(), public.notify_expense_change(), public.notify_card_change(),
  public.notify_card_share_change(), public.dispatch_push_for_notification(), public.notify_plan_change(), public.notify_plan_payment_change()
  from public, anon, authenticated;
revoke execute on function public.is_bill_admin() from public, anon;
revoke execute on function public.delete_owed_entry(bigint,text), public.delete_payee_entry(bigint,text) from public;

-- VIEWS
create or replace view public.bill_cards_directory as
  SELECT id, user_email, card_name, color
   FROM bill_cards c
  WHERE ((lower(user_email) = my_email()) OR is_bill_admin() OR (EXISTS ( SELECT 1
           FROM bill_card_shares s
          WHERE ((s.card_id = c.id) AND (lower(s.shared_with_email) = my_email())))));
create or replace view public.app_users_directory as
  SELECT email, name FROM app_users;
grant select on public.bill_cards_directory, public.app_users_directory to anon, authenticated;

-- ============================================================================
-- DATA  (live snapshot 2026-10-04 19:12 UTC, taken from the running Supabase project and verified table-by-table by content hash).
-- bill_push_subscriptions is intentionally NOT exported: browser push keys are device-bound and users re-subscribe automatically after login.
-- Empty in source: bill_owed, bill_report_log.   Load order respects the foreign keys.
-- ============================================================================
insert into public.app_users overriding system value select * from unnest(array['(1,abuabdullah.be@yahoo.com,"Abdullah Khan",squad_split,t,👑,#ffd93d,"2026-07-17 10:48:34.53793+00",)',
 '(3,pkmkamarudeen007@gmail.com,Kaatuva,squad_split,f,🔥,#ff6b6b,"2026-07-19 08:26:36.34884+00",abuabdullah.be@yahoo.com)',
 '(4,nainamohamed8760@gmail.com,Naina,squad_split,f,💫,#ff92d0,"2026-07-19 08:26:36.34884+00",abuabdullah.be@yahoo.com)',
 '(5,mohamedkasif235@gmail.com,"Asif Bidni",squad_split,f,⚡,#ffd93d,"2026-07-19 08:26:36.34884+00",)',
 '(6,niyazmohazzz@gmail.com,Niyaz,squad_split,f,🌿,#6bcb77,"2026-07-19 08:26:36.34884+00",)',
 '(7,farookmsd@gmail.com,Farook_MSD,general,f,🎯,#b06aff,"2026-07-22 04:30:28.450479+00",abuabdullah.be@yahoo.com)',
 '(8,abuabdullah.be@gmail.com,"Abdullah GMail",general,t,🚀,#ff922b,"2026-07-22 04:44:00.095545+00",)',
 '(10,abuabdullah.be@outlook.com,"Mohamed Abdullah Khan Abdullah Khan",general,f,💎,#4dd0e1,"2026-07-28 04:32:51.7223+00",)',
 '(11,shaha758@gmail.com,Shahabudeen,general,f,😎,#4d96ff,"2026-09-27 13:26:59.858144+00",abuabdullah.be@yahoo.com)']::public.app_users[]);
insert into public.members_config overriding system value select * from unnest(array['(khan,"Abdullah Khan",abuabdullah.be@yahoo.com,👑,#4d96ff,t,0)',
 '(kaatuva,Kaatuva,pkmkamarudeen007@gmail.com,🔥,#ff6b6b,f,1)',
 '(naina,Naina,Nainamohamed8760@gmail.com,💫,#ff92d0,f,2)',
 '(asif,"Asif Bidni",mohamedkasif235@gmail.com,⚡,#ffd93d,f,3)',
 '(niyaz,Niyaz,Niyazmohazzz@gmail.com,🌿,#6bcb77,f,4)']::public.members_config[]);
insert into public.bill_cards overriding system value select * from unnest(array['(1,abuabdullah.be@yahoo.com,"DUBAI First",#4d96ff,"2026-07-19 19:04:55.035247+00",1,t)',
 '(2,abuabdullah.be@yahoo.com,Mashreeq,#ff6b6b,"2026-07-19 19:05:00.727735+00",14,t)',
 '(3,abuabdullah.be@yahoo.com,RAK,#ff92d0,"2026-07-19 19:05:05.082555+00",5,t)',
 '(4,abuabdullah.be@yahoo.com,ADCB,#ffd93d,"2026-07-19 19:05:11.093062+00",28,t)',
 '(5,abuabdullah.be@yahoo.com,ENBD,#6bcb77,"2026-07-19 19:05:18.057393+00",28,t)',
 '(6,abuabdullah.be@yahoo.com,Tabby,#b06aff,"2026-07-19 19:05:24.924717+00",1,t)',
 '(7,abuabdullah.be@yahoo.com,EIB,#ff922b,"2026-07-19 19:05:29.003822+00",28,t)',
 '(8,abuabdullah.be@yahoo.com,"Current Account",#4dd0e1,"2026-07-22 04:31:22.975634+00",,t)',
 '(9,abuabdullah.be@yahoo.com,CASH,#4d96ff,"2026-07-22 04:31:37.625787+00",,t)',
 '(11,farookmsd@gmail.com,"Dubai First",#ff6b6b,"2026-07-22 04:46:38.599995+00",1,t)',
 '(12,nainamohamed8760@gmail.com,Mashreeq-Iphone,#4d96ff,"2026-07-30 07:28:38.078335+00",14,t)',
 '(13,nainamohamed8760@gmail.com,"ENBD LULU",#ff6b6b,"2026-08-07 10:55:25.009554+00",28,t)']::public.bill_cards[]);
insert into public.bill_payees overriding system value select * from unnest(array['(1,abuabdullah.be@yahoo.com,farookmsd@gmail.com,#4d96ff,"2026-07-25 20:49:18.939545+00",)',
 '(3,farookmsd@gmail.com,"Abdullah Khan",#4d96ff,"2026-07-28 04:30:01.136162+00",abuabdullah.be@yahoo.com)',
 '(4,nainamohamed8760@gmail.com,"Abdullah Khan",#4d96ff,"2026-07-30 07:29:13.595576+00",abuabdullah.be@gmail.com)',
 '(5,pkmkamarudeen007@gmail.com,"Abdullah Khan",#4d96ff,"2026-08-10 04:35:40.833727+00",abuabdullah.be@yahoo.com)',
 '(6,pkmkamarudeen007@gmail.com,Kaatuva,#ff6b6b,"2026-08-10 04:36:16.18225+00",pkmkamarudeen007@gmail.com)',
 '(7,pkmkamarudeen007@gmail.com,"Ashif bidni",#ff92d0,"2026-08-10 04:36:25.837616+00",mohamedkasif235@gmail.com)',
 '(8,nainamohamed8760@gmail.com,"Naina malai",#ff6b6b,"2026-08-10 04:51:44.557293+00",nainamohamed8760@gmail.com)',
 '(9,nainamohamed8760@gmail.com,"Ashif bidni",#ff92d0,"2026-08-10 04:51:53.85994+00",mohamedkasif235@gmail.com)',
 '(10,nainamohamed8760@gmail.com,Kaatuva,#ffd93d,"2026-08-10 04:52:08.338505+00",pkmkamarudeen007@gmail.com)',
 '(11,abuabdullah.be@yahoo.com,Shahabudeen,#ff6b6b,"2026-09-30 07:01:52.04031+00",shaha758@gmail.com)',
 '(12,shaha758@gmail.com,"Abdullah Khan",#4d96ff,"2026-09-30 07:10:34.06957+00",abuabdullah.be@yahoo.com)']::public.bill_payees[]);
insert into public.bill_card_shares overriding system value select * from unnest(array['(2,6,abuabdullah.be@yahoo.com,shaha758@gmail.com,"2026-09-30 12:44:39.446489+00")',
 '(3,2,abuabdullah.be@yahoo.com,shaha758@gmail.com,"2026-09-30 12:44:41.277677+00")',
 '(4,1,abuabdullah.be@yahoo.com,farookmsd@gmail.com,"2026-10-01 09:19:39.688109+00")',
 '(5,5,abuabdullah.be@yahoo.com,nainamohamed8760@gmail.com,"2026-10-01 09:19:59.410639+00")',
 '(6,2,abuabdullah.be@yahoo.com,pkmkamarudeen007@gmail.com,"2026-10-01 09:21:19.218591+00")']::public.bill_card_shares[]);
insert into public.bill_card_payments overriding system value select * from unnest(array['(1,1,abuabdullah.be@yahoo.com,2026-08,2026-08-01,0,pending,,,"2026-07-30 04:55:55.038688+00",)',
 '(2,2,abuabdullah.be@yahoo.com,2026-08,2026-08-14,0,pending,,"2026-08-07 07:00:10.895+00","2026-07-30 04:55:55.038688+00",)',
 '(3,3,abuabdullah.be@yahoo.com,2026-08,2026-08-14,0,pending,,"2026-08-07 07:00:11.643+00","2026-07-30 04:55:55.038688+00",)',
 '(4,4,abuabdullah.be@yahoo.com,2026-08,2026-08-28,0,pending,,"2026-08-21 07:00:04.144+00","2026-07-30 04:55:55.038688+00",)',
 '(5,5,abuabdullah.be@yahoo.com,2026-08,2026-08-28,0,pending,,"2026-08-21 07:00:04.563+00","2026-07-30 04:55:55.038688+00",)',
 '(6,6,abuabdullah.be@yahoo.com,2026-08,2026-08-01,0,pending,,,"2026-07-30 04:55:55.038688+00",)',
 '(7,7,abuabdullah.be@yahoo.com,2026-08,2026-08-28,0,pending,,"2026-08-21 07:00:05.019+00","2026-07-30 04:55:55.038688+00",)',
 '(8,11,farookmsd@gmail.com,2026-08,2026-08-01,0,pending,,,"2026-07-30 04:56:55.762+00",)',
 '(9,12,nainamohamed8760@gmail.com,2026-08,2026-08-14,0,pending,,,"2026-07-30 07:28:40.038208+00",)',
 '(10,1,abuabdullah.be@yahoo.com,2026-09,2026-09-01,0,pending,,"2026-08-25 07:00:05.123+00","2026-08-03 11:45:46.015904+00",)',
 '(11,6,abuabdullah.be@yahoo.com,2026-09,2026-09-01,0,pending,,"2026-08-25 07:00:05.646+00","2026-08-03 11:45:46.015904+00",)',
 '(12,11,farookmsd@gmail.com,2026-09,2026-09-01,0,pending,,"2026-08-25 07:00:04.695+00","2026-08-05 10:34:17.219134+00",)',
 '(13,2,abuabdullah.be@yahoo.com,2026-09,2026-09-14,0,pending,,"2026-09-07 07:00:04.383+00","2026-08-07 07:00:11.205469+00",)',
 '(14,3,abuabdullah.be@yahoo.com,2026-09,2026-09-14,0,pending,,"2026-09-07 07:00:04.884+00","2026-08-07 07:00:11.779521+00",)',
 '(15,4,abuabdullah.be@yahoo.com,2026-09,2026-09-28,0,pending,,"2026-09-21 07:00:06.061+00","2026-08-07 07:00:11.860441+00",)',
 '(16,5,abuabdullah.be@yahoo.com,2026-09,2026-09-28,0,pending,,"2026-09-21 07:00:06.536+00","2026-08-07 07:00:11.934192+00",)',
 '(17,7,abuabdullah.be@yahoo.com,2026-09,2026-09-28,0,pending,,"2026-09-21 07:00:07.452+00","2026-08-07 07:00:12.041529+00",)',
 '(18,12,nainamohamed8760@gmail.com,2026-09,2026-09-14,0,pending,,,"2026-08-07 07:00:12.129786+00",)',
 '(19,13,nainamohamed8760@gmail.com,2026-08,2026-08-28,0,pending,,,"2026-08-08 07:00:03.704946+00",)',
 '(20,13,nainamohamed8760@gmail.com,2026-09,2026-09-28,0,pending,,,"2026-08-08 07:00:03.773712+00",)',
 '(21,11,farookmsd@gmail.com,2026-10,2026-10-01,0,pending,,"2026-09-24 07:00:04.013+00","2026-09-01 07:00:07.38958+00",)',
 '(22,1,abuabdullah.be@yahoo.com,2026-10,2026-10-01,0,pending,,"2026-09-24 07:00:05.937+00","2026-09-01 07:00:08.667026+00",)',
 '(23,2,abuabdullah.be@yahoo.com,2026-10,2026-10-14,0,pending,,,"2026-09-01 07:00:09.151954+00",)',
 '(24,3,abuabdullah.be@yahoo.com,2026-10,2026-10-14,0,pending,,"2026-09-28 07:00:05.523+00","2026-09-01 07:00:09.289158+00",)',
 '(25,4,abuabdullah.be@yahoo.com,2026-10,2026-10-28,0,pending,,,"2026-09-01 07:00:09.382812+00",)',
 '(26,5,abuabdullah.be@yahoo.com,2026-10,2026-10-28,0,pending,,,"2026-09-01 07:00:09.465776+00",)',
 '(27,6,abuabdullah.be@yahoo.com,2026-10,2026-10-01,0,pending,,"2026-09-24 07:00:06.675+00","2026-09-01 07:00:09.540807+00",)',
 '(28,7,abuabdullah.be@yahoo.com,2026-10,2026-10-28,0,pending,,,"2026-09-01 07:00:09.630745+00",)',
 '(29,12,nainamohamed8760@gmail.com,2026-10,2026-10-14,0,pending,,,"2026-09-01 07:00:09.740847+00",)',
 '(30,13,nainamohamed8760@gmail.com,2026-10,2026-10-28,0,pending,,,"2026-09-01 07:00:09.811648+00",)',
 '(31,11,farookmsd@gmail.com,2026-11,2026-11-01,0,pending,,,"2026-10-01 07:00:04.188153+00",)',
 '(32,1,abuabdullah.be@yahoo.com,2026-11,2026-11-01,0,pending,,,"2026-10-01 07:00:04.677195+00",)',
 '(33,2,abuabdullah.be@yahoo.com,2026-11,2026-11-14,0,pending,,,"2026-10-01 07:00:04.830726+00",)',
 '(34,4,abuabdullah.be@yahoo.com,2026-11,2026-11-28,0,pending,,,"2026-10-01 07:00:04.949633+00",)',
 '(35,5,abuabdullah.be@yahoo.com,2026-11,2026-11-28,0,pending,,,"2026-10-01 07:00:05.051852+00",)',
 '(36,6,abuabdullah.be@yahoo.com,2026-11,2026-11-01,0,pending,,,"2026-10-01 07:00:05.160502+00",)',
 '(37,7,abuabdullah.be@yahoo.com,2026-11,2026-11-28,0,pending,,,"2026-10-01 07:00:05.238495+00",)',
 '(38,12,nainamohamed8760@gmail.com,2026-11,2026-11-14,0,pending,,,"2026-10-01 07:00:05.346075+00",)',
 '(39,13,nainamohamed8760@gmail.com,2026-11,2026-11-28,0,pending,,,"2026-10-01 07:00:05.421769+00",)',
 '(40,3,abuabdullah.be@yahoo.com,2026-11,2026-11-05,0,pending,,,"2026-10-01 07:00:05.52296+00",)']::public.bill_card_payments[]);
insert into public.bill_expenses overriding system value select * from unnest(array['(1,farookmsd@gmail.com,"Old Balance",42.82,11,other,2026-07-01,2026-07,"2026-07-22 04:46:48.908639+00")',
 '(2,farookmsd@gmail.com,Enoc,97.52,11,transport,2026-07-03,2026-07,"2026-07-22 04:47:33.492183+00")',
 '(3,farookmsd@gmail.com,Nesto,57.3,11,shopping,2026-07-05,2026-07,"2026-07-22 04:47:57.409961+00")',
 '(4,farookmsd@gmail.com,NEsto,158.63,11,shopping,2026-07-05,2026-07,"2026-07-22 04:48:17.679759+00")',
 '(5,farookmsd@gmail.com,Emarat,85.05,11,transport,2026-07-07,2026-07,"2026-07-22 04:48:39.227515+00")',
 '(6,farookmsd@gmail.com,"Auto Care",15.75,11,transport,2026-07-10,2026-07,"2026-07-22 04:49:18.55845+00")',
 '(7,farookmsd@gmail.com,Enoc,100.28,11,transport,2026-07-11,2026-07,"2026-07-22 04:49:38.591159+00")',
 '(8,farookmsd@gmail.com,garage,367.5,11,transport,2026-07-11,2026-07,"2026-07-22 04:50:12.291612+00")',
 '(9,farookmsd@gmail.com,Nesto,46.66,11,shopping,2026-07-13,2026-07,"2026-07-22 04:50:29.576126+00")',
 '(10,farookmsd@gmail.com,Emarat,105.02,11,transport,2026-07-16,2026-07,"2026-07-22 04:51:18.127656+00")',
 '(11,farookmsd@gmail.com,Carrefour,34.68,11,shopping,2026-07-17,2026-07,"2026-07-22 04:52:04.683597+00")',
 '(12,farookmsd@gmail.com,emarat,80.08,11,transport,2026-07-20,2026-07,"2026-07-22 04:52:29.963323+00")',
 '(13,farookmsd@gmail.com,Rumaan,56,11,food,2026-07-19,2026-07,"2026-07-22 04:52:50.900274+00")',
 '(14,farookmsd@gmail.com,Grocery,13,11,shopping,2026-07-21,2026-07,"2026-07-22 04:53:38.677848+00")',
 '(15,farookmsd@gmail.com,"Singapore shop",141,11,other,2026-07-25,2026-07,"2026-07-26 06:16:10.34771+00")',
 '(16,farookmsd@gmail.com,Madina,64.55,11,other,2026-07-25,2026-07,"2026-07-26 06:18:29.982138+00")',
 '(17,farookmsd@gmail.com,Enoc,100.08,11,other,2026-07-24,2026-07,"2026-07-26 06:20:10.621256+00")',
 '(18,farookmsd@gmail.com,Enoc,83.99,11,other,2026-07-28,2026-07,"2026-07-28 15:45:15.263725+00")',
 '(19,farookmsd@gmail.com,Mutton,45,11,other,2026-07-28,2026-07,"2026-07-28 15:46:04.175216+00")',
 '(20,farookmsd@gmail.com,"Falak al madina",17.66,11,other,2026-07-28,2026-07,"2026-07-28 15:46:40.314465+00")',
 '(21,farookmsd@gmail.com,Enoc,90.01,11,other,2026-07-31,2026-07,"2026-07-31 09:49:57.843822+00")',
 '(22,farookmsd@gmail.com,"Veg me",5.5,11,other,2026-07-31,2026-07,"2026-07-31 09:50:21.634317+00")',
 '(23,farookmsd@gmail.com,Enoc,108.02,11,other,2026-08-05,2026-08,"2026-08-05 10:38:22.430768+00")',
 '(24,farookmsd@gmail.com,"Sheetu panam",565,11,other,2026-07-31,2026-07,"2026-08-07 09:40:44.810703+00")',
 '(25,farookmsd@gmail.com,"Aroos Damascus",45,11,other,2026-07-31,2026-07,"2026-08-07 09:57:35.123331+00")',
 '(27,abuabdullah.be@yahoo.com,Tabby,1.01,6,health,2026-08-07,2026-08,"2026-08-07 11:01:18.842382+00")',
 '(28,farookmsd@gmail.com,Enoc,105.01,11,other,2026-08-10,2026-08,"2026-08-21 13:27:27.264729+00")',
 '(29,farookmsd@gmail.com,Eno,110,11,other,2026-08-13,2026-08,"2026-08-21 13:29:16.081762+00")',
 '(30,farookmsd@gmail.com,"Kadavu restaurant",12,11,other,2026-08-13,2026-08,"2026-08-21 13:30:00.827105+00")',
 '(31,farookmsd@gmail.com,Garage,50,11,other,2026-08-14,2026-08,"2026-08-21 13:30:42.45606+00")',
 '(32,farookmsd@gmail.com,Garage,74,11,other,2026-08-14,2026-08,"2026-08-21 13:31:16.103797+00")',
 '(33,farookmsd@gmail.com,Enoc,100.02,11,other,2026-08-18,2026-08,"2026-08-21 13:31:50.586665+00")',
 '(34,farookmsd@gmail.com,"Car passing",170,11,other,2026-08-18,2026-08,"2026-08-21 13:33:13.142984+00")',
 '(35,farookmsd@gmail.com,"Aroos restaurant",24,11,other,2026-08-21,2026-08,"2026-08-23 08:04:06.843742+00")',
 '(36,farookmsd@gmail.com,Nesto,88,11,other,2026-08-21,2026-08,"2026-08-23 08:04:49.357289+00")',
 '(37,farookmsd@gmail.com,Enoc,93.92,11,other,2026-08-22,2026-08,"2026-08-23 08:05:32.683316+00")',
 '(38,farookmsd@gmail.com,Mandi,40,11,other,2026-08-22,2026-08,"2026-08-23 08:08:29.908254+00")',
 '(39,farookmsd@gmail.com,"Talal super market",100.48,11,other,2026-08-23,2026-08,"2026-08-23 08:10:03.00712+00")',
 '(40,farookmsd@gmail.com,Nesto,70.58,11,other,2026-08-26,2026-08,"2026-08-29 15:11:03.80171+00")',
 '(41,farookmsd@gmail.com,Emarath,110,11,other,2026-08-26,2026-08,"2026-08-29 15:11:43.575389+00")',
 '(42,farookmsd@gmail.com,Madina,32.4,11,other,2026-08-27,2026-08,"2026-08-29 15:12:08.168045+00")',
 '(43,farookmsd@gmail.com,"Union coop",18.37,11,other,2026-08-28,2026-08,"2026-08-29 15:13:19.88207+00")',
 '(44,farookmsd@gmail.com,Nesto,69.34,11,other,2026-08-29,2026-08,"2026-08-29 15:13:42.547116+00")',
 '(45,farookmsd@gmail.com,"Ice cream",6,11,other,2026-08-29,2026-08,"2026-08-29 15:13:59.962296+00")',
 '(46,farookmsd@gmail.com,Enoc,95.03,11,other,2026-08-31,2026-08,"2026-08-31 10:36:05.079128+00")',
 '(47,farookmsd@gmail.com,Aster,8,11,other,2026-08-31,2026-08,"2026-08-31 10:36:19.922561+00")',
 '(48,farookmsd@gmail.com,Talal,46.7,11,other,2026-08-31,2026-08,"2026-08-31 10:36:34.803163+00")',
 '(49,farookmsd@gmail.com,"Seetu panam",565,11,other,2026-08-31,2026-08,"2026-09-02 04:03:43.108231+00")',
 '(53,farookmsd@gmail.com,Enoc,103.43,11,other,2026-09-04,2026-09,"2026-09-11 09:53:44.644898+00")',
 '(54,farookmsd@gmail.com,Nesto,126.67,11,other,2026-09-04,2026-09,"2026-09-11 09:54:33.628988+00")',
 '(55,farookmsd@gmail.com,Aroos,12,11,other,2026-09-06,2026-09,"2026-09-11 09:55:07.777057+00")',
 '(56,farookmsd@gmail.com,Aroos,17,11,other,2026-09-06,2026-09,"2026-09-11 09:55:37.007139+00")',
 '(57,farookmsd@gmail.com,Glomar,57.33,11,other,2026-09-07,2026-09,"2026-09-11 09:56:11.265259+00")',
 '(58,farookmsd@gmail.com,Enoc,115.05,11,other,2026-09-07,2026-09,"2026-09-11 09:56:34.979098+00")',
 '(59,farookmsd@gmail.com,"Falak al madina",34.29,11,other,2026-09-07,2026-09,"2026-09-11 09:57:16.547986+00")',
 '(60,farookmsd@gmail.com,Nesto,46.27,11,other,2026-09-08,2026-09,"2026-09-11 09:57:38.176395+00")',
 '(61,farookmsd@gmail.com,Enoc,102.07,11,other,2026-09-11,2026-09,"2026-09-11 09:58:23.651518+00")',
 '(62,farookmsd@gmail.com,Talal,30.52,11,other,2026-09-12,2026-09,"2026-09-17 13:15:31.168384+00")',
 '(63,farookmsd@gmail.com,"Mabran mutton",60,11,other,2026-09-12,2026-09,"2026-09-17 13:16:52.047586+00")',
 '(64,farookmsd@gmail.com,Emarath,115.02,11,other,2026-09-15,2026-09,"2026-09-17 13:17:26.449379+00")',
 '(65,farookmsd@gmail.com,"Falak al madina",18.97,11,other,2026-09-14,2026-09,"2026-09-17 13:18:15.869949+00")',
 '(66,farookmsd@gmail.com,"Falak al madina",64.44,11,other,2026-09-16,2026-09,"2026-09-17 13:19:06.668861+00")',
 '(67,farookmsd@gmail.com,"Falak al madina",60.27,11,other,2026-09-21,2026-09,"2026-09-24 10:34:04.398332+00")',
 '(68,farookmsd@gmail.com,Emarath,110,11,other,2026-09-22,2026-09,"2026-09-24 10:34:35.948338+00")',
 '(70,farookmsd@gmail.com,"Falak al madina",39.13,11,other,2026-09-24,2026-09,"2026-09-24 10:35:47.543545+00")',
 '(71,farookmsd@gmail.com,Emarath,110,11,other,2026-09-26,2026-09,"2026-09-28 10:53:11.172083+00")',
 '(72,farookmsd@gmail.com,"Jabber Bhai biriyani",58,11,other,2026-09-26,2026-09,"2026-09-28 10:53:53.331019+00")',
 '(73,farookmsd@gmail.com,Nesto,79.44,11,other,2026-09-28,2026-09,"2026-09-28 10:54:23.967038+00")',
 '(74,farookmsd@gmail.com,"Noor al madina",8,11,other,2026-09-30,2026-09,"2026-10-04 16:49:33.19684+00")',
 '(75,farookmsd@gmail.com,Enoc,107.38,11,other,2026-09-30,2026-09,"2026-10-04 16:50:11.417467+00")',
 '(76,farookmsd@gmail.com,Talal,76.18,11,other,2026-10-01,2026-10,"2026-10-04 16:51:11.062897+00")',
 '(77,farookmsd@gmail.com,"Hamda Yousuf",16.5,11,other,2026-10-01,2026-10,"2026-10-04 16:52:09.957158+00")',
 '(78,farookmsd@gmail.com,Tasty,5.5,11,other,2026-10-02,2026-10,"2026-10-04 16:52:42.939115+00")']::public.bill_expenses[]);
insert into public.bill_payee_entries overriding system value select * from unnest(array['(5,nainamohamed8760@gmail.com,4,470,owe,"old mobile balances",2026-06-30,2026-06,"2026-07-30 07:29:49.906689+00",nainamohamed8760@gmail.com,,cash,,cash)',
 '(6,nainamohamed8760@gmail.com,4,425,owe,"new Iphone payment pending",2026-07-30,2026-07,"2026-07-30 07:30:21.585629+00",nainamohamed8760@gmail.com,,cash,,cash)',
 '(7,nainamohamed8760@gmail.com,4,50,owe,"Emirates NBD LULU ( old payment balance)",2026-06-30,2026-06,"2026-08-07 10:57:16.310127+00",,nainamohamed8760@gmail.com,card,,cash)',
 '(8,nainamohamed8760@gmail.com,4,425,owe,"July month mobile payment",2026-07-30,2026-07,"2026-08-07 10:57:56.499832+00",,nainamohamed8760@gmail.com,card,,cash)',
 '(9,nainamohamed8760@gmail.com,4,65,owe,"Car mulukiya and insurance balance",2026-07-30,2026-07,"2026-08-07 10:58:18.589143+00",,nainamohamed8760@gmail.com,account,,cash)',
 '(11,pkmkamarudeen007@gmail.com,5,500,owe,"They took for your rent",2026-07-18,2026-07,"2026-08-18 12:07:05.570762+00",,pkmkamarudeen007@gmail.com,card,1,cash)',
 '(12,pkmkamarudeen007@gmail.com,5,270,owe,"I paid for your rak card",2026-07-18,2026-07,"2026-08-18 12:07:26.17055+00",,pkmkamarudeen007@gmail.com,account,,cash)',
 '(13,pkmkamarudeen007@gmail.com,5,110,owe,"Mobile and gold payment balance",2026-09-10,2026-09,"2026-08-18 12:08:40.84244+00",,pkmkamarudeen007@gmail.com,card,2,cash)',
 '(14,pkmkamarudeen007@gmail.com,5,60,owe,"Tabby payment barrow",2026-08-24,2026-08,"2026-08-25 12:18:20.643254+00",,pkmkamarudeen007@gmail.com,,,cash)',
 '(17,pkmkamarudeen007@gmail.com,5,50,owe,"Tabby payment by card",2026-09-07,2026-09,"2026-09-07 14:15:28.695755+00",,pkmkamarudeen007@gmail.com,,,cash)',
 '(18,pkmkamarudeen007@gmail.com,5,90,owe,"Rak CC payment from my side",2026-09-07,2026-09,"2026-09-07 14:16:05.611387+00",,pkmkamarudeen007@gmail.com,,,cash)',
 '(19,nainamohamed8760@gmail.com,4,20,owe,"kaatuva payment 20",2026-09-07,2026-09,"2026-09-09 08:43:30.893117+00",,nainamohamed8760@gmail.com,,,cash)']::public.bill_payee_entries[]);
insert into public.bill_plans overriding system value select * from unnest(array['(1,nainamohamed8760@gmail.com,epp,Mobile,"Naina iphone 17 pro max",owe_other,4,13,5099,12,2026-02-10,2027-01-10,30,"6 payment 4 payment done",abuabdullah.be@yahoo.com,"2026-09-30 06:31:28.432905+00")',
 '(2,shaha758@gmail.com,epp,Mobile,"Shaha Honor 600 Lite",owe_other,12,6,1099,4,2026-09-27,2026-12-27,5,"",abuabdullah.be@yahoo.com,"2026-10-02 07:17:16.469456+00")']::public.bill_plans[]);
insert into public.bill_plan_payments overriding system value select * from unnest(array['(1,1,nainamohamed8760@gmail.com,1,2026-02-28,424.91,paid,"2026-09-30 06:31:39.819+00",abuabdullah.be@yahoo.com)',
 '(2,1,nainamohamed8760@gmail.com,2,2026-03-30,424.91,paid,"2026-09-30 06:31:47.447+00",abuabdullah.be@yahoo.com)',
 '(3,1,nainamohamed8760@gmail.com,3,2026-04-30,424.91,paid,"2026-09-30 06:31:49.442+00",abuabdullah.be@yahoo.com)',
 '(4,1,nainamohamed8760@gmail.com,4,2026-05-30,424.91,paid,"2026-09-30 06:31:49.799+00",abuabdullah.be@yahoo.com)',
 '(5,1,nainamohamed8760@gmail.com,5,2026-06-30,424.91,pending,,)',
 '(6,1,nainamohamed8760@gmail.com,6,2026-07-30,424.91,pending,,)',
 '(7,1,nainamohamed8760@gmail.com,7,2026-08-30,424.91,pending,,)',
 '(8,1,nainamohamed8760@gmail.com,8,2026-09-30,424.91,pending,,)',
 '(9,1,nainamohamed8760@gmail.com,9,2026-10-30,424.91,pending,,)',
 '(10,1,nainamohamed8760@gmail.com,10,2026-11-30,424.91,pending,,)',
 '(11,1,nainamohamed8760@gmail.com,11,2026-12-30,424.91,pending,,)',
 '(12,1,nainamohamed8760@gmail.com,12,2027-01-30,424.99,pending,,)',
 '(13,2,shaha758@gmail.com,1,2026-10-05,300,paid,"2026-10-02 07:17:30.917+00",abuabdullah.be@yahoo.com)',
 '(14,2,shaha758@gmail.com,2,2026-11-05,249.5,pending,,)',
 '(15,2,shaha758@gmail.com,3,2026-12-05,274.75,pending,,)',
 '(16,2,shaha758@gmail.com,4,2027-01-05,274.75,pending,,)']::public.bill_plan_payments[]);
insert into public.bill_settlements overriding system value select * from unnest(array['(2,farookmsd@gmail.com,2400,2026-07,"","2026-08-21 18:24:10.961732+00")']::public.bill_settlements[]);
insert into public.bill_notifications overriding system value select * from unnest(array['(7,farookmsd@gmail.com,"🗑️ A payment record was removed","Admin deleted your payment record of AED 101 (2026-07) — reason: Its not added",f,"2026-08-24 17:47:20.245805+00")',
 '(15,abuabdullah.be@gmail.com,"Party Ledger update","nainamohamed8760@gmail.com logged 20.00 AED against you",t,"2026-09-09 08:43:30.893117+00")',
 '(38,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Falak al madina — AED 60.27",t,"2026-09-24 10:34:04.398332+00")',
 '(39,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Emarath — AED 110.00",t,"2026-09-24 10:34:35.948338+00")',
 '(40,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Garage — AED 1100.00",t,"2026-09-24 10:35:25.961489+00")',
 '(41,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Falak al madina — AED 39.13",t,"2026-09-24 10:35:47.543545+00")',
 '(42,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Emarath — AED 110.00",t,"2026-09-28 10:53:11.172083+00")',
 '(43,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Jabber Bhai biriyani — AED 58.00",t,"2026-09-28 10:53:53.331019+00")',
 '(44,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Nesto — AED 79.44",t,"2026-09-28 10:54:23.967038+00")',
 '(45,nainamohamed8760@gmail.com,"📅 Plan created","Epp plan ""Naina iphone 17 pro max"" (Mobile) — 12 payments, total 5099 AED",f,"2026-09-30 06:31:28.432905+00")',
 '(46,nainamohamed8760@gmail.com,"✅ Installment paid","""Naina iphone 17 pro max"" payment #1 of 12 (424.91 AED, due 2026-02-28)",f,"2026-09-30 06:31:42.313115+00")',
 '(47,nainamohamed8760@gmail.com,"✅ Installment paid","""Naina iphone 17 pro max"" payment #2 of 12 (424.91 AED, due 2026-03-30)",f,"2026-09-30 06:31:46.64617+00")',
 '(48,nainamohamed8760@gmail.com,"✅ Installment paid","""Naina iphone 17 pro max"" payment #3 of 12 (424.91 AED, due 2026-04-30)",f,"2026-09-30 06:31:51.916162+00")',
 '(49,nainamohamed8760@gmail.com,"✅ Installment paid","""Naina iphone 17 pro max"" payment #4 of 12 (424.91 AED, due 2026-05-30)",f,"2026-09-30 06:31:52.25663+00")',
 '(50,shaha758@gmail.com,"🔗 Card access granted","abuabdullah.be@yahoo.com gave you access to log against ""Tabby""",f,"2026-09-30 12:44:39.446489+00")',
 '(51,shaha758@gmail.com,"🔗 Card access granted","abuabdullah.be@yahoo.com gave you access to log against ""Mashreeq""",f,"2026-09-30 12:44:41.277677+00")',
 '(52,farookmsd@gmail.com,"🔗 Card access granted","abuabdullah.be@yahoo.com gave you access to log against ""DUBAI First""",f,"2026-10-01 09:19:39.688109+00")',
 '(53,nainamohamed8760@gmail.com,"🔗 Card access granted","abuabdullah.be@yahoo.com gave you access to log against ""ENBD""",f,"2026-10-01 09:19:59.410639+00")',
 '(54,pkmkamarudeen007@gmail.com,"🔗 Card access granted","abuabdullah.be@yahoo.com gave you access to log against ""Mashreeq""",f,"2026-10-01 09:21:19.218591+00")',
 '(55,shaha758@gmail.com,"📅 Plan created","Epp plan ""Shaha Honor 600 Lite"" (Mobile) — 4 payments, total 1099 AED",f,"2026-10-02 07:17:16.469456+00")',
 '(56,shaha758@gmail.com,"✅ Installment paid","""Shaha Honor 600 Lite"" payment #1 of 4 (300 AED, due 2026-10-05)",f,"2026-10-02 07:17:31.346911+00")',
 '(57,farookmsd@gmail.com,"🗑️ Personal spend deleted","abuabdullah.be@yahoo.com deleted a spend entry: Garage — AED 1100.00",f,"2026-10-03 17:09:13.134942+00")',
 '(58,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Noor al madina — AED 8.00",f,"2026-10-04 16:49:33.19684+00")',
 '(59,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Enoc — AED 107.38",f,"2026-10-04 16:50:11.417467+00")',
 '(60,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Talal — AED 76.18",f,"2026-10-04 16:51:11.062897+00")',
 '(61,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Hamda Yousuf — AED 16.50",f,"2026-10-04 16:52:09.957158+00")',
 '(62,abuabdullah.be@yahoo.com,"💵 Personal spend added","farookmsd@gmail.com added a spend: Tasty — AED 5.50",f,"2026-10-04 16:52:42.939115+00")']::public.bill_notifications[]);
insert into public.bill_deleted_history overriding system value select * from unnest(array['(1,payee_entry,farookmsd@gmail.com,abuabdullah.be@yahoo.com,1,owe,Test,"2026-07-28 00:00:00+00","2026-08-07 11:00:57.225336+00",abuabdullah.be@yahoo.com,"Wrong entry")',
 '(2,settlement,farookmsd@gmail.com,,101,paid,"","2026-08-07 11:03:01.559438+00","2026-08-24 17:47:20.245805+00",abuabdullah.be@yahoo.com,"Its not added")',
 '(3,payee_entry,pkmkamarudeen007@gmail.com,abuabdullah.be@yahoo.com,50,owe,"Tabby payment transfer failed","2026-09-07 00:00:00+00","2026-09-07 14:28:32.803492+00",abuabdullah.be@yahoo.com,Wrong)',
 '(4,payee_entry,pkmkamarudeen007@gmail.com,abuabdullah.be@yahoo.com,100,owe,"Mashreeq card 100 AED they took","2026-07-25 00:00:00+00","2026-09-07 14:28:43.462656+00",abuabdullah.be@yahoo.com,"Transferrd to niyas")']::public.bill_deleted_history[]);
insert into public.bill_user_prefs overriding system value select * from unnest(array['(abuabdullah.be@yahoo.com,neo-dark,,0.7,"2026-08-09 13:48:50.867453+00")']::public.bill_user_prefs[]);
insert into public.expenses overriding system value select * from unnest(array['(1,Fuel,50,khan,"{khan,kaatuva,naina,asif}",2026-03-23,fuel,2026-03,"2026-03-23 09:01:25.567034+00")',
 '(2,Fuel,50,khan,"{khan,kaatuva,naina,asif}",2026-03-23,fuel,2026-03,"2026-03-23 09:01:25.689478+00")',
 '(4,"Karama night",63,khan,"{khan,kaatuva,asif,niyaz}",2026-03-25,food,2026-03,"2026-03-25 00:59:51.937228+00")',
 '(5,Fish,117,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-02-21,food,2026-02,"2026-03-25 01:00:40.616394+00")',
 '(6,Food,34,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-02-21,food,2026-02,"2026-03-25 01:01:00.093477+00")',
 '(7,Fuel,100,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-02-21,fuel,2026-02,"2026-03-25 01:01:18.128439+00")',
 '(8,Drinks,18,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-02-21,drinks,2026-02,"2026-03-25 01:01:37.443928+00")',
 '(9,"Ice cream",17,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-02-21,drinks,2026-02,"2026-03-25 01:01:58.340599+00")',
 '(10,"Attho shop",103,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-02-28,food,2026-02,"2026-03-25 01:02:32.830706+00")',
 '(11,"Ice cream Nesto",39,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-02-28,food,2026-02,"2026-03-25 01:02:45.505981+00")',
 '(12,Fuel,63,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-02-28,fuel,2026-02,"2026-03-25 01:03:02.594177+00")',
 '(13,Fuel,63,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-02-28,fuel,2026-02,"2026-03-25 01:03:11.183836+00")',
 '(14,Fuel,46,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-03-07,fuel,2026-03,"2026-03-25 01:03:51.875811+00")',
 '(15,Fuel,40,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-03-08,fuel,2026-03,"2026-03-25 01:04:14.786944+00")',
 '(16,Fuel,50,khan,"{khan,kaatuva,asif,niyaz}",2026-03-15,fuel,2026-03,"2026-03-25 01:04:30.827221+00")',
 '(17,"Expo sharjah",20,khan,"{khan,kaatuva,asif,niyaz}",2026-03-15,other,2026-03,"2026-03-25 01:05:23.751392+00")',
 '(18,"Expo dress",78,khan,"{kaatuva,asif}",2026-03-15,other,2026-03,"2026-03-25 01:06:16.169639+00")',
 '(19,"Naina dress",88,khan,{naina},2026-03-15,other,2026-03,"2026-03-25 01:06:43.819734+00")',
 '(20,"Keeta food",59.5,khan,{naina},2026-02-22,food,2026-02,"2026-03-25 01:07:48.667002+00")',
 '(21,"Sharjah sahar",246,khan,{naina},2026-02-22,food,2026-02,"2026-03-25 01:08:02.742321+00")',
 '(22,"Orange dress",175,khan,{naina},2026-02-15,other,2026-02,"2026-03-25 01:08:33.845687+00")',
 '(24,"Nol card",20,khan,{asif},2026-03-11,other,2026-03,"2026-03-25 01:11:02.309157+00")',
 '(26,"DCC food",49,khan,{niyaz},2026-03-17,other,2026-03,"2026-03-25 01:12:18.28377+00")',
 '(27,"Eco lungi",25,khan,{niyaz},2026-03-17,other,2026-03,"2026-03-25 01:12:33.168971+00")',
 '(28,"DCC cloth",170,khan,{niyaz},2026-03-17,other,2026-03,"2026-03-25 01:12:50.672996+00")',
 '(29,"Labour market",65,khan,"{khan,kaatuva,naina}",2026-02-28,food,2026-02,"2026-03-25 01:29:19.889123+00")',
 '(31,"Food attho",93.5,khan,"{khan,kaatuva,niyaz}",2026-04-18,food,2026-04,"2026-04-24 19:38:25.469845+00")',
 '(32,"Food fish",96,khan,"{khan,kaatuva,niyaz}",2026-04-20,food,2026-04,"2026-04-24 19:38:46.385503+00")',
 '(33,Fuel,50,kaatuva,"{khan,kaatuva,niyaz}",2026-04-20,food,2026-04,"2026-04-24 19:39:14.683816+00")',
 '(34,Fuel,75,khan,"{khan,kaatuva,naina}",2026-04-26,fuel,2026-04,"2026-04-30 19:43:46.230182+00")',
 '(35,"Fried rice",80,khan,"{khan,kaatuva,naina,niyaz}",2026-05-02,food,2026-05,"2026-05-04 16:33:37.255774+00")',
 '(36,Fuel,30,khan,"{khan,kaatuva,naina}",2026-05-02,fuel,2026-05,"2026-05-04 16:34:44.002311+00")',
 '(37,Fuel,50,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-05-24,fuel,2026-05,"2026-05-26 20:51:51.690486+00")',
 '(38,Kabaab,83,khan,"{khan,kaatuva,asif,niyaz}",2026-05-17,food,2026-05,"2026-05-26 20:53:09.946514+00")',
 '(39,"Fuel claim",100,khan,{asif},2026-05-17,fuel,2026-05,"2026-05-26 20:55:05.939509+00")',
 '(40,"Dinner fish grill",78,khan,"{khan,kaatuva,naina,niyaz}",2026-05-23,food,2026-05,"2026-05-27 17:48:42.45119+00")',
 '(41,Maqlooba,99,khan,"{khan,kaatuva,niyaz}",2026-06-07,food,2026-06,"2026-06-10 03:13:40.940153+00")',
 '(42,Slipper,39.25,khan,{asif},2026-06-07,other,2026-06,"2026-06-10 03:14:25.910911+00")',
 '(43,Laffah,70,khan,"{khan,kaatuva,niyaz}",2026-06-07,food,2026-06,"2026-06-10 03:14:57.225145+00")',
 '(44,"Ice cream",34,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-06-21,food,2026-06,"2026-06-22 19:09:47.17657+00")',
 '(45,"Ice cream",34,khan,"{khan,kaatuva,naina,asif,niyaz}",2026-06-21,food,2026-06,"2026-06-22 19:09:47.176386+00")',
 '(46,Fuel,130,khan,"{khan,naina,asif,niyaz}",2026-08-23,fuel,2026-08,"2026-08-23 16:26:23.241965+00")',
 '(47,"Talal dinner",68.5,khan,"{khan,naina,asif}",2026-08-22,food,2026-08,"2026-08-23 16:27:30.736255+00")',
 '(48,Fuel,125,khan,"{khan,naina}",2026-09-13,fuel,2026-09,"2026-09-20 15:41:51.76431+00")',
 '(49,Fuel,80,khan,"{khan,naina}",2026-09-27,fuel,2026-09,"2026-09-28 18:38:53.064298+00")']::public.expenses[]);
insert into public.prev_balances overriding system value select * from unnest(array['(2,naina,khan,200,2026-02,"2026-03-25 00:58:06.558195+00")',
 '(4,niyaz,khan,62.5,2026-02,"2026-03-25 00:58:34.98158+00")',
 '(7,kaatuva,khan,777.95,2026-02,"2026-03-25 01:22:30.601514+00")',
 '(9,naina,khan,246,2026-02,"2026-03-26 16:17:37.51887+00")',
 '(10,naina,khan,175,2026-02,"2026-03-26 16:17:44.449848+00")',
 '(11,naina,khan,54,2026-02,"2026-03-26 16:18:06.026981+00")',
 '(12,naina,khan,102,2026-02,"2026-03-26 18:09:06.13993+00")']::public.prev_balances[]);
insert into public.settlements overriding system value select * from unnest(array['(1,naina,khan,200,2026-03,"2026-03-26 16:18:51.021922+00")',
 '(3,kaatuva,khan,150,2026-03,"2026-04-19 13:29:17.089738+00")',
 '(4,kaatuva,khan,150,2026-03,"2026-05-21 19:24:16.851972+00")',
 '(5,kaatuva,khan,83,2026-05,"2026-05-26 20:53:58.904095+00")',
 '(6,niyaz,khan,300,2026-05,"2026-05-27 17:49:37.093729+00")',
 '(8,kaatuva,khan,150,2026-05,"2026-06-10 03:16:17.204916+00")',
 '(9,kaatuva,khan,150,2026-06,"2026-06-10 03:19:47.88395+00")',
 '(10,naina,khan,300,2026-06,"2026-07-12 08:33:20.887106+00")',
 '(11,asif,khan,75,2026-07,"2026-07-17 06:22:10.623135+00")',
 '(12,asif,khan,150,2026-07,"2026-07-28 04:19:53.948073+00")',
 '(13,niyaz,khan,100,2026-09,"2026-09-10 07:08:34.014662+00")']::public.settlements[]);

-- RESET SEQUENCES so new rows continue after the imported ids (handles serial tables and identity tables)
do $$ declare r record; sq text; begin
  for r in select table_name, column_default, is_identity from information_schema.columns
            where table_schema='public' and column_name='id' and (is_identity='YES' or column_default like 'nextval(%') loop
    sq := case when r.is_identity='YES' then pg_get_serial_sequence('public.'||quote_ident(r.table_name),'id')
               else substring(r.column_default from 'nextval\(''([^'']+)''') end;
    if sq is not null then
      execute format('select setval(%L, coalesce((select max(id) from public.%I),1), (select max(id) is not null from public.%I))', sq, r.table_name, r.table_name);
    end if;
  end loop;
end $$;

-- ============================================================================
-- TRIGGERS  (created AFTER data load so restore does not generate notifications)
-- ============================================================================
CREATE TRIGGER trg_notify_payee_entry AFTER INSERT OR UPDATE ON public.bill_payee_entries FOR EACH ROW EXECUTE FUNCTION notify_payee_entry_change();
CREATE TRIGGER trg_notify_owed AFTER INSERT OR UPDATE ON public.bill_owed FOR EACH ROW EXECUTE FUNCTION notify_owed_change();
CREATE TRIGGER trg_notify_settlement AFTER INSERT ON public.bill_settlements FOR EACH ROW EXECUTE FUNCTION notify_settlement_change();
CREATE TRIGGER trg_notify_expense AFTER INSERT OR DELETE OR UPDATE ON public.bill_expenses FOR EACH ROW EXECUTE FUNCTION notify_expense_change();
CREATE TRIGGER trg_notify_card AFTER INSERT OR DELETE OR UPDATE ON public.bill_cards FOR EACH ROW EXECUTE FUNCTION notify_card_change();
CREATE TRIGGER trg_notify_card_payment AFTER UPDATE ON public.bill_card_payments FOR EACH ROW EXECUTE FUNCTION notify_card_payment_change();
CREATE TRIGGER trg_notify_card_share AFTER INSERT OR DELETE ON public.bill_card_shares FOR EACH ROW EXECUTE FUNCTION notify_card_share_change();
CREATE TRIGGER trg_dispatch_push AFTER INSERT ON public.bill_notifications FOR EACH ROW EXECUTE FUNCTION dispatch_push_for_notification();
CREATE TRIGGER trg_notify_plan AFTER INSERT OR DELETE OR UPDATE ON public.bill_plans FOR EACH ROW EXECUTE FUNCTION notify_plan_change();
CREATE TRIGGER trg_notify_plan_payment AFTER UPDATE ON public.bill_plan_payments FOR EACH ROW EXECUTE FUNCTION notify_plan_payment_change();

-- ============================================================================
-- ROW LEVEL SECURITY + POLICIES
-- ============================================================================
alter table public.expenses enable row level security;
alter table public.prev_balances enable row level security;
alter table public.bill_card_payments enable row level security;
alter table public.app_users enable row level security;
alter table public.bill_cards enable row level security;
alter table public.bill_expenses enable row level security;
alter table public.bill_report_log enable row level security;
alter table public.bill_settlements enable row level security;
alter table public.bill_owed enable row level security;
alter table public.bill_notifications enable row level security;
alter table public.bill_user_prefs enable row level security;
alter table public.settlements enable row level security;
alter table public.members_config enable row level security;
alter table public.bill_deleted_history enable row level security;
alter table public.bill_card_shares enable row level security;
alter table public.bill_push_subscriptions enable row level security;
alter table public.bill_payee_entries enable row level security;
alter table public.bill_payees enable row level security;
alter table public.bill_plans enable row level security;
alter table public.bill_plan_payments enable row level security;

create policy "Allow all" on public.expenses as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Allow all" on public.prev_balances as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Allow all" on public.settlements as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Allow all" on public.members_config as PERMISSIVE for ALL to public using (true) with check (true);
create policy app_users_select on public.app_users as PERMISSIVE for SELECT to authenticated using (true);
create policy app_users_insert on public.app_users as PERMISSIVE for INSERT to authenticated with check (( SELECT is_bill_admin() AS is_bill_admin));
create policy app_users_update on public.app_users as PERMISSIVE for UPDATE to authenticated using (( SELECT is_bill_admin() AS is_bill_admin));
create policy app_users_delete on public.app_users as PERMISSIVE for DELETE to authenticated using (( SELECT is_bill_admin() AS is_bill_admin));
create policy bill_settlements_insert on public.bill_settlements as PERMISSIVE for INSERT to authenticated with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_settlements.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_report_log_admin_only on public.bill_report_log as PERMISSIVE for ALL to authenticated using (( SELECT is_bill_admin() AS is_bill_admin)) with check (( SELECT is_bill_admin() AS is_bill_admin));
create policy bill_expenses_all on public.bill_expenses as PERMISSIVE for ALL to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_expenses.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin))) with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_expenses.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_settlements_select on public.bill_settlements as PERMISSIVE for SELECT to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_settlements.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_owed_insert on public.bill_owed as PERMISSIVE for INSERT to public with check ((is_bill_admin() OR is_admin_delegate()));
create policy bill_owed_update on public.bill_owed as PERMISSIVE for UPDATE to public using ((is_bill_admin() OR is_admin_delegate()));
create policy bill_owed_delete on public.bill_owed as PERMISSIVE for DELETE to public using ((is_bill_admin() OR is_admin_delegate()));
create policy bill_owed_select on public.bill_owed as PERMISSIVE for SELECT to public using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR is_delegate_for(user_email) OR is_bill_admin() OR is_admin_delegate()));
create policy bill_payees_all on public.bill_payees as PERMISSIVE for ALL to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_payees.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin) OR (lower(COALESCE(party_email, ''::text)) = ( SELECT my_email() AS my_email)))) with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_payees.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_notifications_select on public.bill_notifications as PERMISSIVE for SELECT to authenticated using (((lower(recipient_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_notifications_insert on public.bill_notifications as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1 FROM app_users WHERE (lower(app_users.email) = lower(bill_notifications.recipient_email)))));
create policy bill_notifications_delete on public.bill_notifications as PERMISSIVE for DELETE to public using (((lower(recipient_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_notifications_update on public.bill_notifications as PERMISSIVE for UPDATE to authenticated using ((lower(recipient_email) = ( SELECT my_email() AS my_email))) with check ((lower(recipient_email) = ( SELECT my_email() AS my_email)));
create policy bill_cards_select on public.bill_cards as PERMISSIVE for SELECT to authenticated using (true);
create policy bill_cards_insert on public.bill_cards as PERMISSIVE for INSERT to authenticated with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_cards.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_cards_update on public.bill_cards as PERMISSIVE for UPDATE to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_cards.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin))) with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_cards.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_cards_delete on public.bill_cards as PERMISSIVE for DELETE to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_cards.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_push_subscriptions_all on public.bill_push_subscriptions as PERMISSIVE for ALL to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_push_subscriptions.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin))) with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_push_subscriptions.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_settlements_delete on public.bill_settlements as PERMISSIVE for DELETE to public using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR is_delegate_for(user_email) OR is_bill_admin()));
create policy bill_payee_entries_select on public.bill_payee_entries as PERMISSIVE for SELECT to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_payee_entries.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin) OR (EXISTS ( SELECT 1 FROM bill_payees bp WHERE ((bp.id = bill_payee_entries.payee_id) AND (lower(COALESCE(bp.party_email, ''::text)) = ( SELECT my_email() AS my_email)))))));
create policy bill_payee_entries_insert on public.bill_payee_entries as PERMISSIVE for INSERT to authenticated with check ((( SELECT is_bill_admin() AS is_bill_admin) OR (EXISTS ( SELECT 1 FROM bill_payees bp WHERE ((bp.id = bill_payee_entries.payee_id) AND (lower(bp.user_email) = lower(bill_payee_entries.user_email)) AND ((lower(bp.user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bp.user_email) AS is_delegate_for) OR (lower(COALESCE(bp.party_email, ''::text)) = ( SELECT my_email() AS my_email))))))));
create policy bill_payee_entries_update on public.bill_payee_entries as PERMISSIVE for UPDATE to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_payee_entries.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin) OR (EXISTS ( SELECT 1 FROM bill_payees bp WHERE ((bp.id = bill_payee_entries.payee_id) AND (lower(COALESCE(bp.party_email, ''::text)) = ( SELECT my_email() AS my_email))))))) with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_payee_entries.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin) OR (EXISTS ( SELECT 1 FROM bill_payees bp WHERE ((bp.id = bill_payee_entries.payee_id) AND (lower(COALESCE(bp.party_email, ''::text)) = ( SELECT my_email() AS my_email)))))));
create policy bill_payee_entries_delete on public.bill_payee_entries as PERMISSIVE for DELETE to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_payee_entries.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin) OR (EXISTS ( SELECT 1 FROM bill_payees bp WHERE ((bp.id = bill_payee_entries.payee_id) AND (lower(COALESCE(bp.party_email, ''::text)) = ( SELECT my_email() AS my_email)))))));
create policy bill_card_shares_shared_select on public.bill_card_shares as PERMISSIVE for SELECT to public using ((lower(shared_with_email) = my_email()));
create policy bill_card_shares_owner_all on public.bill_card_shares as PERMISSIVE for ALL to public using (((lower(owner_email) = my_email()) OR is_delegate_for(owner_email) OR is_bill_admin())) with check (((lower(owner_email) = my_email()) OR is_delegate_for(owner_email) OR is_bill_admin()));
create policy bill_card_payments_all on public.bill_card_payments as PERMISSIVE for ALL to authenticated using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_card_payments.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin))) with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_card_payments.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_deleted_history_select on public.bill_deleted_history as PERMISSIVE for SELECT to authenticated using (((lower(owner_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_deleted_history.owner_email) AS is_delegate_for) OR (lower(COALESCE(party_email, ''::text)) = ( SELECT my_email() AS my_email)) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_user_prefs_all on public.bill_user_prefs as PERMISSIVE for ALL to authenticated using ((lower(user_email) = ( SELECT my_email() AS my_email))) with check ((lower(user_email) = ( SELECT my_email() AS my_email)));
create policy bill_plans_all on public.bill_plans as PERMISSIVE for ALL to public using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_plans.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin))) with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_plans.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));
create policy bill_plans_card_owner_select on public.bill_plans as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1 FROM bill_cards c WHERE ((c.id = bill_plans.card_id) AND (lower(c.user_email) = ( SELECT my_email() AS my_email))))));
create policy bill_plan_payments_all on public.bill_plan_payments as PERMISSIVE for ALL to public using (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_plan_payments.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin))) with check (((lower(user_email) = ( SELECT my_email() AS my_email)) OR ( SELECT is_delegate_for(bill_plan_payments.user_email) AS is_delegate_for) OR ( SELECT is_bill_admin() AS is_bill_admin)));

-- ============================================================================
-- STORAGE (profile backgrounds)
-- ============================================================================
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
  values ('user-backgrounds','user-backgrounds',true,5242880,'{image/jpeg,image/png,image/webp,image/gif}') on conflict (id) do nothing;
create policy user_backgrounds_read on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'user-backgrounds'::text));
create policy user_backgrounds_write on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'user-backgrounds'::text) AND (lower((storage.foldername(name))[1]) = ( SELECT my_email() AS my_email))));
create policy user_backgrounds_update on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'user-backgrounds'::text) AND (lower((storage.foldername(name))[1]) = ( SELECT my_email() AS my_email))));
create policy user_backgrounds_delete on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'user-backgrounds'::text) AND (lower((storage.foldername(name))[1]) = ( SELECT my_email() AS my_email))));

-- ============================================================================
-- REALTIME + CRON
-- ============================================================================
alter publication supabase_realtime add table public.bill_notifications;

-- Daily 07:00 UTC push reminders. Replace __PUSH_SECRET__ (same token as dispatch_push_for_notification) and the project ref.
select cron.schedule('daily-push-reminders', '0 7 * * *', $cron$
  SELECT net.http_post(
    url := 'https://lznnetxeklmdrykxtsbm.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Authorization', 'Bearer __PUSH_SECRET__', 'Content-Type','application/json'),
    body := jsonb_build_object('mode','due_reminders')
  );
$cron$);

-- ============================================================================
-- v7.7 — EXPENSE TRACKER MODULE (period trackers + occasions)
-- ============================================================================
create table if not exists public.et_categories (
  id bigint generated always as identity primary key,
  user_email text not null, name text not null, icon text not null default '🏷️',
  created_at timestamptz not null default now(), unique (user_email, name));
create table if not exists public.et_trackers (
  id bigint generated always as identity primary key,
  user_email text not null,
  kind text not null default 'period' check (kind in ('period','occasion')),
  title text not null, currency text not null default 'AED',
  start_date date not null, end_date date not null,
  participants text[] not null default '{}', notes text default '',
  created_by_email text, created_at timestamptz not null default now(),
  check (end_date >= start_date));
create table if not exists public.et_entries (
  id bigint generated always as identity primary key,
  tracker_id bigint not null references public.et_trackers(id) on delete cascade,
  user_email text not null, category text not null,
  amount numeric not null check (amount > 0), entry_date date not null,
  note text default '', spent_by text, created_by_email text,
  created_at timestamptz not null default now());
create index if not exists et_trackers_user_idx on public.et_trackers (lower(user_email));
create index if not exists et_entries_tracker_idx on public.et_entries (tracker_id, entry_date);

-- Expense Tracker DATA (these tables are created just above, so their rows are loaded here)
insert into public.et_trackers overriding system value select * from unnest(array['(4,abuabdullah.be@yahoo.com,period,"Foods Mess October 2026",AED,2026-10-01,2026-10-31,{},"",abuabdullah.be@yahoo.com,"2026-10-01 06:46:03.718476+00")',
 '(5,abuabdullah.be@yahoo.com,period,"Groceries October 2026",AED,2026-10-01,2026-10-31,{},"",abuabdullah.be@yahoo.com,"2026-10-01 06:46:16.872824+00")',
 '(6,abuabdullah.be@yahoo.com,period,"Fashion & life style October 2026",AED,2026-10-01,2026-10-31,{},"",abuabdullah.be@yahoo.com,"2026-10-01 06:47:07.948601+00")',
 '(7,abuabdullah.be@yahoo.com,period,"Outing and hangouts October 2026",AED,2026-10-01,2026-10-31,{},"",abuabdullah.be@yahoo.com,"2026-10-01 06:47:19.057525+00")',
 '(8,abuabdullah.be@yahoo.com,period,"Others October 2026",AED,2026-10-01,2026-10-31,{},"",abuabdullah.be@yahoo.com,"2026-10-01 06:47:26.338027+00")']::public.et_trackers[]);
insert into public.et_categories overriding system value select * from unnest(array['(1,abuabdullah.be@yahoo.com,"Ice cream",🧁,"2026-10-04 12:02:17.609032+00")']::public.et_categories[]);
insert into public.et_entries overriding system value select * from unnest(array['(4,4,abuabdullah.be@yahoo.com,Breakfast,5,2026-10-01,Smoothie,abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-01 06:49:06.13318+00")',
 '(5,4,abuabdullah.be@yahoo.com,Lunch,28.98,2026-10-01,"Chicken breast 2",abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-01 09:18:41.670188+00")',
 '(6,4,abuabdullah.be@yahoo.com,Dinner,5,2026-10-01,"banana & cucumber",abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-02 07:18:36.621239+00")',
 '(7,5,abuabdullah.be@yahoo.com,Groceries,1.5,2026-10-01,Banana,abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-02 12:38:34.647014+00")',
 '(8,8,abuabdullah.be@yahoo.com,Breakfast,1,2026-10-01,Miswak,abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-02 12:38:59.520774+00")',
 '(9,4,abuabdullah.be@yahoo.com,Lunch,18,2026-10-03,"Pak liyari",abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 11:53:16.743987+00")',
 '(10,4,abuabdullah.be@yahoo.com,Dinner,18,2026-10-03,Aroose,abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 11:53:38.843693+00")',
 '(11,7,abuabdullah.be@yahoo.com,Dinner,159,2026-10-03,"Bait al mandi treat",abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 11:54:40.765694+00")',
 '(12,5,abuabdullah.be@yahoo.com,Groceries,3.08,2026-10-03,"Banana & laban",abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 11:56:13.685585+00")',
 '(13,5,abuabdullah.be@yahoo.com,Groceries,1,2026-10-03,Laban,abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 11:56:27.368866+00")',
 '(14,5,abuabdullah.be@yahoo.com,Groceries,3.75,2026-10-02,Milk,abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 12:00:12.640308+00")',
 '(15,5,abuabdullah.be@yahoo.com,Groceries,1.83,2026-10-02,Banana,abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 12:01:04.536741+00")',
 '(16,4,abuabdullah.be@yahoo.com,"Ice cream",6,2026-10-03,"Ice cream",abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 12:02:35.386205+00")',
 '(17,4,abuabdullah.be@yahoo.com,Lunch,8,2026-10-04,"Mutton pulao",abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 12:02:57.560925+00")',
 '(19,8,abuabdullah.be@yahoo.com,Lifestyle,66,2026-10-03,"Kids dress to india",abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 12:04:21.537269+00")',
 '(20,8,abuabdullah.be@yahoo.com,Lifestyle,22,2026-10-03,"Kids dress to india",abuabdullah.be@yahoo.com,abuabdullah.be@yahoo.com,"2026-10-04 12:04:31.358023+00")']::public.et_entries[]);
select setval(pg_get_serial_sequence('public.et_trackers','id'),  coalesce((select max(id) from public.et_trackers),1),  (select max(id) is not null from public.et_trackers));
select setval(pg_get_serial_sequence('public.et_categories','id'), coalesce((select max(id) from public.et_categories),1), (select max(id) is not null from public.et_categories));
select setval(pg_get_serial_sequence('public.et_entries','id'),    coalesce((select max(id) from public.et_entries),1),    (select max(id) is not null from public.et_entries));

create or replace function public.et_can(tid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from et_trackers t where t.id = tid and (
    lower(t.user_email) = (select my_email()) or is_delegate_for(t.user_email) or is_bill_admin()
    or (select my_email()) = any (t.participants)));
$$;
revoke execute on function public.et_can(bigint) from public, anon;
grant execute on function public.et_can(bigint) to authenticated;
alter table public.et_categories enable row level security;
alter table public.et_trackers enable row level security;
alter table public.et_entries enable row level security;
create policy et_categories_all on public.et_categories for all to authenticated
 using (lower(user_email) = (select my_email()) or (select is_delegate_for(et_categories.user_email)) or (select is_bill_admin()))
 with check (lower(user_email) = (select my_email()) or (select is_delegate_for(et_categories.user_email)) or (select is_bill_admin()));
create policy et_trackers_select on public.et_trackers for select to authenticated
 using (lower(user_email) = (select my_email()) or (select is_delegate_for(et_trackers.user_email)) or (select is_bill_admin()) or (select my_email()) = any (participants));
create policy et_trackers_write on public.et_trackers for all to authenticated
 using (lower(user_email) = (select my_email()) or (select is_delegate_for(et_trackers.user_email)) or (select is_bill_admin()))
 with check (lower(user_email) = (select my_email()) or (select is_delegate_for(et_trackers.user_email)) or (select is_bill_admin()));
create policy et_entries_select on public.et_entries for select to authenticated using ((select et_can(tracker_id)));
create policy et_entries_insert on public.et_entries for insert to authenticated with check ((select et_can(tracker_id)));
create policy et_entries_update on public.et_entries for update to authenticated
 using ((select et_can(tracker_id)) and (lower(created_by_email) = (select my_email()) or lower(user_email) = (select my_email()) or (select is_delegate_for(et_entries.user_email)) or (select is_bill_admin())))
 with check ((select et_can(tracker_id)));
create policy et_entries_delete on public.et_entries for delete to authenticated
 using ((select et_can(tracker_id)) and (lower(created_by_email) = (select my_email()) or lower(user_email) = (select my_email()) or (select is_delegate_for(et_entries.user_email)) or (select is_bill_admin())));


-- ============================================================================
-- v8.0 · DEVICE ALERTS (appended section — identical to migrations/v8_0_device_alerts.sql)
-- ============================================================================
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


-- ============================================================================
-- v8.1 · SECURITY HARDENING (appended section — identical to migrations/v8_1_security_hardening.sql)
-- ============================================================================
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


-- ============================================================================
-- v8.1b · appended section — identical to migrations/v8_1b_views_invoker_and_function_grants.sql
-- ============================================================================
-- ============================================================================
-- iFiNeX v8.1b — directory views run with the caller's rights; older SECURITY DEFINER functions are signed-in only.
-- (Applied to the live project on 2026-10-04 as migration "ifinex_v8_1b_views_invoker_and_function_grants".)
-- ============================================================================
alter view public.app_users_directory set (security_invoker = true);
alter view public.bill_cards_directory set (security_invoker = true);

revoke execute on function public.delete_owed_entry(bigint,text), public.delete_payee_entry(bigint,text), public.delete_settlement_entry(bigint,text), public.is_admin_delegate() from public, anon;
grant  execute on function public.delete_owed_entry(bigint,text), public.delete_payee_entry(bigint,text), public.delete_settlement_entry(bigint,text), public.is_admin_delegate() to authenticated, service_role;
