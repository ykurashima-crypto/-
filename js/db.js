// データ層: 構造化データは localStorage、写真(Blob)は IndexedDB に保存する。
// バックエンド不要でオフライン動作するMVP向けの軽量ストア。

const LS_KEY = 'nurilog.v1';

const defaultData = {
  sites: [],   // 案件/現場
  reports: [], // 日報
  photos: [],  // 写真メタ情報 (実体は IndexedDB)
  estimates: [], // 見積
  customers: [], // 顧客
};

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(defaultData);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(defaultData), ...parsed };
  } catch (e) {
    console.warn('データ読込に失敗しました', e);
    return structuredClone(defaultData);
  }
}

let data = load();

function persist() {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

// レコードIDは UUID(v4) を採番する。
// 本番(Supabase)の uuid 主キーにそのまま入るようにし、クライアント生成IDの型不一致を防ぐ。
// 引数 prefix は後方互換のため受け取るが、値には影響しない（純粋なUUIDを返す）。
export function uid(_prefix = 'id') {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // セキュアコンテキスト外(file://等)向けフォールバック（RFC4122 v4）
  const buf = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(buf);
  else for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
  buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
  buf[8] = (buf[8] & 0x3f) | 0x80; // variant
  const hex = [...buf].map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export const SYNC_COLLECTIONS = ['sites', 'reports', 'estimates', 'photos', 'customers'];

// 同期通知（ローカル変更時に共有同期をトリガーするためのフック）
let onChange = null;
export function setChangeHandler(fn) { onChange = fn; }
function notify() { if (onChange) onChange(); }

// ---- 汎用コレクション操作 ----
// すべてのレコードは同期用に updatedAt と deleted(トゥームストーン) を持つ。
// 既定の all()/get() は削除済みを除外する。同期では allRaw() を使う。
export const store = {
  all(coll) { return data[coll].filter((x) => !x.deleted); },
  allRaw(coll) { return data[coll].slice(); },
  get(coll, id) {
    const r = data[coll].find((x) => x.id === id);
    return r && !r.deleted ? r : null;
  },
  insert(coll, obj) {
    const now = Date.now();
    const rec = { id: uid(coll), createdAt: now, updatedAt: now, deleted: false, ...obj };
    data[coll].push(rec);
    persist();
    notify();
    return rec;
  },
  // 既存IDを尊重して挿入（同期で受信したレコードをローカル生成する場合などに使用）
  insertWithId(coll, obj) {
    const now = Date.now();
    const rec = { createdAt: now, updatedAt: now, deleted: false, ...obj };
    data[coll].push(rec);
    persist();
    notify();
    return rec;
  },
  update(coll, id, patch) {
    const rec = data[coll].find((x) => x.id === id);
    if (!rec) return null;
    Object.assign(rec, patch, { updatedAt: Date.now() });
    persist();
    notify();
    return rec;
  },
  // 論理削除（トゥームストーン）。削除を他端末へ伝播させる。
  remove(coll, id) {
    const rec = data[coll].find((x) => x.id === id);
    if (rec) { rec.deleted = true; rec.updatedAt = Date.now(); persist(); notify(); }
  },
  // 同期: since より後に更新されたレコード（削除済み含む）
  changedSince(since) {
    const out = {};
    for (const coll of SYNC_COLLECTIONS) {
      out[coll] = data[coll].filter((x) => (x.updatedAt || 0) > since);
    }
    return out;
  },
  // 同期: サーバー由来レコードをLWWでマージ。新規取得した未取得画像IDを返す。
  mergeIncoming(incoming) {
    const newPhotoIds = [];
    for (const coll of SYNC_COLLECTIONS) {
      for (const inc of incoming[coll] || []) {
        const idx = data[coll].findIndex((x) => x.id === inc.id);
        if (idx === -1) {
          data[coll].push(inc);
          if (coll === 'photos' && !inc.deleted) newPhotoIds.push(inc.id);
        } else if ((inc.updatedAt || 0) > (data[coll][idx].updatedAt || 0)) {
          const wasMissing = coll === 'photos' && data[coll][idx].deleted;
          data[coll][idx] = inc;
          if (coll === 'photos' && !inc.deleted && wasMissing) newPhotoIds.push(inc.id);
        }
      }
    }
    persist();
    return newPhotoIds;
  },
  replaceAll(next) { data = { ...structuredClone(defaultData), ...next }; persist(); notify(); },
  raw() { return data; },
};

// ---- IndexedDB: 写真Blob保存 ----
const IDB_NAME = 'nurilog-photos';
const IDB_STORE = 'photos';
let dbPromise = null;

function openIDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function putBlob(id, blob) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const r = tx.objectStore(IDB_STORE).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

export async function deleteBlob(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// オブジェクトURLのキャッシュ（サムネ表示の負荷軽減）
const urlCache = new Map();
export async function blobURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await getBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}
export function revokeURL(id) {
  const url = urlCache.get(id);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(id); }
}
