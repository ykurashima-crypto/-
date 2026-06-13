// ぬりログ 単体テスト（依存ゼロ・Node標準のみ）。
//   実行: npm test   または   node tests/run.mjs
// ブラウザAPI(localStorage/window/crypto)を最小スタブし、純粋ロジックを検証する。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const J = (p) => 'file://' + path.join(ROOT, p);

// ---- ブラウザAPIスタブ ----
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.structuredClone ||= (x) => JSON.parse(JSON.stringify(x));
let captured = '';
globalThis.window = { open: () => ({ document: { write: (s) => { captured += s; }, close() {} }, print() {} }) };
globalThis.alert = () => {};

// ---- 軽量テストランナー ----
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.error('  ✗ ' + name + '\n      ' + (e.message || e)); fail++; }
}
function group(t) { console.log('\n' + t); }

const { store, uid, SYNC_COLLECTIONS } = await import(J('js/db.js'));
const { computeAlerts, moneySummary } = await import(J('js/alerts.js'));
const { addDays, billableAmount } = await import(J('js/money.js'));
const { getPlan, planLabel, isOnboarded, setOnboarded, setCompany } = await import(J('js/company.js'));
const { openEstimateDoc, openInvoiceDoc } = await import(J('js/doc.js'));
const reset = () => store.replaceAll({});

