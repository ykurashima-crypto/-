// 職人「報告」画面: 困りごとを大きなボタンで素早く報告。管理者に届く（日報の問題/追加工事として記録）。
import { store } from '../db.js';
import { h, toast, openModal, clear } from '../ui.js';
import { activeSites, addPhoto, todayStr } from '../model.js';
import { navigate } from '../app.js';
import { micButton } from '../voice.js';
import { openExtraForm } from './extra.js';

const CATEGORIES = [
  { key: '不具合', icon: '🛠' },
  { key: '事故・ヒヤリハット', icon: '⚠️' },
  { key: 'お客様からの要望', icon: '🙇' },
  { key: '材料不足', icon: '📦' },
  { key: 'その他', icon: '✍️' },
];

function todaySite() {
  const a = activeSites();
  return a.length ? a[0] : (store.all('sites')[0] || null);
}

export function renderHoukoku() {
  const site = todaySite();
  return h('div', {}, [
    h('h1', { class: 'page-title', text: '困ったことを報告' }),
    site ? h('p', { class: 'sub mt-0', text: `現場: ${site.name}` }) : h('div', { class: 'empty', text: '報告先の現場がありません' }),
    h('div', { class: 'big-actions col' }, [
      h('button', { class: 'big-btn wide', onclick: () => site ? openExtraForm(site, () => { toast('管理者に報告しました'); navigate('worker'); }) : toast('現場がありません') }, [
        h('span', { class: 'bb-ic', text: '➕' }), h('span', { class: 'bb-l', text: '追加工事' }),
      ]),
      ...CATEGORIES.map((c) => h('button', { class: 'big-btn wide', onclick: () => site ? openReportModal(site, c.key) : toast('現場がありません') }, [
        h('span', { class: 'bb-ic', text: c.icon }), h('span', { class: 'bb-l', text: c.key }),
      ])),
    ]),
  ]);
}

// 追加工事以外＝写真＋一言で素早く報告（日報の problems として保存し管理者に届く）
function openReportModal(site, category) {
  const note = h('textarea', { placeholder: '一言メモ（🎤 話して入力できます）', style: 'min-height:70px' });
  let pendingFile = null;
  const thumb = h('img', { alt: '', style: 'width:80px;height:80px;object-fit:cover;border-radius:8px;display:none' });
  const fileInput = h('input', {
    type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none',
    onchange: (e) => { pendingFile = e.target.files[0] || null; if (pendingFile) { const r = new FileReader(); r.onload = () => { thumb.src = r.result; thumb.style.display = ''; }; r.readAsDataURL(pendingFile); } },
  });

  const submit = async () => {
    const rep = store.insert('reports', {
      siteId: site.id, date: todayStr(),
      worker: localStorage.getItem('nurilog.worker') || '',
      workContent: '', materials: '', hours: null,
      problems: `【${category}】${note.value.trim()}`,
    });
    if (pendingFile) await addPhoto({ siteId: site.id, reportId: rep.id, phase: 'defect', comment: category, file: pendingFile });
    clear(document.getElementById('modal-root'));
    toast('管理者に報告しました');
    navigate('worker');
  };

  openModal(category + 'の報告', h('div', {}, [
    h('p', { class: 'sub mt-0', text: site.name }),
    h('div', { class: 'field' }, [h('label', { text: '写真（任意）' }),
      h('div', { class: 'btn-row' }, [thumb, h('button', { class: 'btn secondary sm', text: '📷 写真を選ぶ', onclick: () => fileInput.click() })]), fileInput]),
    h('div', { class: 'field' }, [h('label', { text: '内容' }),
      h('div', { class: 'field-mic' }, [note, micButton(note)])]),
    h('button', { class: 'btn', text: 'この内容で報告する', onclick: submit }),
  ]));
}
