\set ON_ERROR_STOP on
begin;
do $$
declare
  dev1 constant uuid := '11111111-1111-1111-1111-111111111111';
  dev2 constant uuid := '22222222-2222-2222-2222-222222222222';
  s1 constant text := 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  s2 constant text := 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
  r jsonb; ids bigint[]; cur bigint; i int; cnt int; pages int := 0;
begin
  insert into app_users(email,name) values ('a@x.com','A'),('b@x.com','B');

  -- T1 register as A; only a SHA-256 hash is stored
  perform set_config('request.jwt.claims','{"email":"a@x.com"}',true); execute 'set local role authenticated';
  r := register_device(dev1,s1,'Pixel 7','android'); assert r->>'ok'='true','T1 '||r::text;
  execute 'reset role';
  assert (select secret_hash from bill_devices where device_id=dev1)=encode(sha256(convert_to(s1,'utf8')),'hex'),'T1b hash';
  assert (select secret_hash from bill_devices where device_id=dev1)<>s1,'T1c secret stored in clear!';

  -- T2 anon baseline: remembers "now", replays nothing
  perform set_config('request.jwt.claims','',true); execute 'set local role anon';
  r := poll_notifications(dev1,s1,-1);
  assert r->>'ok'='true' and r->>'baseline'='true' and (r->>'max_id')::bigint=0 and jsonb_array_length(r->'items')=0,'T2 '||r::text;
  execute 'reset role';

  -- T3/T4 only A's rows (case-insensitive), never B's
  insert into bill_notifications(recipient_email,title,message) values ('a@x.com','t1','m1'),('a@x.com','t2','m2'),('A@X.com','t3','m3'),('b@x.com','tb','mb');
  select array_agg(id order by id) into ids from bill_notifications where lower(recipient_email)='a@x.com';
  execute 'set local role anon';
  r := poll_notifications(dev1,s1,0);
  assert jsonb_array_length(r->'items')=3 and (r->>'max_id')::bigint=ids[3] and r->>'has_more'='false','T4 '||r::text;
  assert not exists (select 1 from jsonb_array_elements(r->'items') e where e->>'title'='tb'),'T4b LEAKED another user''s notification';
  execute 'reset role';

  -- T5 look-back re-sends rows younger than 3 min (app de-dupes by id); older rows are not re-sent
  execute 'set local role anon'; r := poll_notifications(dev1,s1,ids[3]); execute 'reset role';
  assert jsonb_array_length(r->'items')=3,'T5 overlap '||r::text;
  update bill_notifications set created_at=now()-interval '10 minutes';
  execute 'set local role anon'; r := poll_notifications(dev1,s1,ids[3]); execute 'reset role';
  assert jsonb_array_length(r->'items')=0 and (r->>'max_id')::bigint=ids[3],'T5b '||r::text;

  -- T6 late commit: a row with an id BELOW the cursor that shows up now is still delivered
  delete from bill_notifications where id=ids[2];
  insert into bill_notifications(id,recipient_email,title,message) values (ids[2],'a@x.com','late','late');
  execute 'set local role anon'; r := poll_notifications(dev1,s1,ids[3]); execute 'reset role';
  assert jsonb_array_length(r->'items')=1 and r->'items'->0->>'title'='late','T6 '||r::text;

  -- T7 bad credentials
  execute 'set local role anon';
  assert poll_notifications(dev1,'wrong-secret-wrong-secret-wrong-secret-xx',0)->>'error'='invalid_device','T7a';
  assert poll_notifications('99999999-9999-9999-9999-999999999999',s1,0)->>'error'='invalid_device','T7b';
  assert poll_notifications(null,null,0)->>'error'='invalid_device','T7c';
  execute 'reset role';

  -- T8 pagination 20/20/5 and the 7-day cut-off
  delete from bill_notifications where lower(recipient_email)='a@x.com';
  insert into bill_notifications(recipient_email,title,message) select 'a@x.com','p'||g,'x' from generate_series(1,45) g;
  insert into bill_notifications(recipient_email,title,message,created_at) values ('a@x.com','ancient','x',now()-interval '9 days');
  update bill_notifications set created_at=now()-interval '1 hour' where title<>'ancient';
  cur := 0; cnt := 0;
  execute 'set local role anon';
  for i in 1..6 loop
    r := poll_notifications(dev1,s1,cur); pages := pages + 1; cnt := cnt + jsonb_array_length(r->'items'); cur := (r->>'max_id')::bigint;
    exit when r->>'has_more'='false';
  end loop;
  execute 'reset role';
  assert cnt=45,'T8 total '||cnt; assert pages=3,'T8 pages '||pages;

  -- T9 ownership, secret rotation, revocation
  perform set_config('request.jwt.claims','{"email":"b@x.com"}',true); execute 'set local role authenticated';
  r := unregister_device(dev1); assert (r->>'removed')::int=0,'T9a B removed A''s device';
  r := register_device(dev1,s2,'x','android'); assert r->>'error'='device_owned_by_other','T9b '||r::text;
  execute 'reset role';
  perform set_config('request.jwt.claims','{"email":"a@x.com"}',true); execute 'set local role authenticated';
  r := register_device(dev1,s2,'Pixel 7','android'); assert r->>'ok'='true','T9c';
  execute 'reset role';
  execute 'set local role anon';
  assert poll_notifications(dev1,s1,0)->>'error'='invalid_device','T9d old secret still works after rotation';
  assert poll_notifications(dev1,s2,0)->>'ok'='true','T9e';
  execute 'reset role';
  perform set_config('request.jwt.claims','{"email":"a@x.com"}',true); execute 'set local role authenticated';
  r := unregister_device(dev1); assert (r->>'removed')::int=1,'T9f';
  execute 'reset role';
  execute 'set local role anon'; assert poll_notifications(dev1,s2,0)->>'error'='invalid_device','T9g still valid after unregister'; execute 'reset role';

  -- T10 strangers / anon / direct table access are blocked
  perform set_config('request.jwt.claims','{"email":"stranger@x.com"}',true); execute 'set local role authenticated';
  r := register_device(dev2,s1,'x','android'); assert r->>'error'='unknown_user','T10a '||r::text;
  begin perform * from bill_devices; assert false,'T10b authenticated could SELECT bill_devices'; exception when insufficient_privilege then null; end;
  begin insert into bill_devices(device_id,user_email,secret_hash) values (gen_random_uuid(),'a@x.com','x'); assert false,'T10c authenticated could INSERT'; exception when insufficient_privilege then null; end;
  r := register_device(dev2,'short',null,'android'); assert r->>'error'='bad_secret','T10d a stranger with a bad secret is rejected '||r::text;
  execute 'reset role';
  execute 'set local role anon';
  begin perform register_device(dev2,s1,'x','android'); assert false,'T10e anon could register'; exception when insufficient_privilege then null; end;
  begin perform unregister_device(dev1); assert false,'T10f anon could unregister'; exception when insufficient_privilege then null; end;
  begin perform * from bill_devices; assert false,'T10g anon could SELECT bill_devices'; exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- T11 secret length + 8-device cap
  perform set_config('request.jwt.claims','{"email":"a@x.com"}',true); execute 'set local role authenticated';
  r := register_device(dev2,'too-short',null,'android'); assert r->>'error'='bad_secret','T11a '||r::text;
  for i in 1..10 loop perform register_device(gen_random_uuid(), repeat(chr(64+i),43), 'd'||i, 'android'); end loop;
  execute 'reset role';
  assert (select count(*) from bill_devices where user_email='a@x.com')=8,'T11b cap';
  raise notice 'ALL % SQL TESTS PASSED', 'RPC';
end $$;
rollback;
