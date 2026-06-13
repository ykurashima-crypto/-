// お金の漏れを「記録して解消」するための共通操作。
// 一人親方が、完工→請求→入金の流れをワンタップで残せるようにする。
// 案件(sites)に請求・入金の事実（日付・金額）を記録し、ステータスを進める。
import { store } from './db.js';
import { h, toast, openModal, clear } from './ui.js';
import { todayStr, yen } from './model.js';
import { openInvoiceDoc } from './doc.js';

// 日付文字列(yyyy-mm-dd)に日数を足す。未指定なら今日基準。
export function addDays(baseStr, days) {
  const base = baseStr ? new Date(baseStr + 'T00:00:00') : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

// 案件の「請求すべき金額」推定（契約額 > 見積額）。
export function billableAmount(site) {
  return site.contractAmount || site.estimateAmount || 0;
}

// 🧾 請求書を作った → 請求済みにする（請求日・入金予定日・契約金額を記録）。
export function markInvoiced(site, onDone) {
  const amount = h('input', { type: 'number', min: '0', value: billableAmount(site) || '', placeholder: '円' });
  const invoiceDate = h('input', { type: 'date', value: todayStr() });
  // 入金予定日の既定は請求日＋30日（一般的な月末締め翌月払いの目安）
  const dueDate = h('input', { type: 'date', value: addDays(todayStr(), 30) });
  const note = h('textarea', { placeholder: '例）追加工事分を含みます／お振込は月末まで', style: 'min-height:48px' }, site.invoiceNote || '');

  const save = () => {
    const updated = store.update('sites', site.id, {
      status: 'billed',
      contractAmount: amount.value ? parseInt(amount.value, 10) : (site.contractAmount || site.estimateAmount || null),
      invoiceDate: invoiceDate.value,
      paymentDueDate: dueDate.value,
      paymentStatus: 'unpaid',
      invoiceNote: note.value.trim(),
    });
    toast('請求済みにしました 🧾');
    // 続けて請求書PDFを出せる導線（自動で開かず、本人に選ばせる）
    openModal('請求済みにしました ✅', h('div', {}, [
      h('p', { class: 'sub mt-0', text: 'そのまま請求書を出して、お客様に送れます。' }),
      h('button', { class: 'btn', text: '📄 請求書をPDFで開く', onclick: () => { openInvoiceDoc(updated); clear(document.getElementById('modal-root')); onDone && onDone(); } }),
      h('button', { class: 'btn ghost', text: '閉じる', onclick: () => { clear(document.getElementById('modal-root')); onDone && onDone(); } }),
    ]));
  };

  openModal('請求書を作成（請求済みにする）', h('div', {}, [
    h('p', { class: 'sub mt-0', text: `${site.name}${site.customer ? '（' + site.customer + '）' : ''}` }),
    h('div', { class: 'field' }, [h('label', { text: '請求金額（税込）' }), amount]),
    h('div', { class: 'grid-2' }, [
      h('div', { class: 'field' }, [h('label', { text: '請求日' }), invoiceDate]),
      h('div', { class: 'field' }, [h('label', { text: '入金予定日' }), dueDate]),
    ]),
    h('div', { class: 'field' }, [h('label', { text: '備考（請求書に表示・任意）' }), note]),
    h('div', { class: 'hint', text: '入金予定日を過ぎても入金が無い場合、ホームの「今日やること」でお知らせします。' }),
    h('button', { class: 'btn', text: '請求済みにする', onclick: save }),
  ]));
}

// 💰 入金を確認した → 入金済みにする（入金日・入金額を記録）。
export function markPaid(site, onDone) {
  const amount = h('input', { type: 'number', min: '0', value: billableAmount(site) || '', placeholder: '円' });
  const paidDate = h('input', { type: 'date', value: todayStr() });

  const save = () => {
    store.update('sites', site.id, {
      status: 'paid',
      paymentDate: paidDate.value,
      paymentStatus: 'paid',
      contractAmount: amount.value ? parseInt(amount.value, 10) : (site.contractAmount || site.estimateAmount || null),
    });
    clear(document.getElementById('modal-root'));
    toast('入金済みにしました 💰');
    onDone && onDone();
  };

  openModal('入金を確認（入金済みにする）', h('div', {}, [
    h('p', { class: 'sub mt-0', text: `${site.name}${site.customer ? '（' + site.customer + '）' : ''}` }),
    h('div', { class: 'grid-2' }, [
      h('div', { class: 'field' }, [h('label', { text: '入金額' }), amount]),
      h('div', { class: 'field' }, [h('label', { text: '入金日' }), paidDate]),
    ]),
    site.paymentDueDate ? h('div', { class: 'hint', text: `入金予定日: ${site.paymentDueDate}` }) : null,
    h('button', { class: 'btn', text: '入金済みにする', onclick: save }),
  ]));
}
