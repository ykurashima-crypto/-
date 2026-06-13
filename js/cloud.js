// 本番（クラウド）モード: Supabase 認証 + 会社単位の差分同期 + 写真ストレージ。
// 設定(js/config.js)が空のときは何もしない＝デモ(端末内保存)モードのまま影響を与えない。
//
// 設計方針:
//  - 既存のローカルストア(db.js)をUIの源泉として維持（オフライン・高速）。
//  - ログイン後、所属会社(company_id)と役割(role)をプロフィールから取得。
//  - ローカル変更を Supabase に upsert、サーバーの updated_at を基準に差分取得（LWW）。
//  - 写真Blobは Supabase Storage(photos バケット) に <company_id>/<id>.jpg で保存。
//  - 権限はサーバー側RLSで強制（このクライアントのチェックは利便性のための二次的なもの）。
import { store, SYNC_COLLECTIONS, setChangeHandler, getBlob, putBlob } from './db.js';

let sb = null;            // Supabase クライアント
let session = null;       // 認証セッション
let profile = null;       // { company_id, role, full_name }
const listeners = new Set();

export function cloudEnabled() {
  const c = window.NURILOG_CONFIG || {};
  return !!(c.supabaseUrl && c.supabaseAnonKey);
}
export function onCloud(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(cloudState()); }
export function cloudState() {
  return {
    enabled: cloudEnabled(),
    signedIn: !!session,
    email: session?.user?.email || null,
    role: profile?.role || null,
    companyId: profile?.company_id || null,
    fullName: profile?.full_name || null,
  };
}
export function currentRole() { return profile?.role || null; }

// ローカル↔DB のフィールド対応（camelCase ↔ snake_case）
const MAP = {
  sites: { siteId: null, name: 'name', customer: 'customer', customerId: 'customer_id', phone: 'phone',
    address: 'address', manager: 'manager', channel: 'channel', status: 'status', inquiryDate: 'inquiry_date',
    surveyDate: 'survey_date', estimateDate: 'estimate_date', estimateAmount: 'estimate_amount',
    contractAmount: 'contract_amount', constructionStart: 'construction_start',
    completionDate: 'completion_date', invoiceDate: 'invoice_date', paymentDueDate: 'payment_due_date',
    paymentDate: 'payment_date', paymentStatus: 'payment_status', nextContact: 'next_contact' },
  customers: { name: 'name', phone: 'phone', address: 'address', channel: 'channel',
    inquiryDate: 'inquiry_date', email: 'email', postalCode: 'postal_code',
    customerType: 'customer_type', memo: 'note' },
  reports: { siteId: 'site_id', date: 'date', worker: 'worker', workContent: 'work_content',
    materials: 'materials', hours: 'hours', problems: 'problems' },
  estimates: { siteId: 'site_id', total: 'total', sell: 'sell', profit: 'profit', margin: 'margin' },
  photos: { siteId: 'site_id', reportId: 'report_id', phase: 'phase', comment: 'comment',
    size: 'size', storagePath: 'storage_path' },
};
const COMMON_OUT = ['id', 'deleted'];

function toRow(coll, rec) {
  const row = { id: rec.id, company_id: profile.company_id, deleted: !!rec.deleted };
  for (const [local, col] of Object.entries(MAP[coll])) {
    if (!col) continue;
    if (rec[local] !== undefined) row[col] = rec[local] === '' ? null : rec[local];
  }
  return row;
}
function fromRow(coll, row) {
  const rec = { id: row.id, deleted: !!row.deleted,
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now() };
  for (const [local, col] of Object.entries(MAP[coll])) {
    if (!col) continue;
    rec[local] = row[col] ?? (typeof row[col] === 'number' ? row[col] : (row[col] === null ? '' : row[col]));
  }
  return rec;
}

// ---- 同期カーソル/アップロード済み記録（会社ごと localStorage）----
function ns() { return 'nurilog.cloud.' + (profile?.company_id || '_'); }
function getCursor(coll) { return localStorage.getItem(`${ns()}.cur.${coll}`) || '1970-01-01T00:00:00Z'; }
function setCursor(coll, v) { localStorage.setItem(`${ns()}.cur.${coll}`, v); }
function getPushedAt() { return Number(localStorage.getItem(`${ns()}.pushedAt`)) || 0; }
function setPushedAt(v) { localStorage.setItem(`${ns()}.pushedAt`, String(v)); }
function uploadedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(`${ns()}.uploaded`)) || []); } catch { return new Set(); }
}
function saveUploaded(s) { localStorage.setItem(`${ns()}.uploaded`, JSON.stringify([...s])); }

