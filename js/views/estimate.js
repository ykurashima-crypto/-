// 見積: 塗装業向けテンプレートで明細(売価)を作り、合計・消費税を算出。
// 同時に原価を入れて粗利率をチェックし、粗利低下・入力漏れ・値引き超過・赤字を警告する。
// 仕上げた見積はそのまま「見積書PDF」として出力できる。
import { store } from '../db.js';
import { h, toast, hintBanner } from '../ui.js';
import { yen, todayStr } from '../model.js';
import { navigate } from '../app.js';
import { openEstimateDoc } from '../doc.js';
import { addDays } from '../money.js';
import { latestSurvey } from './survey.js';

const MIN_MARGIN = 0.25;        // 最低粗利率 25%
const MAX_DISCOUNT_RATE = 0.1;  // 値引きは小計の10%まで
const TAX_RATE = 0.1;

// 塗装業の標準見積項目テンプレート（タップで明細に追加）
const TEMPLATE_ITEMS = [
  '足場', '飛散防止ネット', '高圧洗浄', '養生', '下地処理',
  '外壁下塗り', '外壁中塗り', '外壁上塗り', '屋根塗装', '軒天', '破風',
  '雨樋', '雨戸', '戸袋', '水切り', 'コーキング撤去打ち替え', 'コーキング増し打ち',
  'ベランダ防水', '廃材処分', '諸経費',
];
const UNITS = ['㎡', 'm', '箇所', '人工', '缶', '式', '一式'];

// 塗料グレード（㎡あたり材工目安・原価計算の補助）
const PAINTS = [
  { key: 'urethane', label: 'ウレタン', unit: 2200 },
  { key: 'silicon', label: 'シリコン', unit: 2600 },
  { key: 'fluorine', label: 'フッ素', unit: 3600 },
  { key: 'inorganic', label: '無機', unit: 4200 },
];

