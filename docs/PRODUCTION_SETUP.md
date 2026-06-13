# 本番版セットアップ手順（Supabase + Cloudflare Pages）

複数人・複数端末で使う本番版の構成と手順です。**まず無料枠で構築できます。**
あなたが行う操作（アカウント作成・キー取得・SQL実行・デプロイ）と、アプリ側の仕組みを説明します。

> セキュリティの核（会社ごとのデータ分離・役割別権限）は `supabase/schema.sql` の
> RLS で実装し、ローカルPostgresで**8項目のテスト合格を確認済み**です（`supabase/test_rls.sql`）。

---

## 構成

| 層 | サービス | 役割 |
|---|---|---|
| 認証・DB・権限・写真 | **Supabase**（無料枠から） | ログイン / Postgres / RLS / Storage |
| フロント配信・本番URL | **Cloudflare Pages**（無料） | PWAの配信・HTTPS・独自ドメイン |

- 役割：`admin`（管理者）=フル権限 / `worker`（職人）=閲覧＋日報・写真の追加（案件の編集・削除は不可）
- データ分離：会社（company）ごと。RLSで他社データは一切見えない
- 削除/復元：論理削除（`deleted`）。物理削除はクライアント不可（サーバー管理者のみ）
- バックアップ：Supabaseの自動バックアップ ＋ アプリからのJSONエクスポート（任意）
- デモ/本番分離：設定キーが空＝**デモ（端末内保存）**、キー有り＝**本番（クラウド）**。さらに本番内も会社単位で分離

---

## あなたが行う操作

### 1. Supabase プロジェクト作成（無料）
1. https://supabase.com でサインアップ → New project 作成（リージョンは Tokyo 推奨）
2. プロジェクトの **Settings → API** で以下を控える：
   - `Project URL`（例 `https://xxxx.supabase.co`）
   - `anon public` キー（公開用。クライアントに載せてよい）
   - `service_role` キー（**絶対に公開・コミットしない**。サーバー/管理操作のみ）

### 2. スキーマ投入
1. Supabase の **SQL Editor** を開く
2. リポジトリの `supabase/schema.sql` の中身を貼り付けて **Run**（何度実行してもOK）
3. これでテーブル・RLS・写真バケット（`photos`）・トリガーが作成される

### 3. 会社と管理者アカウントを作る
1. **Authentication → Users → Add user** で管理者のメール/パスワードを作成
   （作成と同時に `profiles` 行が自動生成されます）
2. **SQL Editor** で会社を作成し、その管理者を会社に割り当てる（メールは実際の値に置換）：
   ```sql
   insert into public.companies (name) values ('〇〇塗装') returning id;
   -- 返ってきた company_id を使って：
   update public.profiles
     set company_id = '（上のid）', role = 'admin', full_name = '管理者名'
     where id = (select id from auth.users where email = 'admin@example.com');
   ```
3. 職人アカウントも同様に Add user → `profiles` を `role='worker'`, 同じ `company_id` に更新

### 4. Cloudflare Pages へデプロイ（本番URL発行）
1. https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**
2. このリポジトリを選択。ブランチは `claude/eager-pasteur-l55tr3`（または main にマージ後 main）
3. ビルド設定：
   - **Build command**: `node scripts/gen-config.mjs`
   - **Build output directory**: `/`（リポジトリのルート）
4. **Settings → Environment variables** に以下を追加（Production）：
   - `SUPABASE_URL` = 控えた Project URL
   - `SUPABASE_ANON_KEY` = 控えた anon public キー
5. デプロイ → 発行URL（例 `https://nurilog.pages.dev`）が本番URLになります

> ビルド時に `gen-config.mjs` が env から `js/config.js` を生成します。
> キーはコードにも履歴にも残りません（anonは公開前提キーですが、運用上もenv管理にします）。

### 5. Supabase の許可URL設定
- Supabase **Authentication → URL Configuration** の Site URL に、Cloudflare の本番URLを設定

---

## 動作

- 本番URLを開くと**ログイン画面**。会社発行のアカウントでログイン
- 役割はアカウント（profiles.role）で自動決定（手動の職人/管理者切替は無効化）
- 案件・顧客・日報・見積・写真は**会社単位でクラウド保存**。別端末でも同じデータ
- 写真は Supabase Storage（`photos` バケット、`<company_id>/<id>.jpg`）に保存
- オフラインでも操作でき、オンライン復帰時に自動同期

---

## 無料でできる範囲 / 有料になる条件（目安・最新は各社の料金ページで要確認）

- **Supabase Free**：DB 約500MB、Storage 約1GB、認証ユーザー多数。小規模1社なら十分。
  ただし**一定期間アクセスが無いとプロジェクト休止**（手動再開要）。
- **Cloudflare Pages Free**：静的配信ほぼ無制限、月500ビルド。配信は実質無料。
- **有料化の主因＝写真容量**。Storage上限超過やDB超過、常時稼働/自動バックアップ強化が必要なら
  Supabase Pro（月額 約$25）。写真は圧縮保存済みで、必要なら Cloudflare R2 へ退避でコスト圧縮。

---

## バックアップ・復元

- **復元**：削除は論理削除なので、`deleted=false` に戻せば復元（管理用SQL or 今後の「ゴミ箱」UI）
- **バックアップ**：Supabaseの自動バックアップ（Pro推奨）＋ 手動 `pg_dump`。
  Storageの写真は Supabase のバックアップ対象か別途エクスポートを確認のこと。

---

## セキュリティ上の注意点

- `service_role` キーは**全権限・RLS無視**。**フロントに載せない／コミットしない／env(サーバー側)のみ**。
- 公開する `anon` キーは、**全テーブルでRLS有効（既定拒否）**である限り安全。`schema.sql` で有効化済み。
- 権限はUIの出し分けではなく**サーバー側RLSで強制**（本実装はRLSが主、クライアントは補助）。
- 認証はメール確認・パスワードポリシー・レート制限を Supabase 側で有効化推奨。
- 本番URLはHTTPSのみ（Cloudflareが自動）。
- バックアップは設定して**復元テストまで**実施。

---

## ローカルでの本番接続テスト（任意）

```bash
SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_ANON_KEY="（anonキー）" node scripts/gen-config.mjs
npm start   # or: python3 -m http.server 8787
# → http://localhost:8787 でログイン画面が出れば接続設定OK
```
テスト後は `node scripts/gen-config.mjs`（env無し）で `js/config.js` を空（デモ）に戻せます。