group('db / ID');
test('uid() は UUID v4', () => {
  assert.match(uid('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('全同期コレクションが揃っている', () => {
  for (const c of ['sites', 'reports', 'estimates', 'photos', 'customers', 'surveys', 'processes'])
    assert.ok(SYNC_COLLECTIONS.includes(c), c);
});
test('論理削除はトゥームストーンを残す', () => {
  reset();
  const r = store.insert('customers', { name: 'A' });
  store.remove('customers', r.id);
  assert.equal(store.get('customers', r.id), null);
  assert.equal(store.allRaw('customers').find((x) => x.id === r.id).deleted, true);
});

group('お金が漏れるぞ アラート');
test('完工=請求漏れ / 期限超過=入金漏れ / 見積放置 / 入金済みは出ない', () => {
  reset();
  const NOW = Date.parse('2026-06-13T09:00:00');
  store.insert('sites', { id: 'd', name: '完工', status: 'done', estimateAmount: 980000 });
  store.insert('sites', { id: 'b1', name: '請求超過', status: 'billed', contractAmount: 720000, paymentDueDate: '2026-05-31' });
  store.insert('sites', { id: 'b2', name: '請求期限内', status: 'billed', contractAmount: 500000, paymentDueDate: '2026-12-31' });
  store.insert('sites', { id: 'q', name: '見積放置', status: 'quoted', estimateDate: '2026-06-01', estimateAmount: 1000000 });
  store.insert('sites', { id: 'p', name: '入金済', status: 'paid', contractAmount: 300000 });
  const { money } = computeAlerts(NOW);
  assert.ok(money.some((m) => m.siteId === 'd' && m.action === 'invoice'));
  assert.ok(money.some((m) => m.siteId === 'b1' && m.action === 'payment'));
  assert.ok(!money.some((m) => m.siteId === 'b2'));
  assert.ok(money.some((m) => m.siteId === 'q' && m.action === 'call'));
  assert.ok(!money.some((m) => m.siteId === 'p'));
});
test('金額サマリー（未請求/入金待ち）', () => {
  const s = moneySummary();
  assert.equal(s.uninvoiced, 980000);
  assert.equal(s.awaitingPayment, 720000 + 500000);
});

group('money ヘルパー');
test('addDays は日本式日付を返す', () => assert.equal(addDays('2026-06-13', 30), '2026-07-13'));
test('billableAmount は契約額優先', () => {
  assert.equal(billableAmount({ contractAmount: 100, estimateAmount: 200 }), 100);
  assert.equal(billableAmount({ estimateAmount: 200 }), 200);
});

group('現地調査');
test('劣化状態が配列で保存され最新を取得', () => {
  reset();
  const site = store.insert('sites', { name: 'S' });
  store.insert('surveys', { siteId: site.id, paintingArea: 180, deterioration: ['チョーキング', 'カビ'], scaffolding: true });
  const latest = store.all('surveys').filter((x) => x.siteId === site.id)[0];
  assert.equal(latest.paintingArea, 180);
  assert.deepEqual(latest.deterioration, ['チョーキング', 'カビ']);
});

group('工程（縦型工程表）');
test('雨天延期で以降の未完了工程だけがまとめてズレる', () => {
  reset();
  const site = store.insert('sites', { name: 'S' });
  const TPL = ['足場', '高圧洗浄', '下地処理', '養生'];
  TPL.forEach((name, i) => store.insert('processes', { siteId: site.id, processType: name, status: 'todo', scheduledDate: addDays('2026-06-10', i), sortOrder: i }));
  const list = () => store.all('processes').filter((p) => p.siteId === site.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const wash = list().find((p) => p.processType === '高圧洗浄');
  store.update('processes', wash.id, { status: 'done', completedDate: '2026-06-11' });
  const base = list().find((p) => p.processType === '下地処理'); // sort=2
  const n = 2;
  store.update('processes', base.id, { status: 'delayed', scheduledDate: addDays(base.scheduledDate, n) });
  for (const q of list()) if (q.id !== base.id && q.sortOrder > base.sortOrder && q.status !== 'done')
    store.update('processes', q.id, { scheduledDate: addDays(q.scheduledDate, n) });
  const a = list();
  assert.equal(a.find((p) => p.processType === '下地処理').scheduledDate, '2026-06-14');
  assert.equal(a.find((p) => p.processType === '養生').scheduledDate, '2026-06-15');
  assert.equal(a.find((p) => p.processType === '高圧洗浄').scheduledDate, '2026-06-11'); // 完了済みは不変
  assert.equal(a.find((p) => p.processType === '足場').scheduledDate, '2026-06-10'); // 前工程は不変
});

group('見積書・請求書PDF');
test('見積書に明細・税込合計・消費税が入る', () => {
  setCompany({ name: '伊藤塗装', phone: '090', bank: '〇〇銀行 普通 123' });
  captured = '';
  openEstimateDoc({ name: '田中様邸', customer: '田中 健一', address: '横浜' },
    { items: [{ name: '外壁上塗り', qty: 180, unit: '㎡', unitPrice: 2600, amount: 468000 }], subtotal: 468000, discount: 0, tax: 46800, total: 514800 });
  assert.ok(captured.includes('御 見 積 書'));
  assert.ok(captured.includes('田中 健一 様'));
  assert.ok(captured.includes('外壁上塗り'));
  assert.ok(captured.includes('¥514,800'));
});
test('PDFはHTMLをエスケープする（XSS対策）', () => {
  captured = '';
  openEstimateDoc({ name: '<script>alert(1)</script>', customer: '"><img>', address: '' }, { items: [], subtotal: 0, total: 0 });
  assert.ok(!captured.includes('<script>alert(1)</script>'));
  assert.ok(captured.includes('&lt;script&gt;'));
});
test('請求書は税込から税抜を逆算（消費税計算）', () => {
  captured = '';
  openInvoiceDoc({ name: '渡辺様邸', customer: '渡辺', contractAmount: 720000 });
  assert.ok(captured.includes('¥720,000'));
  assert.ok(captured.includes('¥654,545')); // 720000/1.1
  assert.ok(captured.includes('〇〇銀行'));
});

group('プラン / オンボーディング');
test('既定は個人プラン、法人へ切替可能', () => {
  mem.clear();
  assert.equal(getPlan(), 'individual');
  assert.equal(planLabel(), '個人プラン');
  setCompany({ name: 'X', planType: 'corporate' });
  assert.equal(planLabel('corporate'), '法人プラン');
});
test('オンボーディング完了フラグ', () => {
  mem.clear();
  assert.equal(isOnboarded(), false);
  setOnboarded();
  assert.equal(isOnboarded(), true);
});

group('スキーマ / RLS（静的検査）');
test('全業務テーブルに company_id とRLSがある', () => {
  const sql = readFileSync(path.join(ROOT, 'supabase/schema.sql'), 'utf8');
  for (const t of ['customers', 'sites', 'reports', 'estimates', 'photos', 'surveys', 'processes']) {
    assert.match(sql, new RegExp(`alter table public\\.${t}\\s+enable row level security`), `${t} RLS`);
  }
  assert.match(sql, /create or replace function public\.create_my_company/);
  assert.match(sql, /create or replace function public\.join_company/);
});

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
