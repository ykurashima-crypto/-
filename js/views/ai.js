// AI事務員（無料版）画面: 連絡が必要な案件の「文面の下書き」を自動作成。
// コピーしてLINE/メールで送れる。日報の要約もここで作れる。
import { store } from '../db.js';
import { h, toast, openModal, clear, copyText, hintBanner } from '../ui.js';
import { siteReports } from '../model.js';
import { navigate } from '../app.js';
import { contactList, draftByType, summarizeReports, aiEnabled } from '../ai.js';

export function renderAi() {
  const list = contactList();

  const contactSection = h('div', {}, [
    h('div', { class: 'section-title', text: '今日の連絡（文面の下書き）' }),
    list.length === 0
      ? h('div', { class: 'empty', text: 'いまは連絡が必要な案件はありません 👍' })
      : h('div', {}, list.map(contactCard)),
  ]);

  // 日報の要約（進行中の案件）
  const withReports = store.all('sites').filter((s) => siteReports(s.id).length > 0);
  const summarySection = h('div', {}, [
    h('div', { class: 'section-title', text: '日報のまとめ' }),
    withReports.length === 0
      ? h('div', { class: 'empty', text: '日報がまだありません' })
      : h('div', {}, withReports.map((s) => h('div', { class: 'card tap', onclick: () => openSummary(s) }, [
          h('div', { class: 'card-row' }, [h('h3', { text: s.name }), h('span', { class: 'sub', text: `日報 ${siteReports(s.id).length}件` })]),
          h('div', { class: 'sub', text: 'タップでまとめを作成' }),
        ]))),
  ]);

  return h('div', {}, [
    h('h1', { class: 'page-title', text: '🤖 AI事務員' }),
    hintBanner('ai', '連絡の文面や日報のまとめを自動で下書きします。コピーしてLINE・メールに貼り付けて送れます。'),
    aiEnabled() ? null : h('p', { class: 'sub mt-0', text: '※ 無料の定型文で作成します（より自然な生成はLLM接続で有効化できます）。' }),
    contactSection,
    summarySection,
  ]);
}

function contactCard(c) {
  const { site, type, label } = c;
  return h('div', { class: 'card' }, [
    h('div', { class: 'card-row' }, [
      h('h3', { text: site.name }),
      h('span', { class: 'pill s-quote', text: label }),
    ]),
    h('div', { class: 'sub', text: site.customer || '' }),
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn', text: '✍️ 文面を作る', onclick: () => openDraft(site, type, label) }),
      h('button', { class: 'btn secondary', text: '📂 現場', onclick: () => navigate('site/' + site.id) }),
    ]),
  ]);
}

function openDraft(site, type, label) {
  const ta = h('textarea', { style: 'min-height:200px;font-size:15px' }, draftByType(type, site));
  openModal(label, h('div', {}, [
    h('p', { class: 'sub mt-0', text: '内容を直してから送れます。' }),
    h('div', { class: 'field' }, [ta]),
    h('button', { class: 'btn', text: '📋 コピーする', onclick: () => copyText(ta.value) }),
    h('button', { class: 'btn ghost', text: '閉じる', onclick: () => clear(document.getElementById('modal-root')) }),
  ]));
}

function openSummary(site) {
  const text = summarizeReports(siteReports(site.id));
  const ta = h('textarea', { style: 'min-height:220px;font-size:15px' }, text);
  openModal(site.name + ' のまとめ', h('div', {}, [
    h('p', { class: 'sub mt-0', text: '元請け報告やお客様連絡にどうぞ。' }),
    h('div', { class: 'field' }, [ta]),
    h('button', { class: 'btn', text: '📋 コピーする', onclick: () => copyText(ta.value) }),
    h('button', { class: 'btn ghost', text: '閉じる', onclick: () => clear(document.getElementById('modal-root')) }),
  ]));
}
