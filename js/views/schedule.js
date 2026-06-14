// 職人向け「予定」ビュー: 次にどの現場へ行くか、今の現場の工期・作業時間・
// 作業フェーズ（工程順）、納期に対して前倒し/遅れかをひと目で。金額は一切表示しない。
import { h, gauge } from '../ui.js';
import { activeSites, fmtDate } from '../model.js';
import { navigate } from '../app.js';
import { siteProcesses, plannedPeriod, scheduleStatus, upcomingSteps, currentStep, processProgress } from './process.js';

export function renderSchedule() {
  const sites = activeSites();
  const upcoming = upcomingSteps(sites.map((s) => s.id));

  const next = upcoming[0];
  const nextCard = next
    ? h('div', { class: 'card tap next-site', onclick: () => navigate('site/' + next.siteId) }, [
        h('div', { class: 'sub', text: '次に行く現場' }),
        h('h2', { style: 'margin:2px 0', text: next.name }),
        h('div', { class: 'sub', text: `${fmtDate(next.date)}　${next.processType}` }),
      ])
    : null;

  const upcomingSection = h('div', {}, [
    h('div', { class: 'section-title', text: '近い予定' }),
    upcoming.length === 0
      ? h('div', { class: 'empty', text: '予定された工程がありません' })
      : h('div', {}, upcoming.map((u) => h('div', { class: 'card tap cal-evrow', onclick: () => navigate('site/' + u.siteId) }, [
          h('span', { class: 'cal-ev-date', text: fmtDate(u.date) }),
          h('span', { class: 'cal-ev-label', text: u.processType }),
          h('span', { class: 'cal-ev-name', text: u.name }),
        ]))),
  ]);

  const siteSection = h('div', {}, [
    h('div', { class: 'section-title', text: '進行中の現場' }),
    sites.length === 0
      ? h('div', { class: 'empty', text: '進行中の現場はありません' })
      : h('div', {}, sites.map(siteScheduleCard)),
  ]);

  return h('div', {}, [
    h('h1', { class: 'page-title', text: '予定' }),
    nextCard,
    siteSection,
    upcomingSection,
  ]);
}

function siteScheduleCard(s) {
  const period = plannedPeriod(s.id);
  const ss = scheduleStatus(s.id);
  const cur = currentStep(s.id);
  const procs = siteProcesses(s.id);

  const time = (s.workStart || s.workEnd)
    ? `${s.workStart || '—'}〜${s.workEnd || '—'}`
    : '時間未設定';

  // 工程の縦リスト（完了/今ここ/未）
  const phases = procs.length
    ? h('div', { class: 'phase-flow' }, procs.map((p) => {
        const isCur = cur && p.id === cur.id;
        const cls = p.status === 'done' ? 'done' : (isCur ? 'cur' : '');
        return h('span', { class: 'phase-chip ' + cls, text: (p.status === 'done' ? '✓ ' : isCur ? '▶ ' : '') + p.processType });
      }))
    : h('div', { class: 'sub', text: '工程表が未作成です' });

  return h('div', { class: 'card tap', onclick: () => navigate('site/' + s.id) }, [
    h('div', { class: 'card-row' }, [
      h('h3', { text: s.name }),
      ss ? h('span', { class: 'pill ' + ss.cls, text: ss.label }) : null,
    ]),
    h('div', { class: 'sub', text: `📍 ${s.address || '住所未登録'}` }),
    h('div', { class: 'sub', text: `🕒 ${time}　🗓 工期 ${fmtDate(period.start)}〜${fmtDate(period.end)}` }),
    cur ? h('div', { class: 'sub', text: `▶ いまの工程: ${cur.processType}（予定 ${fmtDate(cur.scheduledDate)}）` }) : null,
    (() => { const p = processProgress(s.id); return p ? gauge(p.done, p.total) : null; })(),
    phases,
  ]);
}
