-- デモ用データ（本番データと分離するため is_demo=true の会社に投入）。
-- 本番運用前の動作確認や営業デモに使う。本番会社とは別IDで完全分離される。
-- 実行前に、デモ用の管理者アカウントを Supabase Auth で作成し、その user_id を控える。

-- 1) デモ会社
insert into public.companies (id, name, is_demo)
values ('d3m00000-0000-0000-0000-000000000000', 'デモ塗装（サンプル）', true)
on conflict (id) do nothing;

-- 2) デモ管理者を会社に割当（:demo_admin_uid を実際のauth user idに置換して実行）
--    例) psql ... -v demo_admin_uid="'xxxxxxxx-....'"
-- update public.profiles
--   set company_id = 'd3m00000-0000-0000-0000-000000000000', role = 'admin', full_name = 'デモ管理者'
--   where id = :demo_admin_uid;

-- 3) デモ案件
insert into public.sites (id, company_id, name, customer, phone, address, manager, channel, status,
                          inquiry_date, survey_date, estimate_date, estimate_amount, construction_start, next_contact)
values
 ('d3170000-0000-0000-0000-000000000001','d3m00000-0000-0000-0000-000000000000',
  '田中様邸 外壁塗装','田中 健一','090-1234-5678','横浜市青葉区美しが丘2-1','佐藤','チラシ','work',
  '2026-05-02','2026-05-08','2026-05-12',1280000,'2026-06-10','2026-06-15'),
 ('d3170000-0000-0000-0000-000000000002','d3m00000-0000-0000-0000-000000000000',
  '鈴木様邸 屋根・外壁','鈴木 美和','080-2222-3333','川崎市麻生区上麻生5-12','佐藤','紹介','quoted',
  '2026-06-01','2026-06-06','2026-06-09',1650000,null,'2026-06-16')
on conflict (id) do nothing;
