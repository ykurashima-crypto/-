// 施工写真報告書: 案件の写真を選んで（既定は全選択）、報告書PDFを作成する。
import { store, blobURL } from '../db.js';
import { h, toast } from '../ui.js';
import { sitePhotos, phaseInfo } from '../model.js';
import { navigate } from '../app.js';
import { openPhotoReportDoc } from '../doc.js';

export function renderPhotoReport(siteId) {
  const site = store.get('sites', siteId);
  if (!site) return h('div', { class: 'empty', text: '現場が見つかりません' });
  const photos = sitePhotos(siteId);
  const selected = new Set(photos.map((p) => p.id)); // 既定は全選択

  const grid = h('div', { class: 'photo-grid' });
  const renderGrid = () => {
    grid.replaceChildren(...photos.map((p) => {
      const img = h('img', { alt: '' });
      blobURL(p.id).then((u) => { if (u) img.src = u; });
      const on = selected.has(p.id);
      const cell = h('div', { class: 'photo-thumb sel' + (on ? ' on' : ''), onclick: () => {
        if (selected.has(p.id)) selected.delete(p.id); else selected.add(p.id);
        renderGrid(); updateCount();
      } }, [
        img,
        h('span', { class: `phase-tag ${phaseInfo(p.phase).cls}`, text: phaseInfo(p.phase).label }),
        h('span', { class: 'sel-check', text: selected.has(p.id) ? '✓' : '' }),
      ]);
      return cell;
    }));
  };
  const countLabel = h('span', { text: '' });
  const updateCount = () => { countLabel.textContent = `${selected.size} / ${photos.length} 枚を選択中`; };
  renderGrid(); updateCount();

  const create = async () => {
    const chosen = photos.filter((p) => selected.has(p.id));
    if (chosen.length === 0) { toast('写真を1枚以上選んでください'); return; }
    toast('報告書を準備中…');
    await openPhotoReportDoc(site, chosen);
  };

  if (photos.length === 0) {
    return h('div', {}, [
      h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
      h('h1', { class: 'page-title', text: '写真報告書' }),
      h('div', { class: 'empty' }, [h('span', { class: 'ic', text: '📷' }), 'この現場の写真がまだありません。先に写真を撮りましょう。']),
      h('button', { class: 'btn', text: '📷 写真を撮る', onclick: () => navigate('photo/' + siteId) }),
    ]);
  }

  return h('div', {}, [
    h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
    h('h1', { class: 'page-title', text: '写真報告書をつくる' }),
    h('p', { class: 'sub mt-0', text: `${site.name}　使う写真をタップで選べます（既定は全部）` }),
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn secondary', text: 'すべて選ぶ', onclick: () => { photos.forEach((p) => selected.add(p.id)); renderGrid(); updateCount(); } }),
      h('button', { class: 'btn secondary', text: 'すべて外す', onclick: () => { selected.clear(); renderGrid(); updateCount(); } }),
    ]),
    h('div', { style: 'font-size:13px;color:var(--muted);margin:6px 0' }, [countLabel]),
    grid,
    h('button', { class: 'btn', style: 'margin-top:12px', text: '📄 報告書を作成（PDF）', onclick: create }),
  ]);
}
