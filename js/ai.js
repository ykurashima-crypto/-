// AI事務員（無料版）: 案件データから、お客様への連絡文や日報の要約を自動で下書きする。
// ※ 完全無料・APIキー不要・端末内で生成（定型文＋データ差し込み）。
//    より自然な生成や自由要約は外部LLM(有料API)が必要。LLM接続は js/config.js の aiEndpoint で
//    将来有効化する設計（キーはフロントに置かず、サーバー(Edge Function)経由）。下記 aiGenerate 参照。
import { store } from './db.js';
import { getCompany } from './company.js';
import { yen, fmtDate, todayStr } from './model.js';

function sign(c) { return c.name ? `\n\n${c.name}${c.phone ? '\nTEL: ' + c.phone : ''}` : ''; }
function billable(s) { return s.contractAmount || s.estimateAmount || 0; }

// 見積の追客（提出後・返答待ち）
export function draftFollowup(site, c = getCompany()) {
  return `${site.customer || 'お客様'} 様

いつもお世話になっております。${c.name || ''}です。
先日お見積り（${site.name}）をお送りした件、その後のご検討状況はいかがでしょうか。
ご不明点やご予算のご相談などございましたら、お気軽にご連絡ください。
どうぞよろしくお願いいたします。${sign(c)}`;
}

// 入金のお願い（支払期限超過）
export function draftPaymentReminder(site, c = getCompany()) {
  return `${site.customer || 'お客様'} 様

お世話になっております。${c.name || ''}です。
${site.name}の工事代金 ${yen(billable(site))}（お支払期限：${site.paymentDueDate ? fmtDate(site.paymentDueDate) : '—'}）につきまして、
本日時点でお振込の確認が取れておりません。行き違いの際はご容赦ください。
ご確認いただけますと幸いです。よろしくお願いいたします。${sign(c)}`;
}

// 完工のお礼＋請求のご案内
export function draftCompletion(site, c = getCompany()) {
  return `${site.customer || 'お客様'} 様

このたびは${site.name}の工事をお任せいただき、誠にありがとうございました。
工事が完了いたしましたので、ご請求書（${yen(billable(site))}）をお送りいたします。
ご確認のほど、よろしくお願いいたします。${sign(c)}`;
}

// 着工・日程のご連絡
export function draftSchedule(site, c = getCompany()) {
  return `${site.customer || 'お客様'} 様

お世話になっております。${c.name || ''}です。
${site.name}の工事につきまして、${site.constructionStart ? fmtDate(site.constructionStart) + 'より' : '近日'}着工を予定しております。
${site.workStart ? '当日は' + site.workStart + '頃に伺います。' : ''}
ご不在等ございましたらご連絡ください。よろしくお願いいたします。${sign(c)}`;
}

// 日報の要約（複数日報→要点）
export function summarizeReports(reports) {
  if (!reports || reports.length === 0) return '日報がありません。';
  const recent = reports.slice(0, 5);
  const lines = recent.map((r) => `・${fmtDate(r.date)}：${(r.workContent || '（記載なし）').replace(/\n/g, ' ')}`);
  const problems = recent.filter((r) => r.problems).map((r) => `・${fmtDate(r.date)}：${r.problems.replace(/\n/g, ' ')}`);
  let out = '【作業の記録】\n' + lines.join('\n');
  if (problems.length) out += '\n\n【問題・追加工事】\n' + problems.join('\n');
  return out;
}

// 連絡すべき案件と、その文面タイプを抽出（AI事務員の「今日の連絡」）
export function contactList(now = todayStr()) {
  const out = [];
  for (const s of store.all('sites')) {
    if (s.status === 'done') out.push({ site: s, type: 'completion', label: '完工→請求のご案内' });
    else if (s.status === 'billed' && s.paymentDueDate && s.paymentDueDate < now) out.push({ site: s, type: 'payment', label: '入金のお願い' });
    else if (s.status === 'quoted' && s.estimateDate) out.push({ site: s, type: 'followup', label: '見積の追客' });
    else if (s.constructionStart === now || s.constructionStart > now && daysTo(s.constructionStart, now) === 1) out.push({ site: s, type: 'schedule', label: '着工のご連絡' });
  }
  return out;
}
function daysTo(d, now) { return Math.round((Date.parse(d + 'T00:00:00') - Date.parse(now + 'T00:00:00')) / 86400000); }

export function draftByType(type, site) {
  if (type === 'payment') return draftPaymentReminder(site);
  if (type === 'completion') return draftCompletion(site);
  if (type === 'schedule') return draftSchedule(site);
  return draftFollowup(site);
}

// ── 将来の有料LLM接続（任意）────────────────
// config.js に aiEndpoint があればサーバー(Edge Function)経由でLLM生成を呼ぶ。
// APIキーはサーバー側に保持し、フロントには置かない。未設定なら無料の定型文を使う。
export function aiEnabled() { return !!(window.NURILOG_CONFIG && window.NURILOG_CONFIG.aiEndpoint); }
export async function aiGenerate(prompt) {
  if (!aiEnabled()) throw new Error('AI(LLM)未設定');
  const res = await fetch(window.NURILOG_CONFIG.aiEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error('AI生成に失敗しました');
  return (await res.json()).text || '';
}
