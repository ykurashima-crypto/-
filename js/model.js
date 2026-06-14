// ドメインモデル: 案件ステータス、共通ヘルパー、初期サンプルデータ、画像縮小処理。
import { store, uid, putBlob } from './db.js';

// 案件ステータス（塗装業の標準フロー）
export const STATUSES = [
  { key: 'lead',   label: '新規問い合わせ', cls: 's-lead' },
  { key: 'survey', label: '現調待ち',       cls: 's-survey' },
  { key: 'quote',  label: '見積作成中',     cls: 's-quote' },
  { key: 'quoted', label: '見積提出済み',   cls: 's-quote' },
  { key: 'follow', label: '追客中',         cls: 's-follow' },
  { key: 'won',    label: '受注',           cls: 's-won' },
  { key: 'work',   label: '工事中',         cls: 's-work' },
  { key: 'done',   label: '完工',           cls: 's-done' },
  { key: 'billed', label: '請求済み',       cls: 's-billed' },
  { key: 'paid',   label: '入金済み',       cls: 's-paid' },
];

export function statusInfo(key) {
  return STATUSES.find((s) => s.key === key) || { key, label: key, cls: '' };
}

// 写真フェーズ（工程別分類）
export const PHASES = [
  { key: 'before', label: '施工前', cls: 'phase-before' },
  { key: 'during', label: '施工中', cls: 'phase-during' },
  { key: 'after',  label: '施工後', cls: 'phase-after' },
  { key: 'material', label: '材料缶', cls: 'phase-material' },
  { key: 'defect', label: '不具合', cls: 'phase-defect' },
  { key: 'extra',  label: '追加工事', cls: 'phase-extra' },
];
export function phaseInfo(key) {
  return PHASES.find((p) => p.key === key) || PHASES[0];
}

// 現在「現場に出ている」とみなすステータス
export const ACTIVE_STATUSES = ['won', 'work'];

// ---- フォーマッタ ----
export function yen(n) {
  if (n == null || isNaN(n)) return '—';
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
export function fmtDate(d) {
  if (!d) return '—';
  const dt = typeof d === 'number' ? new Date(d) : new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
export function fmtDateTime(ts) {
  const dt = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getMonth() + 1}/${dt.getDate()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

// ---- 集計ヘルパー ----
export function sitePhotos(siteId) {
  return store.all('photos').filter((p) => p.siteId === siteId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
export function siteReports(siteId) {
  return store.all('reports').filter((r) => r.siteId === siteId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
export function activeSites() {
  return store.all('sites').filter((s) => ACTIVE_STATUSES.includes(s.status));
}

// ---- 画像縮小（長辺1600pxに収め、JPEGで保存して容量削減）----
export async function downscaleToBlob(file, maxEdge = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // 失敗時は元ファイル
  let { width, height } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || file), 'image/jpeg', quality);
  });
}

export async function addPhoto({ siteId, reportId = null, phase, comment = '', file }) {
  const blob = await downscaleToBlob(file);
  const id = uid('photo');
  await putBlob(id, blob);
  const takenBy = localStorage.getItem('nurilog.worker') || '';
  return store.insert('photos', { id, siteId, reportId, phase, comment, size: blob.size, takenBy });
}

// ---- 初回サンプルデータ投入 ----
// 固定IDで投入する。これにより複数端末がそれぞれ初期化しても、共有時に
// 同一IDとしてLWWマージされ、サンプルが重複しない。
export function seedIfEmpty() {
  if (store.allRaw('sites').length > 0) return;
  const mk = (id, o) => store.insertWithId('sites', { id, ...o });
  mk('seed_tanaka', {
    name: '田中様邸 外壁塗装', customer: '田中 健一', phone: '090-1234-5678',
    address: '横浜市青葉区美しが丘2-1', status: 'work', manager: '佐藤',
    channel: 'チラシ', inquiryDate: '2026-05-02', surveyDate: '2026-05-08',
    estimateDate: '2026-05-12', estimateAmount: 1280000, constructionStart: '2026-06-10',
    nextContact: '2026-06-15',
  });
  mk('seed_suzuki', {
    name: '鈴木様邸 屋根・外壁', customer: '鈴木 美和', phone: '080-2222-3333',
    address: '川崎市麻生区上麻生5-12', status: 'quoted', manager: '佐藤',
    channel: '紹介', inquiryDate: '2026-05-20', surveyDate: '2026-05-28',
    estimateDate: '2026-06-01', estimateAmount: 1650000, constructionStart: '',
    nextContact: '2026-06-10',
  });
  // 完工したのに請求書がまだ＝請求漏れ（お金が漏れるぞ）
  mk('seed_sato', {
    name: '佐藤様邸 外壁塗装', customer: '佐藤 隆', phone: '090-5555-1212',
    address: '横浜市戸塚区上倉田町8-2', status: 'done', manager: '佐藤',
    channel: 'リピーター', inquiryDate: '2026-04-10', surveyDate: '2026-04-15',
    estimateDate: '2026-04-18', estimateAmount: 980000, contractAmount: 980000,
    constructionStart: '2026-05-12', completionDate: '2026-05-30', nextContact: '',
  });
  // 請求済みだが入金予定日を過ぎている＝入金漏れ（お金が漏れるぞ）
  mk('seed_watanabe', {
    name: '渡辺様邸 屋根塗装', customer: '渡辺 浩二', phone: '080-7777-3434',
    address: '川崎市宮前区土橋3-4', status: 'billed', manager: '佐藤',
    channel: 'ホームページ', inquiryDate: '2026-03-01', estimateAmount: 720000,
    contractAmount: 720000, constructionStart: '2026-04-01', completionDate: '2026-04-20',
    invoiceDate: '2026-04-25', paymentDueDate: '2026-05-31', nextContact: '',
  });
  mk('seed_takahashi', {
    name: '高橋アパート 共用部', customer: '高橋不動産', phone: '044-555-6677',
    address: '川崎市多摩区登戸1-3', status: 'won', manager: '山本',
    channel: 'Web', inquiryDate: '2026-05-20', surveyDate: '2026-05-25',
    estimateDate: '2026-05-28', estimateAmount: 980000, constructionStart: '2026-06-18',
    nextContact: '2026-06-17',
  });
  mk('seed_ito', {
    name: '伊藤様邸 ベランダ防水', customer: '伊藤 大輔', phone: '090-8888-9999',
    address: '横浜市港北区日吉3-7', status: 'lead', manager: '佐藤',
    channel: 'Web', inquiryDate: '2026-06-12', surveyDate: '', estimateDate: '',
    estimateAmount: null, constructionStart: '', nextContact: '2026-06-14',
  });

  // 顧客サンプル（電話番号が案件と一致 → 顧客詳細の「案件履歴」に表示される）
  const mkc = (id, o) => store.insertWithId('customers', { id, ...o });
  mkc('seed_c_tanaka', {
    name: '田中 健一', phone: '090-1234-5678', address: '横浜市青葉区美しが丘2-1',
    channel: 'チラシ', inquiryDate: '2026-05-02', memo: '築15年・南面の色あせ気になる。日中不在、夕方連絡可',
  });
  mkc('seed_c_sato', {
    name: '佐藤 隆', phone: '090-5555-1212', address: '横浜市戸塚区上倉田町8-2',
    channel: 'リピーター', inquiryDate: '2026-04-10', memo: '前回（5年前）も外壁塗装。紹介もしてくれる優良客',
  });
}
