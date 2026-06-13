// サーバー側ストア: チームごとにレコードを保持し、書き込みごとに
// 単調増加する rev を付与する。これにより端末の時計に依存せず確実な差分配信ができる。
// 永続化は単純なJSONファイル。写真Blobはディスク上に個別保存。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
export const BLOB_DIR = path.join(DATA_DIR, 'blobs');

const COLLECTIONS = ['sites', 'reports', 'estimates', 'photos', 'customers', 'surveys'];

fs.mkdirSync(BLOB_DIR, { recursive: true });

let db = load();

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { teams: {} };
  }
}

let saveTimer = null;
function save() {
  // 短時間の連続書き込みをまとめてディスクに書き出す
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
  }, 50);
}

function team(code) {
  if (!db.teams[code]) {
    db.teams[code] = { rev: 0, records: Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) };
  }
  // 後方互換: コレクション欠落時に補完
  for (const c of COLLECTIONS) if (!db.teams[code].records[c]) db.teams[code].records[c] = {};
  return db.teams[code];
}

// クライアントからの変更をLWWでマージし、新しい rev を採番する。
export function applyChanges(code, changes) {
  const t = team(code);
  for (const coll of COLLECTIONS) {
    for (const inc of changes[coll] || []) {
      if (!inc || !inc.id) continue;
      const cur = t.records[coll][inc.id];
      // 既存より新しい(または同等の)更新だけ採用。古い更新は無視。
      if (cur && (cur.updatedAt || 0) > (inc.updatedAt || 0)) continue;
      const rec = { ...inc, rev: ++t.rev };
      t.records[coll][inc.id] = rec;
      // 写真が削除されたらBlobも消す
      if (coll === 'photos' && inc.deleted) deleteBlob(inc.id);
    }
  }
  save();
  return t.rev;
}

// cursor(rev) より後に更新されたレコードを返す。
export function changesSince(code, cursor) {
  const t = team(code);
  const out = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  for (const coll of COLLECTIONS) {
    for (const rec of Object.values(t.records[coll])) {
      if ((rec.rev || 0) > cursor) out[coll].push(rec);
    }
  }
  return { changes: out, cursor: t.rev };
}

export function blobPath(id) {
  // パストラバーサル防止: idは英数・アンダースコア・ハイフンのみ許可（UUIDのハイフンを含む）
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return path.join(BLOB_DIR, id);
}

export function saveBlob(id, buffer) {
  const p = blobPath(id);
  if (!p) return false;
  fs.writeFileSync(p, buffer);
  return true;
}

export function readBlob(id) {
  const p = blobPath(id);
  if (!p || !fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

function deleteBlob(id) {
  const p = blobPath(id);
  if (p && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { /* noop */ } }
}
