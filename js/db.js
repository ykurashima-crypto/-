// データ層: 構造化データは localStorage、写真(Blob)は IndexedDB に保存する。
// バックエンド不要でオフライン動作するMVP向けの軽量ストア。

const LS_KEY = 'nurilog.v1';

const defaultData = {
  sites: [],   // 案件/現場
  reports: [], // 日報
  photos: [],  // 写真メタ情報 (実体は IndexedDB)
  estimates: [], // 見積
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

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---- 汎用コレクション操作 ----
export const store = {
  all(coll) { return data[coll].slice(); },
  get(coll, id) { return data[coll].find((x) => x.id === id) || null; },
  insert(coll, obj) {
    const rec = { id: uid(coll), createdAt: Date.now(), ...obj };
    data[coll].push(rec);
    persist();
    return rec;
  },
  update(coll, id, patch) {
    const rec = data[coll].find((x) => x.id === id);
    if (!rec) return null;
    Object.assign(rec, patch);
    persist();
    return rec;
  },
  remove(coll, id) {
    data[coll] = data[coll].filter((x) => x.id !== id);
    persist();
  },
  replaceAll(next) { data = { ...structuredClone(defaultData), ...next }; persist(); },
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
