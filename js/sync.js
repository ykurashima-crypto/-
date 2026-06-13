// 共有同期クライアント: ローカル(オフライン)をキャッシュとして使いつつ、
// サーバーと差分同期する。送信は updatedAt(端末時計) 基準、受信はサーバー rev 基準で、
// 端末間の時計ズレに影響されないようにしている。写真Blobは別途アップロード/ダウンロード。
import { store, setChangeHandler, getBlob, putBlob, blobURL } from './db.js';

const CFG_KEY = 'nurilog.share';

export function getConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }
  catch { return {}; }
}
export function setConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}
export function isEnabled() {
  const c = getConfig();
  return !!(c.enabled && c.teamCode);
}
function base() {
  const c = getConfig();
  return (c.serverUrl || '').replace(/\/$/, ''); // 空ならsame-origin
}

// 同期カーソル等（チームごと）
function ns() { return 'nurilog.sync.' + (getConfig().teamCode || '_'); }
function getNum(key, def = 0) { return Number(localStorage.getItem(ns() + '.' + key)) || def; }
function setNum(key, v) { localStorage.setItem(ns() + '.' + key, String(v)); }

// アップロード済み写真ID（local-only、同期対象外）
function uploadedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(ns() + '.uploaded')) || []); }
  catch { return new Set(); }
}
function saveUploaded(set) { localStorage.setItem(ns() + '.uploaded', JSON.stringify([...set])); }

let syncing = false;
let pending = false;
let lastError = null;
const listeners = new Set();

export function onSyncEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(state) { for (const fn of listeners) fn(state); }
export function syncState() { return { syncing, enabled: isEnabled(), lastError, lastSync: getNum('at') }; }

async function uploadPendingPhotos() {
  const set = uploadedSet();
  let count = 0;
  for (const p of store.allRaw('photos')) {
    if (p.deleted || set.has(p.id)) continue;
    const blob = await getBlob(p.id);
    if (!blob) continue; // この端末に実体がない
    const res = await fetch(`${base()}/api/blob/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob,
    });
    if (res.ok) { set.add(p.id); count++; }
  }
  if (count) saveUploaded(set);
  return count;
}

async function downloadPhotos(ids) {
  const set = uploadedSet();
  for (const id of ids) {
    if (await getBlob(id)) { set.add(id); continue; }
    try {
      const res = await fetch(`${base()}/api/blob/${id}`);
      if (res.ok) { await putBlob(id, await res.blob()); set.add(id); }
    } catch { /* 後続の同期で再取得 */ }
  }
  saveUploaded(set);
}

export async function syncNow() {
  if (!isEnabled()) return { skipped: true };
  if (syncing) { pending = true; return { busy: true }; }
  syncing = true; lastError = null; emit(syncState());
  try {
    const cursor = getNum('cursor');
    const pushCutoff = Date.now();
    const lastPushedAt = getNum('pushedAt');
    const changes = store.changedSince(lastPushedAt);

    const res = await fetch(`${base()}/api/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamCode: getConfig().teamCode, cursor, changes }),
    });
    if (!res.ok) throw new Error('同期失敗 (' + res.status + ')');
    const data = await res.json();

    const newPhotoIds = store.mergeIncoming(data.changes || {});
    setNum('cursor', data.cursor || cursor);
    setNum('pushedAt', pushCutoff);

    await uploadPendingPhotos();
    await downloadPhotos(newPhotoIds);

    setNum('at', Date.now());
    emit(syncState());
    document.dispatchEvent(new CustomEvent('nurilog:synced'));
    return { ok: true };
  } catch (e) {
    lastError = e.message || String(e);
    emit(syncState());
    return { error: lastError };
  } finally {
    syncing = false;
    if (pending) { pending = false; setTimeout(syncNow, 300); }
  }
}

// 接続確認（チーム参加時）
export async function ping() {
  const res = await fetch(`${base()}/api/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamCode: getConfig().teamCode, cursor: 0, changes: {} }),
  });
  return res.ok;
}

// ローカル変更で自動同期（デバウンス）
let debounce = null;
export function initSync() {
  setChangeHandler(() => {
    if (!isEnabled()) return;
    clearTimeout(debounce);
    debounce = setTimeout(syncNow, 1200);
  });
  window.addEventListener('online', () => { if (isEnabled()) syncNow(); });
  // 定期同期（他端末の変更を取り込む）
  setInterval(() => { if (isEnabled() && navigator.onLine) syncNow(); }, 20000);
  // 起動時
  if (isEnabled()) syncNow();
}

// 設定変更後にローカルの全レコードを「未送信」に戻して初回フル同期させる
export function resetCursorsForFullSync() {
  setNum('cursor', 0);
  setNum('pushedAt', 0);
  localStorage.removeItem(ns() + '.uploaded');
}

export { blobURL };