// ---- 初期化・認証 ----
export async function initCloud() {
  if (!cloudEnabled()) return false;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const c = window.NURILOG_CONFIG;
  sb = createClient(c.supabaseUrl, c.supabaseAnonKey);
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) await loadProfile();
  sb.auth.onAuthStateChange(async (_e, s) => {
    session = s;
    if (session) { await loadProfile(); startAutoSync(); } else { profile = null; }
    emit();
  });
  if (session) startAutoSync();
  emit();
  return true;
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signOut() {
  await sb.auth.signOut();
  session = null; profile = null; emit();
}

async function loadProfile() {
  const { data, error } = await sb.from('profiles')
    .select('company_id, role, full_name').eq('id', session.user.id).single();
  if (error) { console.warn('プロフィール取得失敗', error.message); profile = null; return; }
  profile = data;
}

// ---- 同期本体 ----
let syncing = false, pending = false, lastError = null;
export function syncStatus() { return { syncing, lastError }; }

export async function cloudSync() {
  if (!sb || !session || !profile?.company_id) return { skipped: true };
  if (syncing) { pending = true; return { busy: true }; }
  syncing = true; lastError = null; emit();
  try {
    // 1) 受信: 各テーブル updated_at > カーソル
    for (const coll of SYNC_COLLECTIONS) {
      const cur = getCursor(coll);
      const { data, error } = await sb.from(coll).select('*')
        .eq('company_id', profile.company_id).gt('updated_at', cur).order('updated_at', { ascending: true });
      if (error) throw error;
      if (data?.length) {
        const incoming = {}; SYNC_COLLECTIONS.forEach((c) => (incoming[c] = []));
        incoming[coll] = data.map((r) => fromRow(coll, r));
        const newPhotoIds = store.mergeIncoming(incoming);
        setCursor(coll, data[data.length - 1].updated_at);
        if (coll === 'photos') await downloadPhotos(newPhotoIds);
      }
    }
    // 2) 送信: ローカルで前回送信以降に変更したもの
    const pushCut = Date.now();
    const changed = store.changedSince(getPushedAt());
    for (const coll of SYNC_COLLECTIONS) {
      const rows = (changed[coll] || []).map((r) => toRow(coll, r));
      if (coll === 'photos') {
        for (const r of changed.photos) { if (!r.deleted) r.storagePath = `${profile.company_id}/${r.id}.jpg`; }
      }
      if (rows.length) {
        const { error } = await sb.from(coll).upsert(rows, { onConflict: 'id' });
        if (error) throw error; // 権限(RLS)違反などはここで検知
      }
    }
    setPushedAt(pushCut);
    // 3) 写真アップロード
    await uploadPendingPhotos();
    emit();
    document.dispatchEvent(new CustomEvent('nurilog:synced'));
    return { ok: true };
  } catch (e) {
    lastError = e.message || String(e); emit();
    return { error: lastError };
  } finally {
    syncing = false;
    if (pending) { pending = false; setTimeout(cloudSync, 300); }
  }
}

async function uploadPendingPhotos() {
  const set = uploadedSet();
  for (const p of store.allRaw('photos')) {
    if (p.deleted || set.has(p.id)) continue;
    const blob = await getBlob(p.id);
    if (!blob) continue;
    const path = `${profile.company_id}/${p.id}.jpg`;
    const { error } = await sb.storage.from('photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (!error) { set.add(p.id); }
  }
  saveUploaded(set);
}

async function downloadPhotos(ids) {
  const set = uploadedSet();
  for (const id of ids) {
    if (await getBlob(id)) { set.add(id); continue; }
    const path = `${profile.company_id}/${id}.jpg`;
    const { data, error } = await sb.storage.from('photos').download(path);
    if (!error && data) { await putBlob(id, data); set.add(id); }
  }
  saveUploaded(set);
}

// ---- 自動同期 ----
let debounce = null, started = false;
function startAutoSync() {
  if (started) return; started = true;
  setChangeHandler(() => { clearTimeout(debounce); debounce = setTimeout(cloudSync, 1200); });
  window.addEventListener('online', cloudSync);
  setInterval(() => { if (navigator.onLine) cloudSync(); }, 20000);
  cloudSync();
}
