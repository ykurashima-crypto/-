-- データ投入（サービスロール相当: テーブル所有者として実行＝RLSバイパス）
insert into auth.users(id) values
  ('11111111-1111-1111-1111-111111111111'), -- A社 admin
  ('22222222-2222-2222-2222-222222222222'), -- A社 worker
  ('33333333-3333-3333-3333-333333333333'); -- B社 admin

insert into public.companies(id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000','A塗装'),
  ('bbbbbbbb-0000-0000-0000-000000000000','B塗装');

-- schema.sqlのトリガーが auth.users 追加時に profiles を自動作成するため upsert で会社/役割を設定
insert into public.profiles(id, company_id, role, full_name) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000000','admin','A管理'),
  ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000000','worker','A職人'),
  ('33333333-3333-3333-3333-333333333333','bbbbbbbb-0000-0000-0000-000000000000','admin','B管理')
on conflict (id) do update set
  company_id = excluded.company_id, role = excluded.role, full_name = excluded.full_name;

insert into public.sites(id, company_id, name) values
  ('a5170000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000000','A社 田中様邸'),
  ('b5170000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000000','B社 鈴木様邸');

-- RLSを効かせるため、以降は authenticated ロールで実行する
grant usage on schema public, storage, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema storage to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;

\echo '================ TEST 1: 会社分離（A社workerはA社の案件のみ見える） ================'
set role authenticated;
select set_config('app.uid','22222222-2222-2222-2222-222222222222', false);
select count(*) as a_worker_sees_sites from public.sites;  -- 期待 1
reset role;

\echo '================ TEST 2: B社adminはB社のみ ================'
set role authenticated;
select set_config('app.uid','33333333-3333-3333-3333-333333333333', false);
select count(*) as b_admin_sees_sites from public.sites; -- 期待 1
select name as b_admin_site_name from public.sites;       -- 期待 B社のみ
reset role;

\echo '================ TEST 3: workerは案件を追加できない（adminのみ） ================'
set role authenticated;
select set_config('app.uid','22222222-2222-2222-2222-222222222222', false);
do $$ begin
  begin
    insert into public.sites(company_id, name)
      values ('aaaaaaaa-0000-0000-0000-000000000000','不正案件');
    raise notice 'RESULT: worker_insert_site = ALLOWED (NG)';
  exception when others then
    raise notice 'RESULT: worker_insert_site = DENIED (OK)';
  end;
end $$;
reset role;

\echo '================ TEST 4: adminは案件を追加できる ================'
set role authenticated;
select set_config('app.uid','11111111-1111-1111-1111-111111111111', false);
do $$ begin
  begin
    insert into public.sites(company_id, name)
      values ('aaaaaaaa-0000-0000-0000-000000000000','A社 追加案件');
    raise notice 'RESULT: admin_insert_site = ALLOWED (OK)';
  exception when others then
    raise notice 'RESULT: admin_insert_site = DENIED (NG)';
  end;
end $$;
reset role;

\echo '================ TEST 5: workerは日報を追加できる ================'
set role authenticated;
select set_config('app.uid','22222222-2222-2222-2222-222222222222', false);
do $$ begin
  begin
    insert into public.reports(company_id, site_id, work_content)
      values ('aaaaaaaa-0000-0000-0000-000000000000','a5170000-0000-0000-0000-000000000001','下塗り完了');
    raise notice 'RESULT: worker_insert_report = ALLOWED (OK)';
  exception when others then
    raise notice 'RESULT: worker_insert_report = DENIED (NG)';
  end;
end $$;
reset role;

\echo '================ TEST 6: workerは案件を論理削除できない（adminのみ） ================'
set role authenticated;
select set_config('app.uid','22222222-2222-2222-2222-222222222222', false);
do $$
declare n int;
begin
  update public.sites set deleted = true
    where id = 'a5170000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'RESULT: worker_delete_site = DENIED (OK, 0 rows)';
  else raise notice 'RESULT: worker_delete_site = ALLOWED (NG)'; end if;
end $$;
reset role;

\echo '================ TEST 7: B社adminはA社の案件を更新できない ================'
set role authenticated;
select set_config('app.uid','33333333-3333-3333-3333-333333333333', false);
do $$
declare n int;
begin
  update public.sites set name = 'のっとり'
    where id = 'a5170000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'RESULT: cross_company_update = DENIED (OK, 0 rows)';
  else raise notice 'RESULT: cross_company_update = ALLOWED (NG)'; end if;
end $$;
reset role;

\echo '================ TEST 8: Storage 会社分離（A社はA社フォルダのみ書込可） ================'
set role authenticated;
select set_config('app.uid','22222222-2222-2222-2222-222222222222', false);
do $$ begin
  begin
    insert into storage.objects(bucket_id, name)
      values ('photos','aaaaaaaa-0000-0000-0000-000000000000/p1.jpg');
    raise notice 'RESULT: storage_own_company_write = ALLOWED (OK)';
  exception when others then
    raise notice 'RESULT: storage_own_company_write = DENIED (NG)';
  end;
  begin
    insert into storage.objects(bucket_id, name)
      values ('photos','bbbbbbbb-0000-0000-0000-000000000000/p2.jpg');
    raise notice 'RESULT: storage_other_company_write = ALLOWED (NG)';
  exception when others then
    raise notice 'RESULT: storage_other_company_write = DENIED (OK)';
  end;
end $$;
reset role;

\echo '================ 全テスト完了 ================'
