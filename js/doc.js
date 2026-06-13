// 見積書・請求書を「そのまま送れる紙」として出力する。
// 依存ライブラリ・ビルド不要。ブラウザの印刷機能で「PDFとして保存」できる。
// 日本語はシステムフォントで描画されるため文字化けしない。
import { getCompany } from './company.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function yen(n) {
  if (n == null || isNaN(n)) return '¥0';
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}
function jdate(d) {
  const dt = d ? new Date(d + 'T00:00:00') : new Date();
  if (isNaN(dt)) return esc(d);
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

// 共通の印刷用ページを新しいウィンドウで開く。印刷→PDF保存の導線を上部に置く。
function printDoc(winTitle, innerHtml) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('ポップアップがブロックされました。ブラウザの設定で許可してください。');
    return;
  }
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(winTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
    color: #1a2330; margin: 0; background: #f0f2f5; }
  .toolbar { position: sticky; top: 0; background: #1f6feb; color: #fff; padding: 12px 16px;
    display: flex; gap: 12px; align-items: center; }
  .toolbar button { font-size: 15px; font-weight: 700; padding: 10px 18px; border: 0; border-radius: 10px;
    background: #fff; color: #1f6feb; }
  .toolbar .note { font-size: 13px; opacity: .95; }
  .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 16px auto; padding: 18mm 16mm;
    box-shadow: 0 2px 14px rgba(0,0,0,.15); }
  h1.doc-title { text-align: center; font-size: 26px; letter-spacing: 8px; margin: 0 0 18px; }
  .top { display: flex; justify-content: space-between; gap: 20px; }
  .to { flex: 1; }
  .to .name { font-size: 20px; font-weight: 700; border-bottom: 2px solid #1a2330; padding-bottom: 6px; }
  .meta { font-size: 13px; color: #555; margin-top: 8px; }
  .from { width: 46%; font-size: 13px; line-height: 1.6; }
  .from .cname { font-size: 16px; font-weight: 700; }
  .from img.logo { max-height: 48px; margin-bottom: 6px; }
  .subject { margin: 18px 0 8px; font-size: 15px; }
  .total-box { border: 2px solid #1a2330; border-radius: 8px; padding: 12px 16px; margin: 10px 0 18px;
    display: flex; justify-content: space-between; align-items: center; }
  .total-box .lbl { font-size: 16px; font-weight: 700; }
  .total-box .amt { font-size: 28px; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #c4ccd6; padding: 8px 10px; }
  th { background: #eef2f7; text-align: center; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.center { text-align: center; }
  .sums { width: 50%; margin-left: auto; margin-top: 10px; }
  .sums td { border: 0; border-bottom: 1px solid #e1e6ec; padding: 6px 4px; }
  .sums .grand td { border-top: 2px solid #1a2330; border-bottom: 0; font-size: 17px; font-weight: 800; padding-top: 10px; }
  .terms { margin-top: 22px; font-size: 13px; line-height: 1.8; }
  .terms .box { border: 1px solid #c4ccd6; border-radius: 8px; padding: 10px 12px; margin-top: 6px; white-space: pre-wrap; }
  .foot { margin-top: 26px; font-size: 12px; color: #777; text-align: center; }
  @media print {
    .toolbar { display: none; }
    body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; width: auto; min-height: auto; padding: 0; }
    @page { size: A4; margin: 14mm; }
  }
</style></head><body>
<div class="toolbar">
  <button onclick="window.print()">🖨 印刷 / PDFで保存</button>
  <span class="note">「送信先」で「PDFに保存」を選ぶと、LINEやメールで送れます</span>
</div>
<div class="sheet">${innerHtml}</div>
</body></html>`);
  w.document.close();
}

// 自社情報ブロック（差出人）
function fromBlock(c) {
  return `<div class="from">
    ${c.logo ? `<img class="logo" src="${esc(c.logo)}" alt="">` : ''}
    <div class="cname">${esc(c.name || '（自社情報が未設定です）')}</div>
    ${c.owner ? `<div>${esc(c.owner)}</div>` : ''}
    ${c.postalCode ? `<div>〒${esc(c.postalCode)}</div>` : ''}
    ${c.address ? `<div>${esc(c.address)}</div>` : ''}
    ${c.phone ? `<div>TEL: ${esc(c.phone)}</div>` : ''}
    ${c.email ? `<div>${esc(c.email)}</div>` : ''}
    ${c.invoiceRegNo ? `<div>登録番号: ${esc(c.invoiceRegNo)}</div>` : ''}
  </div>`;
}

function itemRows(items) {
  if (!items || !items.length) return '';
  return items.map((it) => `<tr>
    <td>${esc(it.name)}</td>
    <td class="num">${it.qty != null && it.qty !== '' ? esc(it.qty) : ''}</td>
    <td class="center">${esc(it.unit || '')}</td>
    <td class="num">${it.unitPrice ? yen(it.unitPrice) : ''}</td>
    <td class="num">${yen(it.amount)}</td>
  </tr>`).join('');
}

// 御見積書 PDF
export function openEstimateDoc(site, est) {
  const c = getCompany();
  const items = (est && est.items) || [];
  const subtotal = est?.subtotal ?? site.estimateAmount ?? 0;
  const discount = est?.discount ?? 0;
  const tax = est?.tax ?? Math.round((subtotal - discount) * 0.1);
  const total = est?.total ?? (subtotal - discount + tax);

  const inner = `
    <h1 class="doc-title">御 見 積 書</h1>
    <div class="top">
      <div class="to">
        <div class="name">${esc(site.customer || 'お客様')} 様</div>
        <div class="meta">
          見積番号: ${esc(est?.number || '—')}<br>
          発行日: ${jdate(est?.issueDate)}<br>
          有効期限: ${est?.validUntil ? jdate(est.validUntil) : '発行日より30日間'}
        </div>
      </div>
      ${fromBlock(c)}
    </div>
    <div class="subject">件名: <strong>${esc(site.name)}</strong>${site.address ? `（${esc(site.address)}）` : ''}</div>
    <div class="total-box"><span class="lbl">御見積金額（税込）</span><span class="amt">${yen(total)}</span></div>
    <table>
      <thead><tr><th style="width:44%">品名・仕様</th><th style="width:12%">数量</th><th style="width:10%">単位</th><th style="width:17%">単価</th><th style="width:17%">金額</th></tr></thead>
      <tbody>${itemRows(items) || `<tr><td>塗装工事 一式</td><td class="num"></td><td class="center">式</td><td class="num"></td><td class="num">${yen(subtotal)}</td></tr>`}</tbody>
    </table>
    <table class="sums">
      <tr><td>小計</td><td class="num">${yen(subtotal)}</td></tr>
      ${discount ? `<tr><td>値引き</td><td class="num">-${yen(discount)}</td></tr>` : ''}
      <tr><td>消費税(10%)</td><td class="num">${yen(tax)}</td></tr>
      <tr class="grand"><td>合計</td><td class="num">${yen(total)}</td></tr>
    </table>
    <div class="terms">
      ${est?.paymentTerms ? `お支払条件<div class="box">${esc(est.paymentTerms)}</div>` : ''}
      ${est?.notes ? `備考<div class="box">${esc(est.notes)}</div>` : ''}
    </div>
    <div class="foot">この度はお見積りの機会をいただき誠にありがとうございます。</div>`;
  printDoc(`見積書_${site.name}`, inner);
}

// 御請求書 PDF（site.contractAmount または見積合計を税込合計として扱う）
export function openInvoiceDoc(site, opts = {}) {
  const c = getCompany();
  const total = opts.total ?? site.contractAmount ?? site.estimateAmount ?? 0;
  const subtotal = Math.round(total / 1.1);
  const tax = total - subtotal;

  const inner = `
    <h1 class="doc-title">御 請 求 書</h1>
    <div class="top">
      <div class="to">
        <div class="name">${esc(site.customer || 'お客様')} 様</div>
        <div class="meta">
          請求番号: ${esc(opts.number || '—')}<br>
          発行日: ${jdate(site.invoiceDate)}<br>
          お支払期限: ${site.paymentDueDate ? jdate(site.paymentDueDate) : '—'}
        </div>
      </div>
      ${fromBlock(c)}
    </div>
    <div class="subject">件名: <strong>${esc(site.name)}</strong>${site.address ? `（${esc(site.address)}）` : ''}</div>
    <div class="total-box"><span class="lbl">御請求金額（税込）</span><span class="amt">${yen(total)}</span></div>
    <table>
      <thead><tr><th style="width:60%">品名</th><th style="width:20%">数量</th><th style="width:20%">金額</th></tr></thead>
      <tbody><tr><td>${esc(site.name)}</td><td class="center">一式</td><td class="num">${yen(subtotal)}</td></tr></tbody>
    </table>
    <table class="sums">
      <tr><td>小計</td><td class="num">${yen(subtotal)}</td></tr>
      <tr><td>消費税(10%)</td><td class="num">${yen(tax)}</td></tr>
      <tr class="grand"><td>合計</td><td class="num">${yen(total)}</td></tr>
    </table>
    <div class="terms">
      お振込先<div class="box">${esc(c.bank || '（振込先が未設定です。共有タブの自社情報で登録してください）')}</div>
    </div>
    <div class="foot">お振込手数料はお客様にてご負担くださいますようお願い申し上げます。</div>`;
  printDoc(`請求書_${site.name}`, inner);
}
