// データのバックアップ／復元。
// デモ(端末内保存)モードの命綱：端末が壊れても、保存したJSONから案件・写真を戻せる。
// 構造化データ(localStorage)＋写真(IndexedDB)を1ファイルにまとめる。
// ※ クラウドモードはSupabase側に保存・自動バックアップされるため、これは主にデモ用の手動バックアップ。
import { store, getBlob, putBlob } from './db.js';
import { getCompany, setCompany } from './company.js';

const BACKUP_VERSION = 1;

// 構造化データのみ（写真メタ含む・写真実体は含まない）
export function exportData() {
  return {
    app: 'nurilog',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    company: getCompany(),
    data: store.raw(),
  };
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve('');
    r.readAsDataURL(blob);
  });
}

// 写真実体(Blob)もbase64で含めた完全バックアップ
export async function exportDataWithPhotos() {
  const out = exportData();
  out.blobs = {};
  for (const p of store.allRaw('photos')) {
    if (p.deleted) continue;
    const blob = await getBlob(p.id);
    if (blob) out.blobs[p.id] = await blobToDataURL(blob);
  }
  return out;
}

// バックアップJSONをファイルとして保存（ダウンロード）
export async function downloadBackup(includePhotos = true) {
  const payload = includePhotos ? await exportDataWithPhotos() : exportData();
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nurilog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { count: countRecords(payload.data), photos: payload.blobs ? Object.keys(payload.blobs).length : 0 };
}

function countRecords(data) {
  return Object.values(data || {}).reduce((a, arr) => a + (Array.isArray(arr) ? arr.length : 0), 0);
}

// バックアップ検証（取り込み前のチェック）
export function validateBackup(obj) {
  if (!obj || obj.app !== 'nurilog' || typeof obj.data !== 'object') return false;
  return Array.isArray(obj.data.sites);
}

// 復元（全置換）。写真実体も戻す。
export async function importBackup(obj) {
  if (!validateBackup(obj)) throw new Error('バックアップ形式が正しくありません');
  store.replaceAll(obj.data);
  if (obj.company) setCompany(obj.company);
  if (obj.blobs) {
    for (const [id, dataUrl] of Object.entries(obj.blobs)) {
      try { const blob = await (await fetch(dataUrl)).blob(); await putBlob(id, blob); } catch { /* 1枚失敗しても継続 */ }
    }
  }
  return { count: countRecords(obj.data) };
}
