// 職人・メンバー管理（法人プラン）: 名簿の追加・編集・有効/無効。
// ※ ログインユーザー(profiles)とは別の「名簿/ラベル」。担当割当の選択肢に使う。
import { store } from '../db.js';
import { h, toast, openModal, clear } from '../ui.js';
import { ASSIGNABLE_ROLES, roleLabel } from '../roles.js';

export function activeMembers() {
  return store.all('members').filter((m) => m.active !== false);
}

export function renderMembers() {
  const wrap = h('div', {});
  const rerender = () => { clear(wrap); build(wrap, rerender); };
  rerender();
  return wrap;
}

function build(wrap, rerender) {
  const list = store.all('members').sort((a, b) => (b.active !== false ? 1 : 0) - (a.active !== false ? 1 : 0));
  wrap.append(
    h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
    h('h1', { class: 'page-title', text: '職人・メンバー管理' }),
    h('p', { class: 'sub mt-0', text: '現場の担当割当に使う名簿です。退職した方は「無効」にできます。' }),
    h('button', { class: 'btn', text: '＋ メンバーを追加', onclick: () => openMemberForm(null, rerender) }),
  );
  if (!list.length) { wrap.append(h('div', { class: 'empty', text: 'まだメンバーがいません' })); return; }
  wrap.append(h('div', {}, list.map((m) => memberRow(m, rerender))));
}

function memberRow(m, rerender) {
  const on = m.active !== false;
  return h('div', { class: 'card' }, [
    h('div', { class: 'card-row' }, [
      h('h3', { text: m.name || '（名前未設定）' }),
      h('span', { class: 'pill ' + (on ? 's-won' : 's-done'), text: on ? roleLabel(m.role) : '無効' }),
    ]),
    m.phone ? h('div', { class: 'sub', text: m.phone }) : null,
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn ghost sm', text: '✏️ 編集', onclick: () => openMemberForm(m, rerender) }),
      h('button', { class: 'btn secondary sm', text: on ? '無効にする' : '有効に戻す', onclick: () => { store.update('members', m.id, { active: !on }); toast('更新しました'); rerender(); } }),
    ]),
  ]);
}

function openMemberForm(m, onDone) {
  const editing = !!m;
  const name = h('input', { type: 'text', placeholder: '例）山本 大輔', value: m?.name || '' });
  const phone = h('input', { type: 'tel', placeholder: '090-...', value: m?.phone || '' });
  const roleSel = h('select', {}, ASSIGNABLE_ROLES.map((r) => h('option', { value: r.key, selected: (m?.role || 'craftsman') === r.key ? 'selected' : null, text: r.label })));
  const save = () => {
    if (!name.value.trim()) { toast('名前を入力してください'); return; }
    const data = { name: name.value.trim(), phone: phone.value.trim(), role: roleSel.value };
    if (editing) store.update('members', m.id, data);
    else store.insert('members', { ...data, active: true });
    toast('保存しました');
    clear(document.getElementById('modal-root'));
    onDone && onDone();
  };
  openModal(editing ? 'メンバーを編集' : 'メンバーを追加', h('div', {}, [
    h('div', { class: 'field' }, [h('label', { text: '名前（必須）' }), name]),
    h('div', { class: 'field' }, [h('label', { text: '役割' }), roleSel]),
    h('div', { class: 'field' }, [h('label', { text: '電話番号' }), phone]),
    h('button', { class: 'btn', text: '保存', onclick: save }),
  ]));
}
