# データベース設計書

本番(Supabase / PostgreSQL)のスキーマ。定義は `supabase/schema.sql`（冪等・再実行安全）。
全業務テーブルは `company_id` を持ち、RLSで会社単位に分離。削除は `deleted` による論理削除。
レコードIDはクライアントが採番する **UUID v4**。`updated_at` はトリガーでサーバー時刻更新（LWW同期の基準）。

## テーブル一覧

### companies（会社/事業者）
| 列 | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| name | text | 屋号/会社名 |
| plan_type | text | `individual` / `corporate` |
| business_name, phone, postal_code, address, invoice_registration_number, logo_url | text | 事業者情報 |
| invite_code | text (unique) | 家族・職人の参加用コード |
| is_demo | boolean | デモ会社フラグ |
| created_at | timestamptz | |

### profiles（ユーザー ↔ 会社・役割）
| id (PK, =auth.users.id) | uuid | | 
| company_id | uuid → companies | 未所属はnull |
| role | text | `admin` / `worker` |
| full_name | text | |

新規サインアップ時に `handle_new_user` トリガーで自動作成（会社未割当）。

### customers（顧客）
`company_id, name, phone, address, channel(問合せ経路), inquiry_date, email, postal_code, customer_type, note(メモ), deleted, created_by, created_at, updated_at`

### sites（案件/現場）
`company_id, customer_id(text), name, customer, phone, address, manager, channel, status, inquiry_date, survey_date, estimate_date, estimate_amount, contract_amount, construction_start, completion_date, invoice_date, payment_due_date, payment_date, payment_status, next_contact, deleted, ...`

ステータス: `lead/survey/quote/quoted/follow/won/work/done/billed/paid`（+失注 lost は予定）。

### surveys（現地調査）
`company_id, site_id, building_type, building_age, floors, wall_material, roof_material, painting_area, scaffolding_required(bool), parking_information, deterioration(jsonb 配列), memo, surveyed_by, surveyed_at, ...`

### processes（工程）
`company_id, site_id, process_type, scheduled_date, completed_date, status(todo/doing/done/delayed), delay_reason, memo, sort_order, ...`

### estimates（見積）
`company_id, site_id, total, sell, profit, margin, ...`（明細 `items` 等はクライアント側レコードに保持。PDFはクライアント生成）

### reports（日報）
`company_id, site_id, date, worker, work_content, materials, hours, problems, ...`

### photos（写真メタ）
`company_id, site_id, report_id, phase, comment, storage_path, size, ...`
実体は Storage バケット `photos` に `<company_id>/<photo_id>.jpg`。

## ローカル ↔ DB 対応

`js/cloud.js` の `MAP` に集約（camelCase ↔ snake_case）。配列値は jsonb 列に単純コピーで往復。

## RLS（要約）

- 全テーブル `enable row level security`（既定拒否）。
- 閲覧：`company_id = current_company()`（自社のみ）。
- 案件/顧客/見積/調査/工程：追加・更新は **admin のみ**。
- 日報/写真：追加は自社メンバー全員、更新・論理削除は **admin か投稿者本人**。
- Storage：先頭フォルダ＝`company_id` で会社分離。削除は admin。
- 物理DELETEポリシーは作らない（クライアントからの物理削除不可）。

## RPC（SECURITY DEFINER）

- `create_my_company(p_name, p_plan)`：未所属ユーザーが会社作成→自分を admin に。
- `join_company(p_code)`：未所属ユーザーが招待コードで参加→ worker に。

## マイグレーション

`schema.sql` は `create table if not exists` ＋ `alter table ... add column if not exists` 構成。
既存DBにも再実行で安全に列追加できる。
