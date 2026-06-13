// 職人ホーム =「本日の出陣」。戦国テイストで、今日行く現場・進捗(戦況)を一目で。
// 金額は一切表示しない。
import { store } from '../db.js';
import { h, gauge } from '../ui.js';
import { activeSites, fmtDate } from '../model.js';
import { navigate } from '../app.js';
import { scheduleStatus, currentStep, processProgress } from './process.js';

// 今月の集計（ゲーム的なやる気指標。派生値のみ・保存しない）
function thisMonthCounts() {
  const ym = new Date().toISOString().slice(0, 7);
  const kills = store.all('processes').filter((p) => p.status === 'done' && (p.completedDate || '').startsWith(ym)).length;
  const shots = store.all('photos').filter((p) => (new Date(p.createdAt).toISOString().slice(0, 7)) === ym).length;
  return { kills, shots };
}

export function renderWorkerHome() {
  const sites = activeSites();
  const { kills, shots } = thisMonthCounts();

  const hero = h('div', { class: 'hero' }, [
    h('div', { class: 'eyebrow', text: '⚔ 本日の出陣' }),
    h('h1', { text: sites.length ? `現場 ${sites.length} 箇所` : '今日の現場' }),
    h('div', { class: 'hero-sub', text: sites.length ? '気をつけて行ってらっしゃい。写真と日報で記録を残そう。' : '稼働中の現場はまだありません。' }),
    h('div', { class: 'hero-stats' }, [
      hstat(sites.length, '出陣中'),
      hstat(kills, '今月の攻略工程'),
      hstat(shots, '今月の写真'),
    ]),
  ]);

  const tiles = h('div', { class: 'action-grid' }, [
    actionTile('📷', '写真を撮る', '施工前・中・後', () => navigate('photo')),
    actionTile('📝', '日報を書く', '作業・工程を記録', () => navigate('report')),
    actionTile('⚔️', '問題・追加工事', '報告して証拠を残す', () => navigate('report/_issue')),
    actionTile('📅', '予定を見る', '次に行く現場・工期', () => navigate('schedule')),
  ]);

  const todaySection = h('div', {}, [
    h('div', { class: 'section-title', text: '今日の現場' }),
    sites.length === 0
      ? h('div', { class: 'empty' }, [h('span', { class: 'ic', text: '🚧' }), '稼働中の現場がありません'])
      : h('div', {}, sites.map(siteCard)),
  ]);

  return h('div', {}, [hero, tiles, todaySection]);
}

function hstat(n, l) {
  return h('div', { class: 'hstat' }, [h('div', { class: 'n', text: String(n) }), h('div', { class: 'l', text: l })]);
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
  const prog = processProgress(s.id);
  const time = (s.workStart || s.workEnd) ? `🕒 ${s.workStart || '—'}〜${s.workEnd || '—'}　` : '';
  return h('div', { class: 'card tap', onclick: () => navigate('site/' + s.id) }, [
    h('div', { class: 'card-row' }, [
      h('h3', { text: s.name }),
      ss ? h('span', { class: 'pill ' + ss.cls, text: ss.label }) : null,
    ]),
    h('div', { class: 'sub', text: `📍 ${s.address || '住所未登録'}` }),
    h('div', { class: 'sub', text: `${time}担当: ${s.manager || '—'}` }),
    cur ? h('div', { class: 'sub', text: `▶ いまの工程: ${cur.processType}（予定 ${fmtDate(cur.scheduledDate)}）` }) : null,
    prog ? gauge(prog.done, prog.total) : null,
  ]);
}
