// 顧客管理（個人プラン）: 一覧・検索・登録/編集/削除・顧客ごとの案件履歴。
// 親方が電話を受けた直後でも、電話番号だけで素早く仮登録できることを最優先にする。
import { store } from '../db.js';
import { h, toast, openModal, clear } from '../ui.js';
import { statusInfo, yen, fmtDate, todayStr } from '../model.js';
import { navigate } from '../app.js';
import { openCaseForm } from './admin.js';

// 問合せ経路（選択式・入力負担を減らす）
export const CHANNELS = ['紹介', 'ホームページ', 'チラシ', 'ポータルサイト', '元請け', 'リピーター', 'その他'];

function digits(p) { return (p || '').replace(/\D/g, ''); }
export function customerName(c) { return c.name || (c.phone ? '☎ ' + c.phone : '名称未設定'); }

// この顧客に紐づく案件。customerId 優先、無ければ電話番号一致でフォールバック（既存データ救済）。
function customerSites(c) {
  const d = digits(c.phone);
  return store.all('sites').filter((s) =>
    (s.customerId && s.customerId === c.id) || (!s.customerId && d && digits(s.phone) === d)
  ).sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- 顧客一覧 ----------
export function renderCustomers() {
  let keyword = '';
  const listWrap = h('div', {});

  const renderList = () => {
    const kw = keyword.trim().toLowerCase();
    let list = store.all('customers').sort((a, b) => b.createdAt - a.createdAt);
    if (kw) {
      list = list.filter((c) =>
        [c.name, c.phone, c.address, c.channel].some((v) => (v || '').toLowerCase().includes(kw)));
    }
    listWrap.replaceChildren(
      list.length === 0
        ? h('div', { class: 'empty', text: keyword ? '該当する顧客がいません' : 'まだ顧客がいません。「＋ 新規」か「📞 電話で仮登録」から追加できます' })
        : h('div', {}, list.map(customerRow)));
  };

  const search = h('input', {
    type: 'search', placeholder: '名前・電話・住所で検索', value: '',
    oninput: (e) => { keyword = e.target.value; renderList(); },
  });

  renderList();

  return h('div', {}, [
    h('div', { class: 'card-row' }, [
      h('h1', { class: 'page-title', text: '顧客' }),
      h('button', { class: 'btn sm', text: '＋ 新規', onclick: () => openCustomerForm(null, renderList) }),
    ]),
    h('div', { class: 'field' }, [search]),
    h('button', {
      class: 'btn secondary', style: 'margin-bottom:12px',
      text: '📞 電話で仮登録（番号だけ）',
      onclick: () => openCustomerForm(null, renderList, { quick: true }),
    }),
    listWrap,
  ]);
}

function customerRow(c) {
  const cnt = customerSites(c).length;
  return h('div', { class: 'card tap', onclick: () => navigate('customer/' + c.id) }, [
    h('div', { class: 'card-row' }, [
      h('h3', { text: customerName(c) }),
      c.channel ? h('span', { class: 'pill', text: c.channel }) : null,
    ]),
    h('div', { class: 'sub', text: [c.phone, c.address].filter(Boolean).join('　') || '連絡先未登録' }),
    h('div', { class: 'sub', text: `案件 ${cnt}件` }),
  ]);
}

// ---------- 顧客詳細 ----------
export function renderCustomer(id) {
  const c = store.get('customers', id);
  if (!c) return h('div', { class: 'empty', text: '顧客が見つかりません' });
  const sites = customerSites(c);

  const contactRow = c.address
    ? h('div', { class: 'btn-row' }, [
        h('a', {
          class: 'btn secondary', target: '_blank', rel: 'noopener',
          href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address),
          text: '🗺 地図を開く',
        }),
      ])
    : null;

  const infoRows = [
    ['電話', c.phone], ['住所', c.address], ['郵便番号', c.postalCode],
    ['メール', c.email], ['問合せ経路', c.channel], ['問合せ日', fmtDate(c.inquiryDate)],
    ['メモ', c.memo],
  ];
  const infoCard = h('div', { class: 'card' }, infoRows.map(([k, v]) =>
    h('div', { class: 'kv' }, [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v || '—' })])));

  const historySection = h('div', {}, [
    h('div', { class: 'section-title', text: `案件履歴（${sites.length}）` }),
    sites.length === 0
      ? h('div', { class: 'empty', text: 'まだ案件がありません' })
      : h('div', {}, sites.map((s) => {
          const si = statusInfo(s.status);
          return h('div', { class: 'card tap', onclick: () => navigate('site/' + s.id) }, [
            h('div', { class: 'card-row' }, [
              h('h3', { text: s.name }),
              h('span', { class: 'pill ' + si.cls, text: si.label }),
            ]),
            h('div', { class: 'sub', text: `${s.estimateAmount ? yen(s.estimateAmount) : '見積未'}　${fmtDate(s.inquiryDate)}` }),
          ]);
        })),
  ]);

  return h('div', {}, [
    h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
    h('h1', { class: 'page-title', text: customerName(c) }),
    contactRow,
    h('button', {
      class: 'btn', text: '＋ この顧客で新規案件',
      onclick: () => openCaseForm(null, () => navigate('customer/' + c.id), {
        customer: c.name, phone: c.phone, address: c.address, channel: c.channel, customerId: c.id,
      }),
    }),
    historySection,
    h('div', { class: 'section-title', text: '顧客情報' }),
    infoCard,
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn ghost', text: '✏️ 編集', onclick: () => openCustomerForm(c, () => navigate('customer/' + c.id)) }),
      h('button', {
        class: 'btn danger', text: '🗑 削除',
        onclick: () => {
          if (!confirm(`「${customerName(c)}」を削除しますか？\nこの操作は元に戻せません。`)) return;
          store.remove('customers', c.id);
          toast('顧客を削除しました');
          navigate('customers');
        },
      }),
    ]),
  ]);
}

