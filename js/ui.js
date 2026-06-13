// 共通UIヘルパー: DOM生成、トースト、モーダル、写真サムネイル描画。
import { blobURL } from './db.js';
import { phaseInfo } from './model.js';

// 簡易DOMビルダー。h('div', {class:'x'}, [...children]) 形式。
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// 戦況ゲージ（工程の進捗バー）。done/total から割合を描く。
export function gauge(done, total, label = '戦況') {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return h('div', { class: 'gauge' }, [
    h('div', { class: 'gauge-top' }, [
      h('span', { text: label }),
      h('span', { text: `${done}/${total}　${pct}%` }),
    ]),
    h('div', { class: 'gauge-track' }, [h('div', { class: 'gauge-fill', style: `width:${pct}%` })]),
  ]);
}

let toastTimer = null;
export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = h('div', { class: 'toast' }); document.body.append(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

export function openModal(title, contentNode) {
  const root = document.getElementById('modal-root');
  const close = () => clear(root);
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, [
    h('div', { class: 'modal' }, [
      h('div', { class: 'modal-head' }, [
        h('h2', { text: title }),
        h('button', { class: 'close', onclick: close, text: '×' }),
      ]),
      contentNode,
    ]),
  ]);
  clear(root);
  root.append(backdrop);
  return close;
}

// 写真サムネ。読み込み後に実画像へ差し替え。
export function photoThumb(photo, { onDelete = null, onOpen = null } = {}) {
  const pi = phaseInfo(photo.phase);
  const img = h('img', { alt: pi.label });
  blobURL(photo.id).then((url) => { if (url) img.src = url; });
  const thumb = h('div', { class: 'photo-thumb', onclick: () => onOpen && onOpen(photo) }, [
    img,
    h('span', { class: `phase-tag ${pi.cls}`, text: pi.label }),
    onDelete && h('button', {
      class: 'del', text: '×',
      onclick: (e) => { e.stopPropagation(); onDelete(photo); },
    }),
  ]);
  return thumb;
}

export function openPhoto(photo) {
  const img = h('img', { class: 'photo-full' });
  blobURL(photo.id).then((url) => { if (url) img.src = url; });
  openModal(phaseInfo(photo.phase).label + (photo.comment ? '｜' + photo.comment : ''), img);
}
