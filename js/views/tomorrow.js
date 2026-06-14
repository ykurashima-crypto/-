// 職人「明日」画面: 明日の現場・集合時間・住所・地図・作業内容・注意事項。
import { store } from '../db.js';
import { h } from '../ui.js';
import { fmtDate } from '../model.js';
import { navigate } from '../app.js';
import { siteProcesses, currentStep } from './process.js';

function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// 明日に関係する現場: 着工が明日 / 明日の工程予定がある / 進行中で明日も継続
function tomorrowSites() {
  const t = tomorrowStr();
  const out = [];
  for (const s of store.all('sites')) {
    if (['paid', 'billed', 'done', 'lost'].includes(s.status)) continue;
    const procTomorrow = siteProcesses(s.id).some((p) => p.status !== 'done' && p.scheduledDate === t);
    if (s.constructionStart === t || procTomorrow || (s.status === 'work')) out.push(s);
  }
  return out;
}

export function renderTomorrow() {
  const sites = tomorrowSites();
  return h('div', {}, [
    h('h1', { class: 'page-title', text: '明日の予定' }),
    sites.length === 0
      ? h('div', { class: 'empty' }, [h('span', { class: 'ic', text: '🌙' }), '明日の予定はまだ登録されていません'])
      : h('div', {}, sites.map(card)),
  ]);
}

function card(s) {
  const cur = currentStep(s.id);
  return h('div', { class: 'card today-card tap', onclick: () => navigate('site/' + s.id) }, [
    h('div', { class: 'today-name', text: s.name }),
    h('div', { class: 'today-rows' }, [
      row('🕒 集合', (s.workStart || s.workEnd) ? `${s.workStart || '—'}〜${s.workEnd || '—'}` : '時間未設定'),
      row('📍 住所', s.address || '住所未登録'),
      row('🔨 作業', cur ? cur.processType : (s.constructionStart === tomorrowStr() ? '着工' : '—')),
    ]),
    s.address ? h('a', {
      class: 'btn secondary', target: '_blank', rel: 'noopener',
      href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.address),
      text: '🗺 地図を開く',
    }) : null,
    s.memo ? h('div', { style: 'margin-top:10px' }, [
      h('div', { class: 'section-title', text: '注意・約束' }),
      h('div', { class: 'warn-box', style: 'background:rgba(224,169,59,.12);color:#e6d3ab;border:1px solid rgba(224,169,59,.3)', text: s.memo }),
    ]) : null,
  ]);
}

function row(k, v) {
  return h('div', { class: 'today-row' }, [
    h('span', { class: 'tr-k', text: k }),
    h('span', { class: 'tr-v', text: v }),
  ]);
}
