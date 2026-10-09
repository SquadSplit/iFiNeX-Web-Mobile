set -u
PGBIN=/usr/lib/postgresql/16/bin; export PGHOST=/tmp PGPORT=5544 PGUSER=postgres
su postgres -c "$PGBIN/pg_ctl -D /tmp/pgdata stop -m immediate" >/dev/null 2>&1
rm -rf /tmp/pgdata; mkdir -p /tmp/pgdata; chown postgres:postgres /tmp/pgdata
su postgres -c "$PGBIN/initdb -D /tmp/pgdata -A trust -E UTF8 >/dev/null" || exit 1
su postgres -c "$PGBIN/pg_ctl -D /tmp/pgdata -o '-p 5544 -k /tmp -c listen_addresses=' -l /tmp/pg.log start -w" >/dev/null || { tail /tmp/pg.log; exit 1; }
for KIND in no_data with_data; do
  DB=$KIND
  $PGBIN/psql -q -d postgres -c "create database $DB"
  $PGBIN/psql -q -d $DB -v ON_ERROR_STOP=1 -f stubs.sql || exit 1
  sed -e 's/^create extension if not exists pg_net.*$/-- (test) pg_net stubbed/' -e 's/^create extension if not exists pg_cron;.*$/-- (test) pg_cron stubbed/' iFiNeX_FULL_SCHEMA_${KIND}_${VER:-v8.0}.sql > /tmp/t_$KIND.sql
  $PGBIN/psql -q -d $DB -v ON_ERROR_STOP=1 -f /tmp/t_$KIND.sql > /tmp/out_$KIND.log 2>&1; RC=$?
  echo "== $KIND: psql exit=$RC, errors: $(grep -c -i 'error' /tmp/out_$KIND.log)"; grep -i -m3 'error' /tmp/out_$KIND.log | cut -c1-200
  $PGBIN/psql -At -d $DB -c "select 'tables='||count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE' union all select 'functions='||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' union all select 'policies='||count(*) from pg_policies where schemaname='public' union all select 'triggers='||count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not tgisinternal" | paste -sd' '
done
