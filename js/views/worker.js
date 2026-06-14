// 職人ホーム＝「今日」。今日の現場・やること・必要な写真・注意事項を大きく表示し、
// 下部に大きな3ボタン（写真/日報/報告）。金額・案件管理・原価は一切出さない。
import { store } from '../db.js';
import { h, toast, clear, hintBanner } from '../ui.js';
import { activeSites, sitePhotos, todayStr } from '../model.js';
import { navigate } from '../app.js';
import { siteProcesses, scheduleStatus, completeProcess } from './process.js';

export function renderWorkerHome() {
  const wrap = h('div', {});
  const rerender = () => { clear(wrap); build(wrap, rerender); };
  rerender();
  return wrap;
}

function build(wrap, rerender) {
  const sites = activeSites();

  wrap.append(h('h1', { class: 'page-title', text: '今日の現場' }));
  const hint = hintBanner('today', '下の大きな3つのボタンで、写真・日報・報告ができます。「今日やること」はチェックすると完了になります。');
  if (hint) wrap.append(hint);

  if (sites.length === 0) {
    wrap.append(h('div', { class: 'empty' }, [h('span', { class: 'ic', text: '🚧' }), '今日の現場はまだありません']));
  } else {
    sites.forEach((s) => wrap.append(todayCard(s, rerender)));
  }

  // 下部の大きな3ボタン
  wrap.append(h('div', { class: 'big-actions' }, [
    bigBtn('📷', '写真を撮る', () => navigate('photo')),
    bigBtn('📝', '日報を書く', () => navigate('report')),
    bigBtn('📣', '困ったを報告', () => navigate('houkoku')),
  ]));
}

function bigBtn(icon, label, onclick) {
  return h('button', { class: 'big-btn', onclick }, [
    h('span', { class: 'bb-ic', text: icon }),
    h('span', { class: 'bb-l', text: label }),
  ]);
}

function todayCard(s, rerender) {
  const ss = scheduleStatus(s.id);
  const procs = siteProcesses(s.id);
  const todo = procs.filter((p) => p.status !== 'done');
  const photos = sitePhotos(s.id);
  const hasBefore = photos.some((p) => p.phase === 'before');
  const hasAfter = photos.some((p) => p.phase === 'after');

  // 今日やること＝未完了の工程をチェックリストに（チェックで完了）
  const checklist = h('div', {}, todo.slice(0, 6).map((p) => h('label', { class: 'check-row big' }, [
    h('input', {
      type: 'checkbox',
      onchange: () => { completeProcess(p.id, todayStr()); toast('「' + p.processType + '」を完了にしました'); rerender(); },
    }),
    h('span', { text: p.processType }),
  ])));

  // 作業開始/終了（その日の打刻。端末内に保存）
  const wk = 'nurilog.attend.' + s.id + '.' + todayStr();
  let att = {};
  try { att = JSON.parse(localStorage.getItem(wk)) || {}; } catch { att = {}; }
  const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const setAtt = (k) => { att[k] = nowHM(); localStorage.setItem(wk, JSON.stringify(att)); toast(k === 'start' ? `作業開始 ${att.start}` : `作業終了 ${att.end}`); rerender(); };
  const attendRow = h('div', { class: 'big-actions two' }, [
    att.start
      ? h('button', { class: 'big-btn wide', disabled: 'disabled' }, [h('span', { class: 'bb-ic', text: '✅' }), h('span', { class: 'bb-l', text: `開始 ${att.start}` })])
      : h('button', { class: 'big-btn wide primary', onclick: () => setAtt('start') }, [h('span', { class: 'bb-ic', text: '▶' }), h('span', { class: 'bb-l', text: '作業開始' })]),
    att.end
      ? h('button', { class: 'big-btn wide', disabled: 'disabled' }, [h('span', { class: 'bb-ic', text: '🏁' }), h('span', { class: 'bb-l', text: `終了 ${att.end}` })])
      : h('button', { class: 'big-btn wide', onclick: () => setAtt('end') }, [h('span', { class: 'bb-ic', text: '⏹' }), h('span', { class: 'bb-l', text: '作業終了' })]),
  ]);

  return h('div', { class: 'card today-card' }, [
    h('div', { class: 'today-name', text: s.name }),
    ss ? h('span', { class: 'pill ' + ss.cls, text: ss.label }) : null,
    attendRow,
    h('div', { class: 'today-rows' }, [
      bigRow('🕒 集合', (s.workStart || s.workEnd) ? `${s.workStart || '—'}〜${s.workEnd || '—'}` : '時間未設定'),
      bigRow('👷 担当', s.manager || '—'),
      bigRow('📍 住所', s.address || '住所未登録'),
    ]),
    s.address ? h('a', {
      class: 'btn secondary', target: '_blank', rel: 'noopener',
      href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.address),
      text: '🗺 地図を開く',
    }) : null,

    h('div', { class: 'section-title', text: '今日やること' }),
    todo.length === 0
      ? h('div', { class: 'warn-box ok', text: '✅ 工程はすべて完了しています' })
      : checklist,
    h('div', { class: 'check-row big' }, [
      h('span', { text: (hasBefore ? '✅' : '⬜') + ' 施工前の写真' }),
    ]),
    h('div', { class: 'check-row big' }, [
      h('span', { text: (hasAfter ? '✅' : '⬜') + ' 施工後の写真' }),
    ]),

    s.memo ? h('div', {}, [
      h('div', { class: 'section-title', text: '注意・約束' }),
      h('div', { class: 'warn-box', style: 'background:rgba(224,169,59,.12);color:#e6d3ab;border:1px solid rgba(224,169,59,.3)', text: s.memo }),
    ]) : null,
  ]);
}

function bigRow(k, v) {
  return h('div', { class: 'today-row' }, [
    h('span', { class: 'tr-k', text: k }),
    h('span', { class: 'tr-v', text: v }),
  ]);
}
