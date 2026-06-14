# 画面一覧

ハッシュルーター（`#/route/arg`）。実装は `js/app.js` の `routes`。

## ゲート画面（タブなし）
| 画面 | 条件 | ファイル |
|---|---|---|
| ログイン/新規登録/パスワード再設定 | クラウド＆未ログイン | `views/login.js` |
| クラウド初期設定（会社作成/招待参加） | クラウド＆会社未所属 | `views/onboarding.js` |
| デモ初回設定（プラン+屋号+振込先） | デモ＆未オンボーディング | `views/onboarding.js` |

## 職人モード（タブ：今日/写真/日報/報告/明日）※金額・案件管理・見積・原価は非表示
| route | 画面 | ファイル |
|---|---|---|
| `worker` | 今日：今日の現場・集合時間・住所/地図・今日やること(チェック)・必要な写真・注意＋大3ボタン | `views/worker.js` |
| `photo` | 写真：1件なら自動紐付け→撮影→6分類→「続けて撮れます」 | `views/site.js` |
| `report` | 日報：「今日 何しましたか？」🎤話して入力→「この内容で提出しますか？」確認 | `views/site.js` |
| `houkoku` | 報告：追加工事/不具合/事故/要望/材料不足/その他を大ボタンで（管理者に届く） | `views/houkoku.js` |
| `tomorrow` | 明日：明日の現場・集合時間・住所/地図・作業・注意（無ければ案内） | `views/tomorrow.js` |

> 予定(schedule)は今日/明日に統合。共有/自社情報は管理者(settings)に集約。

## 管理者モード（タブ：ダッシュ/案件/顧客/見積/共有）
| route | 画面 | ファイル |
|---|---|---|
| `admin` | ダッシュボード（💸お金が漏れるぞ＋ワンタップ解決、今日の現場） | `views/admin.js` |
| `cases` | 案件（一覧/カレンダー切替・ステータス絞り込み・最小項目で新規登録） | `views/admin.js` + `views/calendar.js` |
| `customers` | 顧客一覧/検索/仮登録 | `views/customers.js` |
| `customer` | 顧客詳細（案件履歴・電話/地図・この顧客で新規案件） | `views/customers.js` |
| `site` | 案件詳細（電話/地図・お金操作・現地調査・工程・写真・日報・書類PDF） | `views/site.js` |
| `survey` | 現地調査（建物情報＋劣化選択式） | `views/survey.js` |
| `process` | 工程表（縦型・雨天延期・完工チェック） | `views/process.js` |
| `estimate` | 見積（明細＋粗利チェック＋見積書PDF） | `views/estimate.js` |
| `settings` | アカウント/プラン/招待コード/自社情報 | `views/settings.js` |

## 帳票（別ウィンドウ・印刷/PDF保存）
- 見積書 / 請求書：`js/doc.js`（`openEstimateDoc` / `openInvoiceDoc`）。
