// 「お金が漏れるぞ」アラート判定エンジン。
// ざるで雑な管理でも、仕事とお金が漏れないように、案件データから
// 「請求漏れ・入金漏れ・見積放置・写真不足・連絡忘れ」を自動で検出する。
import { store } from './db.js';
import { sitePhotos } from './model.js';

const DAY = 86400000;
const QUOTE_FOLLOWUP_DAYS = 3; // 見積提出から返答を待つ日数（3日でリマインド）

function ymd(ts) { return new Date(ts).toISOString().slice(0, 10); }
function daysSince(dateStr, now) {
  if (!dateStr) return 0;
  return Math.floor((now - Date.parse(dateStr + 'T00:00:00')) / DAY);
}

// action: ホーム「今日やること」のワンタップ行動ボタンの種別
//   'invoice'=請求書を作る / 'payment'=入金済みにする / 'call'=連絡した /
//   'estimate'=見積を作る / 'survey'=現地調査する / 'photo'=写真を追加 / 'site'=現場を見る
function item(site, severity, icon, title, detail, action = null) {
  return {
    siteId: site.id, name: site.name, customer: site.customer || '',
    phone: site.phone || '', severity, icon, title, detail, action,
  };
}

// 案件から「今日やること」を算出。money=お金の漏れ(高), work=仕事の漏れ(中)。
// tasks は money→work の優先順に並べた統合リスト（ホームはこれを表示）。
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
      money.push(item(s, 'money', '🧾', '完工したのに請求書がまだ', '請求しないと入金されません。請求書を作りましょう', 'invoice'));
    }
    // 入金予定日を過ぎている（入金漏れ）
    if (s.status === 'billed' && s.paymentDueDate && s.paymentDueDate < today) {
      money.push(item(s, 'money', '⏰', `入金予定日（${s.paymentDueDate}）を過ぎています`, '入金を確認し、未入金なら督促を', 'payment'));
    }
    // 見積を出したのに返事がない（受注漏れ）
    if (s.status === 'quoted' && s.estimateDate && daysSince(s.estimateDate, now) >= QUOTE_FOLLOWUP_DAYS) {
      money.push(item(s, 'money', '📨', `見積提出から${daysSince(s.estimateDate, now)}日 返事なし`, '追客の連絡をしないと失注します', 'call'));
    }
    // 見積がまだ作られていない（入口の漏れ）
    if (['survey', 'quote'].includes(s.status) && !hasEstimate) {
      money.push(item(s, 'money', '💸', '見積がまだ', '受注の入口です。早めに見積を作りましょう', 'estimate'));
    }

    // ── 仕事の漏れ ──────────────────────────
    if (s.surveyDate === today) work.push(item(s, 'work', '📋', '今日は現地調査', '建物・劣化を記録しましょう', 'survey'));
    else if (s.surveyDate === tomorrow) work.push(item(s, 'work', '📋', '明日が現地調査', '準備と持ち物の確認を', 'site'));
    if (s.constructionStart === today) work.push(item(s, 'work', '🚧', '今日が着工', '段取り・材料・人員の確認を', 'site'));
    else if (s.constructionStart === tomorrow) work.push(item(s, 'work', '🚧', '明日が着工', '段取り・材料・人員の確認を', 'site'));

    // 写真不足（追加工事の証拠が残らない）
    if (['work', 'done'].includes(s.status)) {
      const ph = sitePhotos(s.id);
      const hasBefore = ph.some((p) => p.phase === 'before');
      const hasAfter = ph.some((p) => p.phase === 'after');
      if (!hasBefore || (s.status === 'done' && !hasAfter)) {
        work.push(item(s, 'work', '📷', '写真が不足しています', '施工前後の写真は追加工事やクレーム時の証拠になります', 'photo'));
      }
    }
    // 連絡予定日が今日 or 過ぎている
    if (s.nextContact && s.nextContact <= today && !['done', 'billed', 'paid', 'lost'].includes(s.status)) {
      const over = s.nextContact < today;
      work.push(item(s, 'work', '📞', over ? `連絡予定日（${s.nextContact}）を過ぎています` : '今日が連絡予定日', 'フォローの連絡を', 'call'));
    }
  }
  return { money, work, tasks: [...money, ...work] };
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