// ---------- 登録・編集フォーム ----------
// quick=true のときは電話番号だけで登録できる（仮登録）。
export function openCustomerForm(customer, onDone, { quick = false } = {}) {
  const editing = !!customer;
  const f = {};
  const field = (key, label, type = 'text', ph = '') => {
    const v = editing ? (customer[key] ?? '') : '';
    const el = h('input', { type, placeholder: ph, value: v });
    f[key] = el;
    return h('div', { class: 'field' }, [h('label', { text: label }), el]);
  };

  const channelSel = h('select', {}, [
    h('option', { value: '', text: '（未選択）' }),
    ...CHANNELS.map((ch) => h('option', { value: ch, selected: editing && customer.channel === ch ? 'selected' : null, text: ch })),
  ]);
  f.channel = channelSel;

  const inquiry = h('input', { type: 'date', value: editing ? (customer.inquiryDate || '') : todayStr() });
  f.inquiryDate = inquiry;
  const memo = h('textarea', { placeholder: '例）築15年・南面の色あせ気になる。日中は不在、夕方連絡可' }, editing ? (customer.memo || '') : '');
  f.memo = memo;

  const save = () => {
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    if (!name && !phone) { toast('お名前か電話番号のどちらかを入力してください'); return; }
    const data = {
      name, phone, address: f.address.value.trim(),
      postalCode: f.postalCode.value.trim(), email: f.email.value.trim(),
      channel: channelSel.value, inquiryDate: inquiry.value, memo: memo.value.trim(),
    };
    if (editing) { store.update('customers', customer.id, data); toast('顧客を更新しました'); }
    else { store.insert('customers', data); toast('顧客を登録しました'); }
    clear(document.getElementById('modal-root'));
    onDone && onDone();
  };

  // quick仮登録は電話と名前だけの最小フォーム。詳細は後から編集できる。
  const fields = quick
    ? [
        h('p', { class: 'sub mt-0', text: '電話番号だけで先に登録できます。住所や経路は後から追記OK。' }),
        field('phone', '電話番号', 'tel', '090-1234-5678'),
        field('name', 'お名前（任意）', 'text', '分かれば入力'),
      ]
    : [
        field('name', 'お名前', 'text', '例）田中 健一'),
        field('phone', '電話番号', 'tel', '090-1234-5678'),
        h('div', { class: 'grid-2' }, [field('postalCode', '郵便番号', 'text', '123-4567'), field('email', 'メール', 'email', '任意')]),
        field('address', '住所', 'text', '市区町村〜番地'),
        h('div', { class: 'field' }, [h('label', { text: '問合せ経路' }), channelSel]),
        h('div', { class: 'field' }, [h('label', { text: '問合せ日' }), inquiry]),
        h('div', { class: 'field' }, [h('label', { text: 'メモ' }), memo]),
      ];

  openModal(editing ? '顧客を編集' : (quick ? '電話で仮登録' : '新規顧客'),
    h('div', {}, [...fields, h('button', { class: 'btn', text: editing ? '更新する' : '登録する', onclick: save })]));
}
