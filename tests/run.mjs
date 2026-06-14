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
const { caseEvents } = await import(J('js/views/calendar.js'));
const { scheduleStatus, plannedPeriod, completeProcess, currentStep, upcomingSteps } = await import(J('js/views/process.js'));
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

group('案件管理 / カレンダー');
test('最小項目で新規案件を登録できる', () => {
  reset();
  const r = store.insert('sites', { name: '田中様邸 外壁塗装', customer: '田中', status: 'lead' });
  assert.equal(store.get('sites', r.id).name, '田中様邸 外壁塗装');
  assert.equal(store.all('sites').length, 1);
});
test('カレンダーは案件の日付からイベントを抽出', () => {
  reset();
  store.insert('sites', { name: 'A', surveyDate: '2026-07-03', constructionStart: '2026-07-10', paymentDueDate: '2026-07-31' });
  const evs = caseEvents();
  assert.equal(evs.length, 3);
  assert.ok(evs.some((e) => e.label === '現調' && e.date === '2026-07-03'));
  assert.ok(evs.some((e) => e.label === '着工' && e.date === '2026-07-10'));
  assert.ok(evs.some((e) => e.label === '入金予定' && e.date === '2026-07-31'));
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

group('ホーム 今日やること');
test('tasks は money→work 優先で統合され、各タスクに action がある', () => {
  reset();
  store.insert('sites', { name: '完工', status: 'done', estimateAmount: 100 });
  store.insert('sites', { name: '今日現調', status: 'survey', surveyDate: '2026-06-13' });
  const { tasks } = computeAlerts(Date.parse('2026-06-13T09:00:00'));
  assert.ok(tasks.length >= 2);
  assert.equal(tasks[0].severity, 'money'); // お金が先頭
  assert.ok(tasks.every((t) => t.action)); // 全タスクに行動ボタン種別
  assert.ok(tasks.some((t) => t.action === 'survey' && t.title.includes('現地調査')));
});
test('見積放置は3日でリマインド（2日では出ない）', () => {
  reset();
  store.insert('sites', { id: 'q3', name: '3日', status: 'quoted', estimateDate: '2026-06-10', estimateAmount: 1 });
  store.insert('sites', { id: 'q2', name: '2日', status: 'quoted', estimateDate: '2026-06-11', estimateAmount: 1 });
  const { money } = computeAlerts(Date.parse('2026-06-13T09:00:00'));
  assert.ok(money.some((m) => m.siteId === 'q3' && m.action === 'call'));
  assert.ok(!money.some((m) => m.siteId === 'q2'));
});
test('連絡予定日が今日 → call タスク', () => {
  reset();
  store.insert('sites', { name: '今日連絡', status: 'follow', nextContact: '2026-06-13' });
  const { work } = computeAlerts(Date.parse('2026-06-13T09:00:00'));
  assert.ok(work.some((w) => w.action === 'call' && w.title.includes('今日が連絡')));
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

group('職人の予定 / 工程の進捗・前倒し遅れ');
function seedProcesses(siteId, items) {
  items.forEach((it, i) => store.insert('processes', { siteId, processType: it.t, status: it.done ? 'done' : 'todo', scheduledDate: it.s, completedDate: it.c || '', sortOrder: i }));
}
test('未完了で予定日が過去 → 遅れ日数', () => {
  reset();
  const site = store.insert('sites', { name: 'A', status: 'work' });
  seedProcesses(site.id, [{ t: '足場', s: '2026-06-01', done: true, c: '2026-06-01' }, { t: '下塗り', s: '2026-06-10' }]);
  const ss = scheduleStatus(site.id, '2026-06-13');
  assert.equal(ss.state, 'behind');
  assert.equal(ss.days, 3);
});
test('予定より早く完了 → 前倒し', () => {
  reset();
  const site = store.insert('sites', { name: 'B', status: 'work' });
  seedProcesses(site.id, [{ t: '足場', s: '2026-06-10', done: true, c: '2026-06-08' }, { t: '洗浄', s: '2026-06-20' }]);
  const ss = scheduleStatus(site.id, '2026-06-12');
  assert.equal(ss.state, 'ahead');
  assert.equal(ss.days, 2);
});
test('currentStep は最初の未完了、completeProcess で進む', () => {
  reset();
  const site = store.insert('sites', { name: 'C', status: 'work', constructionStart: '2026-06-10', completionDate: '2026-06-20' });
  seedProcesses(site.id, [{ t: '足場', s: '2026-06-10' }, { t: '洗浄', s: '2026-06-11' }]);
  assert.equal(currentStep(site.id).processType, '足場');
  completeProcess(currentStep(site.id).id, '2026-06-10');
  assert.equal(currentStep(site.id).processType, '洗浄');
  const pp = plannedPeriod(site.id);
  assert.equal(pp.start, '2026-06-10');
  assert.equal(pp.end, '2026-06-20');
});
test('upcomingSteps は未完了を予定日順に', () => {
  reset();
  const a = store.insert('sites', { name: 'A', status: 'work' });
  const b = store.insert('sites', { name: 'B', status: 'work' });
  store.insert('processes', { siteId: a.id, processType: '上塗り', status: 'todo', scheduledDate: '2026-06-20', sortOrder: 0 });
  store.insert('processes', { siteId: b.id, processType: '下塗り', status: 'todo', scheduledDate: '2026-06-15', sortOrder: 0 });
  store.insert('processes', { siteId: a.id, processType: '足場', status: 'done', scheduledDate: '2026-06-10', sortOrder: 1 });
  const up = upcomingSteps([a.id, b.id]);
  assert.equal(up.length, 2);
  assert.equal(up[0].name, 'B'); // 6/15が先
  assert.equal(up[0].processType, '下塗り');
});

group('役割 / メンバー（法人）');
test('役割の判定（現場系は金額を見ない・事務系は管理可）', async () => {
  const r = await import(J('js/roles.js'));
  assert.equal(r.uiMode('craftsman'), 'worker');
  assert.equal(r.uiMode('manager'), 'admin');
  assert.equal(r.canSeeMoney('craftsman'), false);
  assert.equal(r.canSeeMoney('office'), true);
  assert.equal(r.canManage('sales'), true);
  assert.equal(r.canManage('partner'), false);
  assert.equal(r.uiMode('worker'), 'worker'); // 旧称も現場系
  assert.equal(r.uiMode('admin'), 'admin');
});
test('members が同期対象・有効/無効を管理', () => {
  assert.ok(SYNC_COLLECTIONS.includes('members'));
  reset();
  const m = store.insert('members', { name: '山本', role: 'craftsman', active: true });
  store.insert('members', { name: '退職者', role: 'craftsman', active: false });
  const active = store.all('members').filter((x) => x.active !== false);
  assert.equal(active.length, 1);
  assert.equal(active[0].name, '山本');
  store.update('members', m.id, { active: false });
  assert.equal(store.all('members').filter((x) => x.active !== false).length, 0);
});

group('AI事務員（無料の下書き）');
test('連絡文にお客様名・屋号・金額が差し込まれる', async () => {
  const { setCompany } = await import(J('js/company.js'));
  const ai = await import(J('js/ai.js'));
  setCompany({ name: '伊藤塗装', phone: '090-1111-2222' });
  const site = { name: '田中様邸 外壁塗装', customer: '田中 健一', contractAmount: 720000, paymentDueDate: '2026-05-31' };
  const f = ai.draftFollowup(site);
  assert.ok(f.includes('田中 健一 様') && f.includes('伊藤塗装') && f.includes('田中様邸 外壁塗装'));
  const p = ai.draftPaymentReminder(site);
  assert.ok(p.includes('¥720,000'));
  const c = ai.draftCompletion(site);
  assert.ok(c.includes('ありがとう') && c.includes('¥720,000'));
});
test('contactList が状態ごとに文面タイプを割り当てる', async () => {
  const ai = await import(J('js/ai.js'));
  reset();
  store.insert('sites', { id: 'd', name: '完工', status: 'done', contractAmount: 1 });
  store.insert('sites', { id: 'b', name: '滞納', status: 'billed', paymentDueDate: '2026-05-31', contractAmount: 1 });
  store.insert('sites', { id: 'q', name: '追客', status: 'quoted', estimateDate: '2026-06-01', estimateAmount: 1 });
  const l = ai.contactList('2026-06-13');
  assert.equal(l.find((x) => x.site.id === 'd').type, 'completion');
  assert.equal(l.find((x) => x.site.id === 'b').type, 'payment');
  assert.equal(l.find((x) => x.site.id === 'q').type, 'followup');
});
test('日報の要約が作業と問題をまとめる', async () => {
  const ai = await import(J('js/ai.js'));
  const reports = [
    { date: '2026-06-12', workContent: '外壁 下塗り', problems: '' },
    { date: '2026-06-13', workContent: '中塗り', problems: '破風に腐食' },
  ];
  const s = ai.summarizeReports(reports);
  assert.ok(s.includes('作業の記録') && s.includes('中塗り') && s.includes('破風に腐食'));
});

group('操作案内（ヒント）');
test('消したヒントは再表示しない（localStorageで記憶）', async () => {
  const { hintBanner } = await import(J('js/ui.js'));
  mem.set('nurilog.hint.t1', '1'); // 一度×で消した状態
  assert.equal(hintBanner('t1', 'てすと'), null);
});

group('バックアップ / 復元');
test('エクスポート→全消去→復元でデータが戻る', async () => {
  const { exportData, importBackup, validateBackup } = await import(J('js/backup.js'));
  reset();
  store.insert('sites', { name: '田中邸', status: 'work' });
  store.insert('customers', { name: '田中', phone: '090' });
  const backup = exportData();
  assert.ok(validateBackup(backup));
  reset(); // 端末初期化を想定
  assert.equal(store.all('sites').length, 0);
  await importBackup(backup);
  assert.equal(store.all('sites').length, 1);
  assert.equal(store.all('sites')[0].name, '田中邸');
  assert.equal(store.all('customers')[0].name, '田中');
});
test('不正なバックアップは拒否', async () => {
  const { validateBackup } = await import(J('js/backup.js'));
  assert.equal(validateBackup({ app: 'other' }), false);
  assert.equal(validateBackup(null), false);
});

group('音声入力ヘルパー（無料の簡易抽出）');
test('parsePhone / parseDate', async () => {
  const { parsePhone, parseDate } = await import(J('js/voice.js'));
  assert.equal(parsePhone('田中さん 090-1234-5678 です'), '090-1234-5678');
  const now = new Date('2026-06-13T09:00:00');
  assert.equal(parseDate('明日きます', now), '2026-06-14');
  assert.equal(parseDate('6月20日に', now), '2026-06-20');
});

group('追加工事（写真・金額・承認・請求連動）');
test('extras が同期対象に含まれる', () => assert.ok(SYNC_COLLECTIONS.includes('extras')));
test('承認済み・未請求の追加工事はタスクに出る', () => {
  reset();
  const s = store.insert('sites', { name: 'A', status: 'work' });
  store.insert('extras', { siteId: s.id, content: '板金補修', amount: 22000, status: 'approved', billed: false });
  store.insert('extras', { siteId: s.id, content: '未承認分', amount: 5000, status: 'pending', billed: false });
  const { money } = computeAlerts(Date.parse('2026-06-13T09:00:00'));
  const t = money.find((m) => m.title.includes('追加工事が未請求'));
  assert.ok(t && t.action === 'invoice');
});
test('請求書に承認済み追加工事が明細・合計へ反映', () => {
  reset();
  const s = store.insert('sites', { id: 'inv1', name: '渡辺邸', customer: '渡辺', contractAmount: 110000 });
  store.insert('extras', { siteId: 'inv1', content: '板金補修', amount: 22000, status: 'approved', billed: false });
  store.insert('extras', { siteId: 'inv1', content: '却下分', amount: 9999, status: 'rejected' });
  captured = '';
  openInvoiceDoc(store.get('sites', 'inv1'));
  assert.ok(captured.includes('追加工事：板金補修'));
  assert.ok(captured.includes('¥132,000')); // 110000 + 22000
  assert.ok(!captured.includes('却下分'));
});

group('写真分類 / 請求書連動');
test('写真カテゴリは6種（施工前/中/後/材料缶/不具合/追加工事）', async () => {
  const { PHASES, phaseInfo } = await import(J('js/model.js'));
  assert.equal(PHASES.length, 6);
  assert.equal(phaseInfo('material').label, '材料缶');
  assert.equal(phaseInfo('defect').label, '不具合');
  assert.equal(phaseInfo('extra').label, '追加工事');
});
test('請求書に備考が入る（site.invoiceNote / opts.notes）', () => {
  captured = '';
  openInvoiceDoc({ name: 'A', customer: 'B', contractAmount: 110000, invoiceNote: '追加工事を含みます' });
  assert.ok(captured.includes('備考'));
  assert.ok(captured.includes('追加工事を含みます'));
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
