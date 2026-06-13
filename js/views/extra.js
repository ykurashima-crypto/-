// 追加工事: 案件詳細から登録（写真・金額・理由）→ 顧客確認画面で承認/却下。
// 承認済みは請求書へ自動反映し、未請求ならホーム「今日やること」に出す。
import { store, blobURL } from '../db.js';
import { h, toast, openModal, clear } from '../ui.js';
import { addPhoto, yen, fmtDate, todayStr } from '../model.js';
import { navigate } from '../app.js';

export const EXTRA_STATUS = {
  pending: { label: '未承認', cls: 's-survey' },
  approved: { label: '承認済み', cls: 's-paid' },
  rejected: { label: '却下', cls: 's-done' },
};

export function extrasForSite(siteId) {
  return store.all('extras').filter((e) => e.siteId === siteId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// 案件詳細の「追加工事」セクション（管理者）。
export function extraBlock(site, rerender) {
  const list = extrasForSite(site.id);
  const head = h('div', { class: 'card-row' }, [
    h('div', { class: 'section-title mt-0', text: '追加工事' }),
    h('button', { class: 'btn ghost sm', text: '＋ 追加工事', onclick: () => openExtraForm(site, rerender) }),
  ]);
  if (list.length === 0) {
    return h('div', {}, [head, h('div', { class: 'empty', text: 'まだ追加工事はありません' })]);
  }
  return h('div', {}, [
    head,
    h('div', {}, list.map((e) => extraRow(e, rerender))),
    h('button', { class: 'btn secondary', style: 'margin-top:4px', text: '🤝 お客様に見せて確認', onclick: () => navigate('approve/' + site.id) }),
  ]);
}

function extraRow(e, rerender) {
  const st = EXTRA_STATUS[e.status] || EXTRA_STATUS.pending;
  const img = e.photoId ? h('img', { alt: '', style: 'width:54px;height:54px;object-fit:cover;border-radius:8px;flex:0 0 auto' }) : null;
  if (img) blobURL(e.photoId).then((u) => { if (u) img.src = u; });
  return h('div', { class: 'card' }, [
    h('div', { class: 'card-row' }, [
      h('h3', { text: e.content || '追加工事' }),
      h('span', { class: 'pill ' + st.cls, text: st.label }),
    ]),
    h('div', { style: 'display:flex;gap:10px;align-items:center' }, [
      img,
      h('div', {}, [
        h('div', { class: 'v', style: 'font-weight:800;color:var(--gold)', text: yen(e.amount) }),
        e.reason ? h('div', { class: 'sub', text: '理由: ' + e.reason }) : null,
        h('div', { class: 'sub', text: '登録: ' + fmtDate(e.createdAt ? new Date(e.createdAt).toISOString().slice(0, 10) : '') + (e.billed ? '・請求済み' : '') }),
      ]),
    ]),
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn ghost sm', text: '✏️ 編集', onclick: () => openExtraForm(store.get('sites', e.siteId), rerender, e) }),
      h('button', { class: 'btn danger sm', text: '🗑', onclick: () => { if (confirm('この追加工事を削除しますか？')) { store.remove('extras', e.id); toast('削除しました'); rerender && rerender(); } } }),
    ]),
  ]);
}

