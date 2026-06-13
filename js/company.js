// 自社情報（屋号・住所・電話・登録番号・振込先・ロゴ）。
// 見積書/請求書PDFのヘッダーに使う。まずは端末内(localStorage)に保存する簡易版。
// ※ クラウドで複数端末共有する場合は将来 organizations テーブルへ移行予定。
const KEY = 'nurilog.company';

const DEFAULTS = {
  name: '',          // 屋号 / 会社名
  owner: '',         // 代表者名
  postalCode: '',
  address: '',
  phone: '',
  email: '',
  invoiceRegNo: '',  // インボイス登録番号 (T+13桁)
  bank: '',          // 振込先（銀行・支店・種別・口座番号・名義）
  logo: '',          // ロゴ画像 (dataURL, 任意)
};

export function getCompany() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
  catch { return { ...DEFAULTS }; }
}

export function setCompany(patch) {
  const next = { ...getCompany(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

// 自社情報が最低限そろっているか（PDF出力前の確認に使用）。
export function companyReady() {
  const c = getCompany();
  return !!(c.name && (c.phone || c.address));
}
