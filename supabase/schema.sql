-- ぬりログ 本番スキーマ（Supabase / PostgreSQL）
-- 会社ごとのデータ分離・役割別権限を「行レベルセキュリティ(RLS)」で強制する。
-- Supabase の SQL Editor に貼り付けて実行する。何度実行しても安全(冪等)。
--
-- 役割: admin=フル権限 / worker=閲覧＋日報・写真の追加と自分の投稿の編集（案件の編集削除は不可）
-- 論理削除(deleted=true)で「削除→復元」に対応。物理削除はサービスロールのみ。

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- テーブル
-- ─────────────────────────────────────────────
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 認証ユーザー(auth.users)と会社・役割を結びつけるプロフィール
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  role        text not null default 'worker' check (role in ('admin','worker')),
  full_name   text,
  created_at  timestamptz not null default now()
);

create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  phone       text,
  address     text,
  note        text,
  deleted     boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.sites (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  name                text not null,
  customer            text,
  phone               text,
  address             text,
  manager             text,
  channel             text,
  status              text not null default 'lead',
  inquiry_date        date,
  survey_date         date,
  estimate_date       date,
  estimate_amount     bigint,
  contract_amount     bigint,
  construction_start  date,
  completion_date     date,
  invoice_date        date,
  payment_due_date    date,
  payment_date        date,
  payment_status      text,
  next_contact        date,
  deleted             boolean not null default false,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  site_id       uuid references public.sites(id) on delete cascade,
  date          date,
  worker        text,
  work_content  text,
  materials     text,
  hours         numeric,
  problems      text,
  deleted       boolean not null default false,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.estimates (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  site_id       uuid references public.sites(id) on delete cascade,
  total         bigint,
  sell          bigint,
  profit        bigint,
  margin        numeric,
  deleted       boolean not null default false,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  site_id       uuid references public.sites(id) on delete cascade,
  report_id     uuid,
  phase         text,
  comment       text,
  storage_path  text,   -- Storage上のパス: <company_id>/<photo_id>.jpg
  size          integer,
  deleted       boolean not null default false,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 既存DBへの後方互換マイグレーション（請求・入金まわりの列を後から追加しても安全）
alter table public.sites add column if not exists contract_amount  bigint;
alter table public.sites add column if not exists completion_date  date;
alter table public.sites add column if not exists invoice_date     date;
alter table public.sites add column if not exists payment_due_date date;
alter table public.sites add column if not exists payment_date     date;
alter table public.sites add column if not exists payment_status   text;
-- 顧客への紐付け（クライアント採番の文字列IDも保持できるよう text）
alter table public.sites add column if not exists customer_id      text;
alter table public.sites add column if not exists memo             text;
alter table public.sites add column if not exists work_start       text;
alter table public.sites add column if not exists work_end         text;
alter table public.sites add column if not exists invoice_note     text;
-- 写真の撮影者（職人名）
alter table public.photos add column if not exists taken_by         text;

-- 会社テーブルの拡張（プラン区分・事業者情報・招待コード）
alter table public.companies add column if not exists plan_type text not null default 'individual';
alter table public.companies add column if not exists business_name text;
alter table public.companies add column if not exists phone text;
alter table public.companies add column if not exists postal_code text;
alter table public.companies add column if not exists address text;
alter table public.companies add column if not exists invoice_registration_number text;
alter table public.companies add column if not exists logo_url text;
alter table public.companies add column if not exists invite_code text;
-- 招待コードを未設定の会社に発番（8桁HEX大文字、衝突回避のため一意制約）
update public.companies set invite_code = upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))
  where invite_code is null;
create unique index if not exists idx_companies_invite on public.companies(invite_code);

-- 顧客テーブルの拡張（問合せ経路・問合せ日・連絡先など）
alter table public.customers add column if not exists channel       text;
alter table public.customers add column if not exists inquiry_date  date;
alter table public.customers add column if not exists email         text;
alter table public.customers add column if not exists postal_code   text;
alter table public.customers add column if not exists customer_type text;