// 登録・編集フォーム
export function openExtraForm(site, onDone, extra = null) {
  const editing = !!extra;
  const content = h('input', { type: 'text', placeholder: '例）破風板の板金補修', value: extra?.content || '' });
  const amount = h('input', { type: 'number', min: '0', placeholder: '円（税込）', value: extra?.amount ?? '' });
  const reason = h('input', { type: 'text', placeholder: '例）下地に腐食が見つかったため', value: extra?.reason || '' });
  let pendingFile = null;
  const thumb = h('img', { alt: '', style: 'width:80px;height:80px;object-fit:cover;border-radius:8px;display:none' });
  if (editing && extra.photoId) blobURL(extra.photoId).then((u) => { if (u) { thumb.src = u; thumb.style.display = ''; } });
  const fileInput = h('input', {
    type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none',
    onchange: (e) => { pendingFile = e.target.files[0] || null; if (pendingFile) { const r = new FileReader(); r.onload = () => { thumb.src = r.result; thumb.style.display = ''; }; r.readAsDataURL(pendingFile); } },
  });

  const save = async () => {
    if (!content.value.trim()) { toast('内容を入力してください'); return; }
    let photoId = extra?.photoId || null;
    if (pendingFile) { const p = await addPhoto({ siteId: site.id, phase: 'extra', comment: content.value.trim(), file: pendingFile }); photoId = p.id; }
    const data = {
      siteId: site.id, content: content.value.trim(),
      amount: amount.value ? parseInt(amount.value, 10) : 0,
      reason: reason.value.trim(), photoId,
    };
    if (editing) { store.update('extras', extra.id, data); toast('更新しました'); }
    else { store.insert('extras', { ...data, status: 'pending', billed: false }); toast('追加工事を登録しました'); }
    clear(document.getElementById('modal-root'));
    onDone && onDone();
  };

  openModal(editing ? '追加工事を編集' : '追加工事を登録', h('div', {}, [
    h('p', { class: 'sub mt-0', text: site.name }),
    h('div', { class: 'field' }, [h('label', { text: '内容（必須）' }), content]),
    h('div', { class: 'field' }, [h('label', { text: '金額（税込）' }), amount]),
    h('div', { class: 'field' }, [h('label', { text: '理由' }), reason]),
    h('div', { class: 'field' }, [h('label', { text: '写真' }),
      h('div', { class: 'btn-row' }, [thumb, h('button', { class: 'btn secondary sm', text: '📷 写真を選ぶ', onclick: () => fileInput.click() })]), fileInput]),
    h('button', { class: 'btn', text: editing ? '更新する' : '登録する', onclick: save }),
  ]));
}

// 顧客確認画面: お客様に見せて、その場で承認/却下（簡易署名つき）。
export function renderApprove(siteId) {
  const site = store.get('sites', siteId);
  if (!site) return h('div', { class: 'empty', text: '現場が見つかりません' });
  const root = h('div', {});
  const draw = () => {
    const list = extrasForSite(siteId);
    const sign = h('input', { type: 'text', placeholder: 'お客様のお名前（確認の記録に残ります）' });

    const cards = list.map((e) => {
      const st = EXTRA_STATUS[e.status] || EXTRA_STATUS.pending;
      const img = e.photoId ? h('img', { alt: '', class: 'photo-full', style: 'max-height:220px;object-fit:cover' }) : null;
      if (img) blobURL(e.photoId).then((u) => { if (u) img.src = u; });
      const decide = (status) => {
        store.update('extras', e.id, { status, approvedBy: status === 'approved' ? (sign.value.trim() || 'お客様') : (sign.value.trim() || ''), approvedAt: todayStr() });
        toast(status === 'approved' ? '承認されました' : '却下しました');
        draw();
      };
      return h('div', { class: 'card' }, [
        h('div', { class: 'card-row' }, [
          h('h3', { text: e.content || '追加工事' }),
          h('span', { class: 'pill ' + st.cls, text: st.label }),
        ]),
        h('div', { style: 'font-size:24px;font-weight:900;color:var(--gold);margin:4px 0', text: yen(e.amount) }),
        e.reason ? h('div', { class: 'sub', text: '理由: ' + e.reason }) : null,
        img,
        e.status === 'approved'
          ? h('div', { class: 'warn-box ok', text: `✅ ${e.approvedBy || 'お客様'} 様 承認済み（${fmtDate(e.approvedAt)}）` })
          : h('div', { class: 'btn-row' }, [
              h('button', { class: 'btn', text: '✔ 承認する', onclick: () => decide('approved') }),
              h('button', { class: 'btn ghost', text: '却下', onclick: () => decide('rejected') }),
            ]),
      ]);
    });

    root.replaceChildren(
      h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
      h('h1', { class: 'page-title', text: '追加工事のご確認' }),
      h('p', { class: 'sub mt-0', text: `${site.customer ? site.customer + ' 様　' : ''}${site.name}` }),
      list.length === 0 ? h('div', { class: 'empty', text: '確認が必要な追加工事はありません' })
        : h('div', {}, [
            h('div', { class: 'field' }, [h('label', { text: 'お客様のお名前（任意・承認の記録）' }), sign]),
            ...cards,
          ]),
    );
  };
  draw();
  return root;
}
