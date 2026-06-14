# CLAUDE.md — ぬりログ 開発ガイド

このリポジトリで作業するAI/開発者向けの設計方針と規約。**実装前に必ず読むこと。**

## プロダクトの原点（最重要）

塗装業の**一人親方**が、案件・写真・見積・請求を紙/LINE/記憶/スマホ写真で雑に管理し、
「仕事とお金が漏れている」問題を解決する。目標は多機能DXツールではなく、
**ITが苦手な親方でも説明書なしで使え、ざるな管理でも仕事とお金が漏れないアプリ**。

判断に迷ったら「親方が毎日どこで困り、何を忘れ、何を後回しにするか」を基準にする。

## プラン

- **個人プラン(individual)**：一人親方・家族経営。案件/写真/見積/請求を忘れない。入力を減らし1画面で完結。
- **法人プラン(corporate)**：複数人で現場・顧客・工程・利益を共有。権限分け・承認・原価管理（フェーズ2以降）。

## 技術構成（既存を維持する）

- フロント：**バニラJS（ESモジュール）/ ビルド不要 / 依存ライブラリゼロ**。`index.html` ＋ ハッシュルーター(`js/app.js`)。
- データ：**2モード併存**
  - デモ（既定）：`localStorage`（構造化データ）＋ `IndexedDB`（写真Blob）。単一端末。
  - 本番（クラウド）：Supabase（Postgres + Auth + Storage）。`js/config.js` にキーがあれば自動でこのモード。
- 同期：ローカルを正にオフライン動作し、オンライン時にLWW差分同期（`js/cloud.js` / デモ共有は `js/sync.js`+`server/`）。
- PWA：`manifest.webmanifest` + `sw.js`（ネットワーク優先キャッシュ）。
- PDF：**ブラウザ印刷（PDF保存）方式**（`js/doc.js`）。日本語はシステムフォントで描画＝文字化けしない。CDN/フォント埋め込み不要。

> フレームワーク移行はしない（既存の動作・無料枠・PWAを壊さないため）。必要が生じたら必ず移行計画を先に提示する。

## ディレクトリ

```
js/app.js        ルーター/ロール/オンボーディングゲート
js/db.js         保存層(localStorage/IndexedDB)・uid(UUID)・同期メタ
js/model.js      ステータス定義・集計・画像縮小・デモseed
js/alerts.js     「お金が漏れるぞ」判定
js/money.js      請求/入金の記録操作・日付ヘルパー
js/company.js    自社情報・プラン・オンボーディング状態(localStorage)
js/doc.js        見積書/請求書PDF(印刷)生成
js/cloud.js      Supabase認証/同期/会社RPC
js/sync.js       デモ共有同期クライアント
js/ui.js         DOMヘルパー/トースト/モーダル/写真サムネ
js/views/*.js    画面(worker/admin/site/customers/survey/process/estimate/settings/login/onboarding)
server/          デモ用チーム共有サーバー(node:http, 依存なし)
supabase/        本番スキーマ(schema.sql)・デモseed・RLSテスト
docs/            設計書・手順・既知の問題
tests/run.mjs    単体テスト(npm test)
```

## 命名規約

- ローカル(JS)は **camelCase**、DB(Postgres)は **snake_case**。対応は `js/cloud.js` の `MAP` に集約。
- レコードIDは **UUID v4**（`uid()`）。Postgresの`uuid`主キーへそのまま入る。
- 同期コレクション名＝Supabaseのテーブル名（`sites`/`reports`/`estimates`/`photos`/`customers`/`surveys`/`processes`）。

## データ分離（必須）

- すべての業務データは **`company_id`（会社/事業者単位）** を持ち、**他社データは一切見えない**。
- 強制は**サーバー側RLSが主**（`supabase/schema.sql`）。クライアントの出し分けは補助に過ぎない。
- 削除は**論理削除**（`deleted=true` のトゥームストーン）。物理DELETEはクライアント不可。

## 権限（詳細は docs/PERMISSIONS.md）

- 現状の実装ロール：`admin`（管理者=フル）/ `worker`（職人=閲覧＋日報・写真の追加、自分の投稿のみ編集）。
- 個人プランの owner/family、法人プランの office/sales/manager/craftsman/partner はフェーズ2で拡張予定。
- 会社作成・参加は SECURITY DEFINER RPC（`create_my_company`/`join_company`）で未所属ユーザーのみ許可。

## 「同期されるコレクションを追加する」手順（重要・抜け漏れ注意）

新しい業務データを追加するときは、必ず次の**6か所**を揃える：

1. `js/db.js` … `defaultData` に空配列を追加 ＋ `SYNC_COLLECTIONS` に名前を追加
2. `server/store.js` … `COLLECTIONS` に名前を追加（デモ共有サーバー）
3. `js/cloud.js` … `MAP` に camelCase↔snake_case 対応を追加
4. `supabase/schema.sql` … テーブル作成＋`company_id`＋`enable row level security`＋RLSポリシー＋`touch_updated_at`トリガー＋index
5. `sw.js` … 新規JSをASSETSに追加し `CACHE` 版を上げる
6. `tests/run.mjs` … 最低限のテストを追加

配列など複雑な値は Postgres 側を `jsonb` にすると `MAP` の単純コピーで往復できる（例: `surveys.deterioration`）。

## セキュリティ要件

- `service_role` キーをフロント/コミット/`config.js`に**絶対置かない**。公開する `anon` キーはRLS有効が前提。
- 画面の表示制御だけで権限管理しない（RLSで二重に検証）。他社データ不可をテストする。
- 外部へ出力する文字列（PDF等）は必ずエスケープ（`js/doc.js` の `esc`）。
- 個人情報（住所/電話/写真）をログへ不用意に出さない。エラーに機密を含めない。

## テスト要件

- `npm test`（`tests/run.mjs`）が**緑であること**。ロジック変更時はテストを追加/更新。
- 各機能は「見た目だけのダミー」で完成としない。保存・再読込・削除まで動かす。
- 確認できた項目と未確認項目を分けて報告する（特にクラウド通電は実Supabaseが要る）。

## コミット/報告

- フェーズ単位で完成させ、各完了時にコミット。README/docs/.env.example/スキーマを必ず更新。
- 破壊的変更の前に復旧可能な状態（コミット）を作る。既存の動く機能を壊さない。
