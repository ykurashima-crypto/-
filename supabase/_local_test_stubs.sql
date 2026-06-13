-- ローカルでSupabase環境を擬似し、schema.sql のRLSを検証する。
-- Supabaseが提供する auth スキーマ・auth.uid()・storage を最小実装で再現する。

-- auth スキーマと擬似ユーザーテーブル
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  raw_user_meta_data jsonb default '{}'::jsonb
);
-- auth.uid() は GUC 'app.uid' を読む（SupabaseのリクエストごとJWT subを擬似）
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;

-- storage スキーマ最小実装
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid default auth.uid()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

-- ロール: Supabaseでは認証済みは 'authenticated'。RLSはこのロールで効く。
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin;
  end if;
end $$;
