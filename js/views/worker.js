// 職人ホーム: 今日の現場 + 4つの大きなアクション（写真/日報/問題報告）。
import { h } from '../ui.js';
import { activeSites, statusInfo, sitePhotos, fmtDate } from '../model.js';
import { navigate } from '../app.js';
import { scheduleStatus, currentStep } from './process.js';

export function renderWorkerHome() {
  const sites = activeSites();

  const tiles = h('div', { class: 'action-grid' }, [
    actionTile('📷', '写真を撮る', '施工前・中・後', () => navigate('photo')),
    actionTile('📝', '日報を書く', '作業内容・材料', () => navigate('report')),
    actionTile('⚠️', '問題・追加工事', '報告して証拠を残す', () => navigate('report/_issue')),
    actionTile('📋', '今日の現場', `${sites.length}件`, () => location.hash = '#/worker'),
  ]);

  const todaySection = h('div', {}, [
    h('div', { class: 'section-title', text: '今日の現場' }),
    sites.length === 0
      ? h('div', { class: 'empty' }, [h('span', { class: 'ic', text: '🚧' }), '稼働中の現場がありません'])
      : h('div', {}, sites.map(siteCard)),
  ]);

  return h('div', {}, [
    h('h1', { class: 'page-title', text: '今日の作業' }),
    tiles,
    todaySection,
  ]);
}

function actionTile(icon, label, desc, onclick) {
  return h('button', { class: 'action-tile', onclick }, [
    h('span', { class: 'ic', text: icon }),
    h('span', { class: 'label', text: label }),
    h('span', { class: 'desc', text: desc }),
  ]);
}

function siteCard(s) {
  const ss = scheduleStatus(s.id);
  const cur = currentStep(s.id);
  const time = (s.workStart || s.workEnd) ? `🕒 ${s.workStart || '—'}〜${s.workEnd || '—'}　` : '';
  return h('div', { class: 'card tap', onclick: () => navigate('site/' + s.id) }, [
    h('div', { class: 'card-row' }, [
      h('h3', { text: s.name }),
      ss ? h('span', { class: 'pill ' + ss.cls, text: ss.label }) : null,
    ]),
    h('div', { class: 'sub', text: `📍 ${s.address || '住所未登録'}` }),
    h('div', { class: 'sub', text: `${time}担当: ${s.manager || '—'}` }),
    cur ? h('div', { class: 'sub', text: `▶ いまの工程: ${cur.processType}（予定 ${fmtDate(cur.scheduledDate)}）` }) : null,
  ]);
}
