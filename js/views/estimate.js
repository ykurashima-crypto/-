// 見積・粗利計算: 面積/塗料/足場/人工などから売価と粗利率を算出し、
// 粗利率低下・入力漏れ・値引き超過を警告する。
import { store } from '../db.js';
import { h, toast } from '../ui.js';
import { yen } from '../model.js';
import { navigate } from '../app.js';

// 警告の基準
const MIN_MARGIN = 0.25;      // 最低粗利率 25%
const MAX_DISCOUNT_RATE = 0.1; // 値引きは売価の10%まで

// 塗料グレード（㎡単価の材工目安・サンプル値）
const PAINTS = [
  { key: 'urethane', label: 'ウレタン', unit: 2200 },
  { key: 'silicon',  label: 'シリコン', unit: 2600 },
  { key: 'fluorine', label: 'フッ素',   unit: 3600 },
  { key: 'inorganic',label: '無機',     unit: 4200 },
];

export function renderEstimate(siteId) {
  const site = siteId ? store.get('sites', siteId) : null;

  const f = {};
  const num = (key, label, ph = '', val = '') => {
    const el = h('input', { type: 'number', min: '0', placeholder: ph, value: val, oninput: recalc });
    f[key] = el;
    return h('div', { class: 'field' }, [h('label', { text: label }), el]);
  };

  const paintSel = h('select', { onchange: recalc },
    PAINTS.map((p) => h('option', { value: p.key, text: `${p.label}（¥${p.unit.toLocaleString()}/㎡）` })));
  f.paint = paintSel;

  const result = h('div', {});
  const warnBox = h('div', {});

  function val(key) { return parseFloat(f[key].value) || 0; }

  function recalc() {
    const area = val('area');
    const paint = PAINTS.find((p) => p.key === paintSel.value) || PAINTS[1];
    const paintCost = area * paint.unit;             // 塗装材工
    const scaffold = val('scaffold');                // 足場代
    const wash = val('wash');                        // 高圧洗浄
    const repair = val('repair');                    // 下地補修
    const sheet = val('sheet');                      // 養生
    const labor = val('laborDays') * val('laborRate'); // 人工(人日×単価)
    const outsource = val('outsource');              // 外注費
    const discount = val('discount');                // 値引き
    const taxRate = 0.1;

    const cost = paintCost + scaffold + wash + repair + sheet + labor + outsource;
    const subtotal = Math.max(0, cost / (1 - MIN_MARGIN)); // 目標粗利を確保した推奨売価
    const sellBeforeTax = Math.max(0, (val('sellPrice') || Math.round(subtotal)) - discount);
    const tax = Math.round(sellBeforeTax * taxRate);
    const total = sellBeforeTax + tax;
    const profit = sellBeforeTax - cost;
    const margin = sellBeforeTax > 0 ? profit / sellBeforeTax : 0;

    // 結果表示
    result.replaceChildren(
      kv('原価合計', yen(cost)),
      kv('推奨売価（税抜）', yen(subtotal)),
      kv('見積売価（税抜）', yen(sellBeforeTax)),
      kv('消費税(10%)', yen(tax)),
      kvTotal('見積金額（税込）', yen(total)),
      kv('粗利', yen(profit)),
      kvMargin('粗利率', margin),
    );

    // 警告
    const warns = [];
    if (area <= 0) warns.push('塗装面積が未入力です');
    if (paintCost <= 0) warns.push('材料原価（塗料）の入力漏れの可能性');
    if (val('laborDays') <= 0 || val('laborRate') <= 0) warns.push('人工の入力漏れの可能性');
    if (margin < MIN_MARGIN && sellBeforeTax > 0) warns.push(`粗利率が基準(${Math.round(MIN_MARGIN * 100)}%)未満です（${(margin * 100).toFixed(1)}%）`);
    if (discount > (val('sellPrice') || subtotal) * MAX_DISCOUNT_RATE) warns.push(`値引きが大きすぎます（売価の${Math.round(MAX_DISCOUNT_RATE * 100)}%超）`);
    if (profit < 0) warns.push('赤字受注です。価格を見直してください');

    warnBox.replaceChildren(
      warns.length === 0
        ? h('div', { class: 'warn-box ok', text: '✅ 価格・粗利は基準を満たしています' })
        : h('div', { class: 'warn-box bad' }, [
            h('strong', { text: '⚠️ 確認が必要です' }),
            h('ul', {}, warns.map((w) => h('li', { text: w }))),
          ]));

    return { total, sellBeforeTax, profit, margin };
  }

  const saveBtn = h('button', {
    class: 'btn', text: site ? 'この見積を案件に保存' : '見積を保存',
    onclick: () => {
      const r = recalc();
      const rec = store.insert('estimates', {
        siteId: siteId || null,
        total: r.total, sell: r.sellBeforeTax, profit: r.profit, margin: r.margin,
      });
      if (site) store.update('sites', site.id, { estimateAmount: r.total, status: site.status === 'lead' || site.status === 'survey' ? 'quote' : site.status });
      toast('見積を保存しました');
      if (site) navigate('site/' + site.id);
    },
  });

  const fields = h('div', {}, [
    num('area', '塗装面積（㎡）', '例）180'),
    h('div', { class: 'field' }, [h('label', { text: '塗料グレード' }), paintSel]),
    h('div', { class: 'grid-2' }, [num('scaffold', '足場代', '円'), num('wash', '高圧洗浄', '円')]),
    h('div', { class: 'grid-2' }, [num('repair', '下地補修', '円'), num('sheet', '養生', '円')]),
    h('div', { class: 'grid-2' }, [num('laborDays', '人工（人日）', '例）8'), num('laborRate', '人工単価', '例）20000')]),
    h('div', { class: 'grid-2' }, [num('outsource', '外注費', '円'), num('discount', '値引き', '円')]),
    num('sellPrice', '見積売価（税抜・空欄なら推奨額）', '空欄で自動'),
  ]);

  const node = h('div', {}, [
    h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
    h('h1', { class: 'page-title', text: site ? `見積: ${site.name}` : '見積・粗利計算' }),
    fields,
    h('div', { class: 'section-title', text: '計算結果' }),
    warnBox,
    h('div', { class: 'card' }, [result]),
    saveBtn,
  ]);

  // 初期計算
  setTimeout(recalc, 0);
  return node;
}

function kv(k, v) {
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
