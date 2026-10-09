\set ON_ERROR_STOP on
begin;
create schema t; grant usage on schema t to public;
create function t.as_user(p text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims', json_build_object('email',p)::text, true); execute 'set local role authenticated'; end $$;
create function t.as_anon()  returns void language plpgsql as $$ begin perform set_config('request.jwt.claims','',true); execute 'set local role anon'; end $$;
create function t.as_super() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create function t.denied(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when insufficient_privilege then return true; end $$;
create function t.failed(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function t.rows(q text) returns int language plpgsql as $$ declare n int; begin execute q; get diagnostics n = row_count; return n; end $$;
create function t.cnt(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute 'select count(*) from ('||q||') x' into n; return n; end $$;
grant execute on all functions in schema t to public;

do $$
declare r jsonb; pid bigint; eid bigint; ent bigint; hist int; nt int;
  ins_exp constant text := 'insert into expenses(name,amount,paid_by,split_between,date,month) values (''x'',1,''m1'',array[''m1''],current_date,''2026-10'')';
begin
  insert into app_users(email,name,is_admin,group_type,delegate_email) values
    ('admin@x.com','Admin',true,'squad_split',null), ('mem1@x.com','Mem1',false,'squad_split',null),
    ('mem2@x.com','Mem2',false,'squad_split','deleg@x.com'), ('gen@x.com','Gen',false,'general',null);
  insert into members_config(id,name,email,emoji,color,is_admin,sort_order) values ('admin','Admin','admin@x.com','👑','#4d96ff',true,0),('m1','Mem1','mem1@x.com','🔥','#ff6b6b',false,1);
  insert into expenses(name,amount,paid_by,split_between,date,month) values ('Dinner',100,'m1',array['m1','admin'],current_date,'2026-10') returning id into eid;
  insert into bill_payees(user_email,party_name,party_email) values ('mem1@x.com','Pal','mem2@x.com') returning id into pid;
  insert into bill_payee_entries(user_email,payee_id,amount,entry_type,date,month) values ('mem1@x.com',pid,50,'owe',current_date,'2026-10') returning id into ent;
  insert into bill_owed(user_email,amount,month) values ('mem1@x.com',10,'2026-10');
  insert into bill_settlements(user_email,amount,month) values ('mem1@x.com',5,'2026-10');

  -- S1 logged-out (anon) can touch NOTHING
  perform t.as_anon();
  assert t.denied('select * from expenses') and t.denied('select * from settlements') and t.denied('select * from prev_balances') and t.denied('select * from members_config'), 'S1a anon reads squad tables';
  assert t.denied(ins_exp), 'S1b anon inserts expense';
  assert t.denied('update expenses set name=''x''') and t.denied('delete from expenses'), 'S1c anon edits/deletes';
  assert t.denied('select * from app_users') and t.denied('select * from app_users_directory') and t.denied('select * from bill_cards') and t.denied('select * from bill_notifications'), 'S1d anon reads users/cards/notifications';
  perform t.as_super();

  -- S2 a stranger who just signed up (authenticated, not registered) gets nothing and can create nothing
  perform t.as_user('stranger@x.com');
  assert t.cnt('select * from expenses')=0 and t.cnt('select * from members_config')=0 and t.cnt('select * from app_users')=0 and t.cnt('select * from bill_cards')=0 and t.cnt('select * from app_users_directory')=0 and t.cnt('select * from settlements')=0, 'S2a stranger sees data';
  assert t.denied(ins_exp), 'S2b stranger inserts squad expense';
  assert t.denied('insert into bill_expenses(user_email,description,amount,date,month) values (''stranger@x.com'',''x'',1,current_date,''2026-10'')'), 'S2c stranger writes own bill rows';
  assert t.denied('insert into et_trackers(user_email,title,start_date,end_date,currency) values (''stranger@x.com'',''T'',current_date,current_date,''AED'')'), 'S2d stranger creates tracker';
  assert t.denied('insert into bill_notifications(recipient_email,title,message) values (''mem1@x.com'',''spoof'',''x'')'), 'S2e stranger spoofs notification';
  assert (select register_device('33333333-3333-3333-3333-333333333333', repeat('Z',43), 'x', 'android'))->>'error'='unknown_user', 'S2f stranger registers a device';
  perform t.as_super();

  -- S3 ordinary squad member
  perform t.as_user('mem1@x.com');
  assert t.cnt('select * from expenses')>=1, 'S3a member cannot read squad data';
  assert not t.denied(ins_exp), 'S3b member cannot add an expense';
  assert t.rows('update expenses set name=''hack''')=0 and t.rows('delete from expenses')=0, 'S3c member edits/deletes expenses';
  assert not t.denied('insert into settlements(from_member,to_member,amount,month) values (''m1'',''admin'',5,''2026-10'')'), 'S3d member cannot record a settlement';
  assert t.rows('delete from settlements')=0 and t.rows('update settlements set amount=1')=0, 'S3e member edits/deletes settlements';
  assert not t.denied('insert into prev_balances(from_member,to_member,amount,month) values (''m1'',''admin'',5,''2026-09'')'), 'S3f member cannot add a carry-forward';
  assert t.rows('update prev_balances set amount=1')=0 and t.rows('delete from prev_balances')=0, 'S3g member edits/deletes carry-forwards';
  assert t.cnt('select * from members_config')=2, 'S3h roster not readable';
  assert t.denied('insert into members_config(id,name,email,is_admin) values (''evil'',''Evil'',''evil@x.com'',true)'), 'S3i ADMIN TAKEOVER: member planted an admin roster row';
  assert t.rows('update members_config set is_admin=true where id=''m1''')=0 and t.rows('delete from members_config')=0, 'S3j member promotes self / wipes roster';
  assert t.denied('insert into app_users(email,name,is_admin) values (''evil@x.com'',''E'',true)') and t.rows('update app_users set is_admin=true where email=''mem1@x.com''')=0, 'S3k member makes an admin user';
  assert t.cnt('select * from app_users_directory')>=4, 'S3l directory broken for members';
  assert not t.denied('insert into bill_notifications(recipient_email,title,message) values (''mem1@x.com'',''self'',''x'')'), 'S3m cannot notify self';
  assert t.denied('insert into bill_notifications(recipient_email,title,message) values (''mem2@x.com'',''spoof'',''x'')'), 'S3n member spoofs notification to someone else';
  assert not t.failed('insert into et_trackers(user_email,title,start_date,end_date,currency) values (''mem1@x.com'',''T'',current_date,current_date,''AED'')'), 'S3o tracker with AED rejected';
  assert t.failed('insert into et_trackers(user_email,title,start_date,end_date,currency) values (''mem1@x.com'',''T'',current_date,current_date,''<img src=x onerror=alert(1)>'')'), 'S3p markup currency accepted';
  perform t.as_super();

  -- S4 admin keeps full control
  perform t.as_user('admin@x.com');
  assert t.rows('update expenses set name=''edited''')>=1 and t.rows('delete from settlements')>=1 and t.rows('delete from prev_balances')>=1, 'S4a admin cannot edit/delete squad data';
  assert not t.denied('insert into members_config(id,name,email,is_admin) values (''m9'',''N'',''n@x.com'',false)') and t.rows('update members_config set name=''Z'' where id=''m9''')=1 and t.rows('delete from members_config where id=''m9''')=1, 'S4b admin cannot manage the roster';
  assert not t.denied('insert into app_users(email,name,is_admin) values (''new@x.com'',''New'',false)'), 'S4c admin cannot add a user';
  perform t.as_super();

  -- S5 general (non-squad) user and S6 pure delegate (no app_users row of their own)
  perform t.as_user('gen@x.com');
  assert t.cnt('select * from expenses')=0 and t.denied(ins_exp), 'S5 general user touches squad data';
  perform t.as_super(); perform t.as_user('deleg@x.com');
  assert t.cnt('select * from expenses')>=1 and not t.denied(ins_exp) and t.cnt('select * from app_users')>0, 'S6 pure delegate lost access';
  perform t.as_super();

  -- S7 parties: only the owner side creates/edits; the linked party reads; nobody deletes directly; the function does it properly
  perform t.as_user('mem2@x.com');
  assert t.cnt('select * from bill_payees where id='||pid)=1, 'S7a linked party cannot see the party row';
  assert t.denied('insert into bill_payees(user_email,party_name,party_email) values (''mem1@x.com'',''Fake'',''mem2@x.com'')'), 'S7b linked party injects a party into the owner ledger';
  assert t.rows('update bill_payees set party_name=''hacked'' where id='||pid)=0, 'S7c linked party edits the owner party';
  assert t.rows('delete from bill_payees where id='||pid)=0, 'S7d linked party deletes the party directly';
  assert (select delete_payee_with_reason(pid,'because'))->>'error'='forbidden', 'S7e linked party can use the delete function';
  perform t.as_super(); perform t.as_user('mem1@x.com');
  assert t.rows('delete from bill_payees where id='||pid)=0, 'S7f owner deleted directly (must go through the function)';
  assert (select delete_payee_with_reason(pid,'  '))->>'error'='reason_required', 'S7g reason not required';
  assert t.rows('delete from bill_payee_entries where id='||ent)=0 and t.rows('delete from bill_settlements')=0 and t.rows('delete from bill_owed')=0, 'S7h raw ledger deletes still possible';
  r := delete_payee_with_reason(pid,'duplicate person'); assert r->>'ok'='true' and (r->>'archived')::int=1, 'S7i owner delete failed '||r::text;
  perform t.as_super();
  assert not exists (select 1 from bill_payees where id=pid), 'S7j party still there';
  assert (select count(*) from bill_deleted_history where owner_email='mem1@x.com' and reason like 'duplicate person%')=1, 'S7k entries not archived';
  assert (select count(*) from bill_notifications where recipient_email='mem2@x.com' and title like '%ledger was removed%')=1, 'S7l linked party not told';

  -- S8 the audited delete function still works for the entry owner (regression)
  insert into bill_payees(user_email,party_name,party_email) values ('mem1@x.com','Pal2','mem2@x.com') returning id into pid;
  insert into bill_payee_entries(user_email,payee_id,amount,entry_type,date,month) values ('mem1@x.com',pid,7,'owe',current_date,'2026-10') returning id into ent;
  perform t.as_user('mem1@x.com'); r := delete_payee_entry(ent,'wrong amount'); assert r->>'ok'='true', 'S8 delete_payee_entry regression '||r::text; perform t.as_super();
  raise notice 'ALL SECURITY SQL TESTS PASSED';
end $$;
rollback;
