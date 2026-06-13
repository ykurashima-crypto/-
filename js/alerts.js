// 「お金が漏れるぞ」アラート判定エンジン。
// ざるで雑な管理でも、仕事とお金が漏れないように、案件データから
// 「請求漏れ・入金漏れ・見積放置・写真不足・連絡忘れ」を自動で検出する。
import { store } from './db.js';
import { sitePhotos } from './model.js';

const DAY = 86400000;
const QUOTE_FOLLOWUP_DAYS = 7; // 見積提出から返答を待つ日数

function ymd(ts) { return new Date(ts).toISOString().slice(0, 10); }
function daysSince(dateStr, now) {
  if (!dateStr) return 0;
  return Math.floor((now - Date.parse(dateStr + 'T00:00:00')) / DAY);
}

function item(site, severity, icon, title, detail) {
  return { siteId: site.id, name: site.name, customer: site.customer || '', severity, icon, title, detail };
}

// 案件から漏れ候補を算出。money=お金の漏れ(高), work=仕事の漏れ(中)
export function computeAlerts(now = Date.now()) {
  const today = ymd(now);
  const tomorrow = ymd(now + DAY);
  const sites = store.all('sites');
  const estimates = store.all('estimates');
  const money = [];
  const work = [];

  for (const s of sites) {
    const hasEstimate = s.estimateAmount != null || estimates.some((e) => e.siteId === s.id);

    // ── お金の漏れ ──────────────────────────
    // 完工したのに請求書がまだ（請求漏れ＝最重要）
    if (s.status === 'done') {
      money.push(item(s, 'money', '🧾', '完工したのに請求書がまだ', '請求しないと入金されません。請求書を作りましょう'));
    }
    // 入金予定日を過ぎている（入金漏れ）
    if (s.status === 'billed' && s.paymentDueDate && s.paymentDueDate < today) {
      money.push(item(s, 'money', '⏰', `入金予定日（${s.paymentDueDate}）を過ぎています`, '入金を確認し、未入金なら督促を'));
    }
    // 見積を出したのに返事がない（受注漏れ）
    if (s.status === 'quoted' && s.estimateDate && daysSince(s.estimateDate, now) >= QUOTE_FOLLOWUP_DAYS) {
      money.push(item(s, 'money', '📨', `見積提出から${daysSince(s.estimateDate, now)}日 返事なし`, '追客の連絡をしないと失注します'));
    }
    // 見積がまだ作られていない（入口の漏れ）
    if (['survey', 'quote'].includes(s.status) && !hasEstimate) {
      money.push(item(s, 'money', '💸', '見積がまだ', '受注の入口です。早めに見積を作りましょう'));
    }

    // ── 仕事の漏れ ──────────────────────────
    if (s.surveyDate === tomorrow) work.push(item(s, 'work', '📋', '明日が現地調査', '準備と持ち物の確認を'));
    if (s.constructionStart === tomorrow) work.push(item(s, 'work', '🚧', '明日が着工', '段取り・材料・人員の確認を'));

    // 写真不足（追加工事の証拠が残らない）
    if (['work', 'done'].includes(s.status)) {
      const ph = sitePhotos(s.id);
      const hasBefore = ph.some((p) => p.phase === 'before');
      const hasAfter = ph.some((p) => p.phase === 'after');
      if (!hasBefore || (s.status === 'done' && !hasAfter)) {
        work.push(item(s, 'work', '📷', '写真が不足しています', '施工前後の写真は追加工事やクレーム時の証拠になります'));
      }
    }
    // 連絡予定日を過ぎている
    if (s.nextContact && s.nextContact < today && !['done', 'billed', 'paid', 'lost'].includes(s.status)) {
      work.push(item(s, 'work', '📞', `連絡予定日（${s.nextContact}）を過ぎています`, 'フォローの連絡を'));
    }
  }
  return { money, work };
}

// お金まわりの金額サマリー（未請求・入金待ちの合計）
export function moneySummary() {
  const sites = store.all('sites');
  const uninvoiced = sites.filter((s) => s.status === 'done')
    .reduce((a, s) => a + (s.contractAmount || s.estimateAmount || 0), 0);
  const awaitingPayment = sites.filter((s) => s.status === 'billed')
    .reduce((a, s) => a + (s.contractAmount || s.estimateAmount || 0), 0);
  return { uninvoiced, awaitingPayment };
}
