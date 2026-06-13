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

// 写真フェーズ
export const PHASES = [
  { key: 'before', label: '施工前', cls: 'phase-before' },
  { key: 'during', label: '施工中', cls: 'phase-during' },
  { key: 'after',  label: '施工後', cls: 'phase-after' },
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
  return store.insert('photos', { id, siteId, reportId, phase, comment, size: blob.size });
}

// ---- 初回サンプルデータ投入 ----
export function seedIfEmpty() {
  if (store.all('sites').length > 0) return;
  const mk = (o) => store.insert('sites', o);
  mk({
    name: '田中様邸 外壁塗装', customer: '田中 健一', phone: '090-1234-5678',
    address: '横浜市青葉区美しが丘2-1', status: 'work', manager: '佐藤',
    channel: 'チラシ', inquiryDate: '2026-05-02', surveyDate: '2026-05-08',
    estimateDate: '2026-05-12', estimateAmount: 1280000, constructionStart: '2026-06-10',
    nextContact: '2026-06-15',
  });
  mk({
    name: '鈴木様邸 屋根・外壁', customer: '鈴木 美和', phone: '080-2222-3333',
    address: '川崎市麻生区上麻生5-12', status: 'quoted', manager: '佐藤',
    channel: '紹介', inquiryDate: '2026-06-01', surveyDate: '2026-06-06',
    estimateDate: '2026-06-09', estimateAmount: 1650000, constructionStart: '',
    nextContact: '2026-06-16',
  });
  mk({
    name: '高橋アパート 共用部', customer: '高橋不動産', phone: '044-555-6677',
    address: '川崎市多摩区登戸1-3', status: 'won', manager: '山本',
    channel: 'Web', inquiryDate: '2026-05-20', surveyDate: '2026-05-25',
    estimateDate: '2026-05-28', estimateAmount: 980000, constructionStart: '2026-06-18',
    nextContact: '2026-06-17',
  });
  mk({
    name: '伊藤様邸 ベランダ防水', customer: '伊藤 大輔', phone: '090-8888-9999',
    address: '横浜市港北区日吉3-7', status: 'lead', manager: '佐藤',
    channel: 'Web', inquiryDate: '2026-06-12', surveyDate: '', estimateDate: '',
    estimateAmount: null, constructionStart: '', nextContact: '2026-06-14',
  });
}