-- 現地調査（劣化状態は複数選択 → jsonb 配列で保存）
create table if not exists public.surveys (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  site_id         uuid references public.sites(id) on delete cascade,
  building_type   text,
  building_age    integer,
  floors          integer,
  wall_material   text,
  roof_material   text,
  painting_area   numeric,
  scaffolding_required boolean,
  parking_information  text,
  deterioration   jsonb,
  memo            text,
  surveyed_by     text,
  surveyed_at     timestamptz,
  deleted         boolean not null default false,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_surveys_company   on public.surveys(company_id, updated_at);

-- 工程（縦型工程表）
create table if not exists public.processes (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  site_id         uuid references public.sites(id) on delete cascade,
  process_type    text,
  scheduled_date  date,
  completed_date  date,
  status          text,
  delay_reason    text,
  memo            text,
  sort_order      integer,
  deleted         boolean not null default false,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_processes_company on public.processes(company_id, updated_at);

-- 追加工事（写真・金額・顧客承認）
create table if not exists public.extras (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  site_id         uuid references public.sites(id) on delete cascade,
  content         text,
  amount          bigint,
  reason          text,
  status          text default 'pending',   -- pending / approved / rejected
  billed          boolean not null default false,
  photo_id        text,
  approved_by     text,
  approved_at     date,
  deleted         boolean not null default false,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_extras_company   on public.extras(company_id, updated_at);

create index if not exists idx_sites_company     on public.sites(company_id, updated_at);
create index if not exists idx_reports_company   on public.reports(company_id, updated_at);
create index if not exists idx_estimates_company on public.estimates(company_id, updated_at);
create index if not exists idx_photos_company    on public.photos(company_id, updated_at);
create index if not exists idx_customers_company on public.customers(company_id, updated_at);

-- ─────────────────────────────────────────────
-- updated_at 自動更新トリガー（端末時計に依存せずサーバー時刻で記録）
-- ─────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['customers','sites','reports','estimates','photos','surveys','processes','extras'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────
-- 補助関数: 呼び出し元の会社ID・役割（RLSで使用）
-- ─────────────────────────────────────────────
create or replace function public.current_company()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ─────────────────────────────────────────────
-- RLS 有効化
-- ─────────────────────────────────────────────
alter table public.companies enable row level security;
alter table public.profiles  enable row level security;
alter table public.customers enable row level security;
alter table public.sites     enable row level security;
alter table public.reports   enable row level security;
alter table public.estimates enable row level security;
alter table public.photos    enable row level security;
alter table public.surveys   enable row level security;
alter table public.processes enable row level security;
alter table public.extras    enable row level security;

-- companies: 自社のみ閲覧
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (id = public.current_company());

-- profiles: 自社メンバーを閲覧。自分のプロフィールは本人、他はadminが更新可
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (company_id = public.current_company() or id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.current_role_name() = 'admin')
  with check (company_id = public.current_company());

-- 案件・顧客・見積: 閲覧=自社 / 追加・更新=adminのみ
do $$
declare t text;
begin
  foreach t in array array['sites','customers','estimates','surveys','processes'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select
                    using (company_id = public.current_company())', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format($f$create policy %1$s_insert on public.%1$s for insert
                    with check (company_id = public.current_company()
                                and public.current_role_name() = 'admin')$f$, t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format($f$create policy %1$s_update on public.%1$s for update
                    using (company_id = public.current_company()
                           and public.current_role_name() = 'admin')
                    with check (company_id = public.current_company())$f$, t);
  end loop;
end $$;

-- 日報・写真: 閲覧=自社 / 追加=自社メンバー全員 / 更新・論理削除=adminか投稿者本人
do $$
declare t text;
begin
  foreach t in array array['reports','photos','extras'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select
                    using (company_id = public.current_company())', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert
                    with check (company_id = public.current_company())', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format($f$create policy %1$s_update on public.%1$s for update
                    using (company_id = public.current_company()
                           and (public.current_role_name() = 'admin'
                                or created_by = auth.uid()))
                    with check (company_id = public.current_company())$f$, t);
  end loop;
end $$;

-- ※ 物理DELETEポリシーは作らない＝クライアントからの物理削除は不可。
--   「削除」は deleted=true のUPDATE（論理削除）で行い、復元も可能。

-- ─────────────────────────────────────────────
-- Storage: 写真バケット（非公開）と会社単位のアクセス制御
--   パス規約: <company_id>/<photo_id>.jpg  → 先頭フォルダ＝会社IDで分離
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('photos','photos', false)
on conflict (id) do nothing;

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select
  using (bucket_id = 'photos'
         and (storage.foldername(name))[1] = public.current_company()::text);

drop policy if exists photos_write on storage.objects;
create policy photos_write on storage.objects for insert
  with check (bucket_id = 'photos'
              and (storage.foldername(name))[1] = public.current_company()::text);

drop policy if exists photos_modify on storage.objects;
create policy photos_modify on storage.objects for update
  using (bucket_id = 'photos'
         and (storage.foldername(name))[1] = public.current_company()::text);

drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete
  using (bucket_id = 'photos'
         and (storage.foldername(name))[1] = public.current_company()::text
         and public.current_role_name() = 'admin');

-- ─────────────────────────────────────────────
-- 新規サインアップ時、profiles を自動作成（会社未割当）
--   会社への割当は管理者が後述の手順で行う。
-- ─────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────
-- セルフサービスのオンボーディング用 RPC（SECURITY DEFINER）
--   未所属ユーザーだけが「会社を新規作成」または「招待コードで参加」できる。
--   会社の物理作成や他人のprofiles更新はRLSで塞いだまま、ここだけ安全に許可する。
-- ─────────────────────────────────────────────
create or replace function public.create_my_company(p_name text, p_plan text default 'individual')
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; existing uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception '会社名が必要です'; end if;
  select company_id into existing from public.profiles where id = auth.uid();
  if existing is not null then raise exception '既に会社に所属しています'; end if;
  insert into public.companies (name, plan_type, invite_code)
    values (p_name, case when p_plan = 'corporate' then 'corporate' else 'individual' end,
            upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8)))
    returning id into cid;
  update public.profiles set company_id = cid, role = 'admin' where id = auth.uid();
  return cid;
end $$;

create or replace function public.join_company(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; existing uuid;
begin
  select company_id into existing from public.profiles where id = auth.uid();
  if existing is not null then raise exception '既に会社に所属しています'; end if;
  select id into cid from public.companies where invite_code = upper(trim(p_code));
  if cid is null then raise exception '招待コードが見つかりません'; end if;
  update public.profiles set company_id = cid, role = 'worker' where id = auth.uid();
  return cid;
end $$;

grant execute on function public.create_my_company(text, text) to authenticated;
grant execute on function public.join_company(text) to authenticated;
