do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage, create on schema public to anon, authenticated, service_role;
create schema if not exists auth; create schema if not exists extensions; create schema if not exists storage; create schema if not exists net; create schema if not exists cron;
grant usage on schema auth, extensions to anon, authenticated, service_role;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(auth.jwt()->>'sub',''),'')::uuid $$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
create or replace function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', params jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ select 1::bigint $$;
create publication supabase_realtime;

-- mirror Supabase defaults: new objects are open to anon/authenticated/service_role (this default is why 'Allow all' was dangerous)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
