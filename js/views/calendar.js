// 案件カレンダー: 現調・着工・完工・見積提出・入金予定を月表示する。
// スマホで見やすいよう、月グリッド（予定のある日に色ドット）＋その月の予定一覧。
import { store } from '../db.js';
import { h } from '../ui.js';
import { fmtDate } from '../model.js';
import { navigate } from '../app.js';

// 案件から日付イベントを抽出
const EVENT_DEFS = [
  { key: 'surveyDate', label: '現調', cls: 'ev-survey' },
  { key: 'estimateDate', label: '見積提出', cls: 'ev-quote' },
  { key: 'constructionStart', label: '着工', cls: 'ev-start' },
  { key: 'completionDate', label: '完工', cls: 'ev-done' },
  { key: 'paymentDueDate', label: '入金予定', cls: 'ev-pay' },
];

export function caseEvents() {
  const out = [];
  for (const s of store.all('sites')) {
    for (const d of EVENT_DEFS) {
      if (s[d.key]) out.push({ date: s[d.key], label: d.label, cls: d.cls, siteId: s.id, name: s.name });
    }
  }
  return out;
}

// container に月カレンダーを描画。state は {year, month} を保持。
export function renderCasesCalendar() {
  const today = new Date();
  const state = { y: today.getFullYear(), m: today.getMonth() }; // m: 0-11
  const root = h('div', {});

  const draw = () => {
    const events = caseEvents();
    const first = new Date(state.y, state.m, 1);
    const startDow = first.getDay(); // 0=日
    const daysInMonth = new Date(state.y, state.m + 1, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = (d) => `${state.y}-${pad(state.m + 1)}-${pad(d)}`;
    const monthPrefix = `${state.y}-${pad(state.m + 1)}`;
    const monthEvents = events.filter((e) => e.date.startsWith(monthPrefix));
    const byDay = {};
    for (const e of monthEvents) { const day = parseInt(e.date.slice(8, 10), 10); (byDay[day] ||= []).push(e); }

    // 曜日ヘッダ
    const dow = ['日', '月', '火', '水', '木', '金', '土'].map((w, i) =>
      h('div', { class: 'cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), text: w }));
    // 日セル
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(h('div', { class: 'cal-cell empty' }));
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    for (let d = 1; d <= daysInMonth; d++) {
      const evs = byDay[d] || [];
      cells.push(h('div', { class: 'cal-cell' + (ymd(d) === todayStr ? ' today' : '') }, [
        h('div', { class: 'cal-d', text: String(d) }),
        h('div', { class: 'cal-dots' }, evs.slice(0, 4).map((e) => h('span', { class: 'cal-dot ' + e.cls }))),
      ]));
    }

    const list = monthEvents.slice().sort((a, b) => a.date.localeCompare(b.date)).map((e) =>
      h('div', { class: 'card tap cal-evrow', onclick: () => navigate('site/' + e.siteId) }, [
        h('span', { class: 'cal-dot ' + e.cls }),
        h('span', { class: 'cal-ev-date', text: fmtDate(e.date) }),
        h('span', { class: 'cal-ev-label', text: e.label }),
        h('span', { class: 'cal-ev-name', text: e.name }),
      ]));

    root.replaceChildren(
      h('div', { class: 'cal-head' }, [
        h('button', { class: 'btn ghost sm', text: '◀', onclick: () => { shift(-1); } }),
        h('div', { class: 'cal-title', text: `${state.y}年 ${state.m + 1}月` }),
        h('button', { class: 'btn ghost sm', text: '▶', onclick: () => { shift(1); } }),
      ]),
      h('div', { class: 'cal-legend' }, EVENT_DEFS.map((d) =>
        h('span', { class: 'cal-leg' }, [h('span', { class: 'cal-dot ' + d.cls }), h('span', { text: d.label })]))),
      h('div', { class: 'cal-grid' }, [...dow, ...cells]),
      h('div', { class: 'section-title', text: 'この月の予定' }),
      monthEvents.length ? h('div', {}, list) : h('div', { class: 'empty', text: '予定はありません' }),
    );
  };
  const shift = (n) => { let m = state.m + n; state.y += Math.floor(m / 12); state.m = ((m % 12) + 12) % 12; draw(); };

  draw();
  return root;
}
