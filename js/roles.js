// 役割（ロール）の定義と権限判定。法人プランの役割分けの土台。
// 画面の出し分けはこれを使い、最終的な強制はサーバー側RLS(supabase/schema.sql)で行う。
export const ROLES = [
  { key: 'owner',    label: '経営者',   group: 'office' },
  { key: 'admin',    label: '管理者',   group: 'office' },
  { key: 'office',   label: '事務',     group: 'office' },
  { key: 'sales',    label: '営業',     group: 'office' },
  { key: 'manager',  label: '現場管理', group: 'office' },
  { key: 'craftsman', label: '職人',    group: 'field' },
  { key: 'partner',  label: '協力会社', group: 'field' },
  { key: 'worker',   label: '職人',     group: 'field' }, // 旧称・個人プラン互換
];

export function roleInfo(key) {
  return ROLES.find((r) => r.key === key) || ROLES.find((r) => r.key === 'worker');
}
export function roleLabel(key) { return roleInfo(key).label; }

// 現場系（職人・協力会社）＝金額や経営情報を見せない5画面UI
export function isFieldRole(key) { return roleInfo(key).group === 'field'; }
// 事務系＝金額・案件管理が見える管理UI
export function canSeeMoney(key) { return roleInfo(key).group === 'office'; }
// 案件・顧客・見積などを編集できる
export function canManage(key) { return ['owner', 'admin', 'office', 'sales', 'manager'].includes(key); }
// UIモード（タブ構成の出し分け）: field=職人5画面 / office=管理画面
export function uiMode(key) { return isFieldRole(key) ? 'worker' : 'admin'; }

// メンバー名簿で選べる役割（個人プラン互換の worker は隠す）
export const ASSIGNABLE_ROLES = ROLES.filter((r) => r.key !== 'worker');
