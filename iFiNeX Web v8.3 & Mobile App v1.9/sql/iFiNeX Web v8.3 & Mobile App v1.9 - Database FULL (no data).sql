-- ============================================================================
-- iFiNeX (Squad Split + Bill Tracker + Expense Tracker) — FULL SCHEMA, NO DATA  (v8.1 · 2026-10-04)
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