function estimateNumber() {
  const d = todayStr().replace(/-/g, '');
  return `Q${d}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export function renderEstimate(siteId) {
  const site = siteId ? store.get('sites', siteId) : null;
  // 現地調査があれば塗装面積を原価計算に引き継ぐ
  const survey = site ? latestSurvey(site.id) : null;
  const prefillArea = survey?.paintingArea ?? '';

  // ---- 明細(売価)状態 ----
  let rows = []; // {name, qty, unit, unitPrice}
  const tbody = h('div', {});
  const sumBox = h('div', {});

  function rowAmount(r) {
    const q = parseFloat(r.qty);
    const p = parseFloat(r.unitPrice) || 0;
    return (isNaN(q) ? 1 : q) * p; // 数量未入力(式など)は1扱い
  }
  function subtotal() { return rows.reduce((a, r) => a + rowAmount(r), 0); }

  function renderRows() {
    tbody.replaceChildren(...rows.map((r, i) => {
      const name = h('input', { type: 'text', value: r.name, placeholder: '品名', oninput: (e) => { r.name = e.target.value; } });
      const qty = h('input', { type: 'number', min: '0', step: 'any', value: r.qty, placeholder: '数量', oninput: (e) => { r.qty = e.target.value; recalc(); } });
      const unit = h('select', { onchange: (e) => { r.unit = e.target.value; } },
        UNITS.map((u) => h('option', { value: u, selected: u === r.unit ? 'selected' : null, text: u })));
      const price = h('input', { type: 'number', min: '0', value: r.unitPrice, placeholder: '単価', oninput: (e) => { r.unitPrice = e.target.value; recalc(); } });
      const del = h('button', { class: 'btn ghost sm', text: '×', onclick: () => { rows.splice(i, 1); renderRows(); recalc(); } });
      return h('div', { class: 'est-row' }, [
        h('div', { class: 'est-name' }, [name]),
        h('div', { class: 'est-qtys' }, [qty, unit, price]),
        h('div', { class: 'est-amt', text: yen(rowAmount(r)) }),
        del,
      ]);
    }));
  }

  function addRow(name = '') {
    rows.push({ name, qty: '', unit: name ? '㎡' : '式', unitPrice: '' });
    renderRows();
  }

  const tmplBar = h('div', { class: 'photo-strip', style: 'margin-bottom:8px' },
    TEMPLATE_ITEMS.map((t) => h('button', { class: 'btn sm secondary', style: 'flex:0 0 auto', text: '＋' + t, onclick: () => { addRow(t); recalc(); } })));

  // ---- 値引き・条件 ----
  const discountInput = h('input', { type: 'number', min: '0', placeholder: '円', oninput: recalc });
  const validUntil = h('input', { type: 'date', value: addDays(todayStr(), 30) });
  const paymentTerms = h('input', { type: 'text', placeholder: '例）着手金30%・完工時残金' });
  const notes = h('textarea', { placeholder: '例）色は後日決定。近隣挨拶は当社で実施', style: 'min-height:60px' });

  // ---- 原価(粗利チェック用) ----
  const f = {};
  const num = (key, label, ph = '') => {
    const el = h('input', { type: 'number', min: '0', placeholder: ph, oninput: recalc });
    f[key] = el;
    return h('div', { class: 'field' }, [h('label', { text: label }), el]);
  };
  const paintSel = h('select', { onchange: recalc },
    PAINTS.map((p) => h('option', { value: p.key, text: `${p.label}（¥${p.unit.toLocaleString()}/㎡）` })));
  function val(key) { return parseFloat(f[key].value) || 0; }

  const warnBox = h('div', {});

  function recalc() {
    renderRowsAmountsOnly();
    const sub = subtotal();
    const discount = parseFloat(discountInput.value) || 0;
    const sellBeforeTax = Math.max(0, sub - discount);
    const tax = Math.round(sellBeforeTax * TAX_RATE);
    const total = sellBeforeTax + tax;

    // 原価
    const paint = PAINTS.find((p) => p.key === paintSel.value) || PAINTS[1];
    const paintCost = val('area') * paint.unit;
    const labor = val('laborDays') * val('laborRate');
    const cost = paintCost + val('scaffold') + val('wash') + val('repair') + val('sheet') + labor + val('outsource');
    const profit = sellBeforeTax - cost;
    const margin = sellBeforeTax > 0 ? profit / sellBeforeTax : 0;

    sumBox.replaceChildren(
      kv('小計（税抜）', yen(sub)),
      discount ? kv('値引き', '-' + yen(discount)) : null,
      kv('消費税(10%)', yen(tax)),
      kvTotal('見積金額（税込）', yen(total)),
      kv('原価合計', yen(cost)),
      kv('粗利', yen(profit)),
      kvMargin('粗利率', margin),
    );

    const warns = [];
    if (sub <= 0) warns.push('明細がありません。テンプレートから項目を追加してください');
    if (val('area') <= 0) warns.push('（原価）塗装面積が未入力です');
    if (val('laborDays') <= 0 || val('laborRate') <= 0) warns.push('（原価）人工の入力漏れの可能性');
    if (margin < MIN_MARGIN && sellBeforeTax > 0) warns.push(`粗利率が基準(${Math.round(MIN_MARGIN * 100)}%)未満です（${(margin * 100).toFixed(1)}%）`);
    if (discount > sub * MAX_DISCOUNT_RATE) warns.push(`値引きが大きすぎます（小計の${Math.round(MAX_DISCOUNT_RATE * 100)}%超）`);
    if (profit < 0 && sellBeforeTax > 0) warns.push('赤字受注です。価格を見直してください');

    warnBox.replaceChildren(
      warns.length === 0
        ? h('div', { class: 'warn-box ok', text: '✅ 価格・粗利は基準を満たしています' })
        : h('div', { class: 'warn-box bad' }, [
            h('strong', { text: '⚠️ 確認が必要です' }),
            h('ul', {}, warns.map((w) => h('li', { text: w }))),
          ]));

    return { sub, discount, tax, total, sellBeforeTax, cost, profit, margin };
  }

  // 金額表示だけ更新（入力中に行を作り直すとフォーカスが外れるため）
  function renderRowsAmountsOnly() {
    const amts = tbody.querySelectorAll('.est-amt');
    rows.forEach((r, i) => { if (amts[i]) amts[i].textContent = yen(rowAmount(r)); });
  }

  function buildEstimateRecord() {
    const r = recalc();
    return {
      siteId: siteId || null,
      number: estimateNumber(),
      issueDate: todayStr(),
      items: rows.map((x) => ({ name: x.name, qty: x.qty, unit: x.unit, unitPrice: parseFloat(x.unitPrice) || 0, amount: rowAmount(x) })),
      subtotal: r.sub, discount: r.discount, tax: r.tax, total: r.total,
      sell: r.sellBeforeTax, cost: r.cost, profit: r.profit, margin: r.margin,
      validUntil: validUntil.value, paymentTerms: paymentTerms.value.trim(), notes: notes.value.trim(),
    };
  }

  const saveBtn = h('button', {
    class: 'btn', text: site ? 'この見積を案件に保存' : '見積を保存',
    onclick: () => {
      const rec = buildEstimateRecord();
      if (rec.subtotal <= 0) { toast('明細を1つ以上入力してください'); return; }
      store.insert('estimates', rec);
      if (site) store.update('sites', site.id, {
        estimateAmount: rec.total,
        status: (site.status === 'lead' || site.status === 'survey') ? 'quote' : site.status,
      });
      toast('見積を保存しました');
      if (site) navigate('site/' + site.id);
    },
  });

  const pdfBtn = h('button', {
    class: 'btn secondary', text: '📄 見積書をPDFで出力',
    onclick: () => {
      const rec = buildEstimateRecord();
      if (rec.subtotal <= 0) { toast('明細を1つ以上入力してください'); return; }
      const target = site || { name: '御見積', customer: '', address: '' };
      openEstimateDoc(target, rec);
    },
  });

  const node = h('div', {}, [
    h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
    h('h1', { class: 'page-title', text: site ? `見積: ${site.name}` : '見積・粗利計算' }),
    hintBanner('estimate', '下の項目ボタン（足場・洗浄・上塗り…）を押して明細を足し、数量と単価を入れるだけ。原価を入れると粗利率も自動で出ます。'),

    h('div', { class: 'section-title mt-0', text: '見積明細（売価）' }),
    h('p', { class: 'sub mt-0', text: 'よく使う項目はボタンで追加できます。数量と単価を入れると金額が出ます。' }),
    tmplBar,
    tbody,
    h('button', { class: 'btn ghost', text: '＋ 空の項目を追加', onclick: () => { addRow(''); recalc(); } }),
    h('div', { class: 'grid-2', style: 'margin-top:12px' }, [
      h('div', { class: 'field' }, [h('label', { text: '値引き' }), discountInput]),
      h('div', { class: 'field' }, [h('label', { text: '見積有効期限' }), validUntil]),
    ]),
    h('div', { class: 'field' }, [h('label', { text: '支払条件' }), paymentTerms]),
    h('div', { class: 'field' }, [h('label', { text: '備考' }), notes]),

    h('div', { class: 'section-title', text: '原価（粗利チェック・社内用／PDFには出ません）' }),
    h('div', { class: 'grid-2' }, [
      h('div', { class: 'field' }, [h('label', { text: '塗装面積（㎡）' + (prefillArea ? '・現調より' : '') }), f.area = h('input', { type: 'number', min: '0', placeholder: '例）180', value: prefillArea, oninput: recalc })]),
      h('div', { class: 'field' }, [h('label', { text: '塗料グレード' }), paintSel]),
    ]),
    h('div', { class: 'grid-2' }, [num('scaffold', '足場代', '円'), num('wash', '高圧洗浄', '円')]),
    h('div', { class: 'grid-2' }, [num('repair', '下地補修', '円'), num('sheet', '養生', '円')]),
    h('div', { class: 'grid-2' }, [num('laborDays', '人工（人日）', '例）8'), num('laborRate', '人工単価', '例）20000')]),
    h('div', { class: 'grid-2' }, [num('outsource', '外注費', '円'), h('div', {})]),

    h('div', { class: 'section-title', text: '計算結果' }),
    warnBox,
    h('div', { class: 'card' }, [sumBox]),
    saveBtn,
    pdfBtn,
  ]);

  // f.area は上で直接生成したので key 登録だけ補完
  setTimeout(() => { addRow(''); recalc(); }, 0);
  return node;
}

function kv(k, v) {
  if (v == null) return null;
  return h('div', { class: 'kv' }, [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v })]);
}
function kvTotal(k, v) {
  return h('div', { class: 'kv total' }, [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v })]);
}
function kvMargin(k, margin) {
  const pct = (margin * 100).toFixed(1) + '%';
  const color = margin < MIN_MARGIN ? 'var(--red)' : 'var(--green)';
  return h('div', { class: 'kv' }, [
    h('span', { class: 'k', text: k }),
    h('span', { class: 'v', style: `color:${color}`, text: pct }),
  ]);
}
