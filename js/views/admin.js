// 管理者ビュー: ダッシュボード（今日の現場・進捗集計）と案件一覧。
import { store } from '../db.js';
import { h, toast, openModal, clear } from '../ui.js';
import {
  STATUSES, statusInfo, activeSites, sitePhotos, siteReports,
  yen, fmtDate, todayStr,
} from '../model.js';
import { navigate } from '../app.js';
import { computeAlerts, moneySummary } from '../alerts.js';
import { markInvoiced, markPaid } from '../money.js';
import { CHANNELS } from './customers.js';
import { renderCasesCalendar } from './calendar.js';

export function renderAdminHome() {
  // 請求・入金などの操作後に、ホームをその場で作り直して数字とアラートを最新化する。
  const wrap = h('div', {});
  const rerender = () => { clear(wrap); buildHome(wrap, rerender); };
  rerender();
  return wrap;
}

function buildHome(wrap, rerender) {
  const active = activeSites();
  const { money, work } = computeAlerts();
  const sum = moneySummary();

  // お金まわりのサマリー（請求漏れ・入金待ちが一目で分かる）
  const stats = h('div', { class: 'stat-row' }, [
    stat(yen(sum.uninvoiced), '未請求（完工済み）', sum.uninvoiced > 0 ? 'danger' : ''),
    stat(yen(sum.awaitingPayment), '入金待ち'),
    stat(active.length, '稼働中の現場'),
    stat(money.length + work.length, '要対応', (money.length ? 'danger' : '')),
  ]);

  // 💸 お金が漏れるぞ（最重要・赤）
  const moneySection = h('div', {}, [
    h('div', { class: 'section-title', text: '💸 お金が漏れるぞ' }),
    money.length === 0
      ? h('div', { class: 'empty', text: 'お金の漏れはありません 👍' })
      : h('div', {}, money.map((a) => alertCard(a, rerender))),
  ]);

  // 📌 やること（仕事の漏れ・中）
  const workSection = h('div', {}, [
    h('div', { class: 'section-title', text: '📌 やること（忘れ物チェック）' }),
    work.length === 0
      ? h('div', { class: 'empty', text: 'やり残しはありません 👍' })
      : h('div', {}, work.map((a) => alertCard(a, rerender))),
  ]);

  const todaySection = h('div', {}, [
    h('div', { class: 'section-title', text: '🚧 今日の現場' }),
    active.length === 0
      ? h('div', { class: 'empty', text: '稼働中の現場はありません' })
      : h('div', {}, active.map((s) => caseRow(s, `写真 ${sitePhotos(s.id).length}・日報 ${siteReports(s.id).length}`))),
  ]);

  wrap.append(
    h('h1', { class: 'page-title', text: '今日やること' }),
    h('button', { class: 'btn', text: '＋ 新規案件を登録', onclick: () => openCaseForm(null, rerender) }),
    stats,
    moneySection,
    workSection,
    todaySection,
  );
}

// アラート1件のカード。本文タップで現場へ。種別に応じてワンタップ解決ボタンを出す。
function alertCard(a, onResolved) {
  const action = alertAction(a, onResolved);
  return h('div', { class: 'card alert-' + a.severity }, [
    h('div', { class: 'alert-row tap', onclick: () => navigate('site/' + a.siteId) }, [
      h('span', { class: 'alert-ic', text: a.icon }),
      h('div', {}, [
        h('div', { class: 'alert-title', text: a.title }),
        h('div', { class: 'sub', text: `${a.name}${a.customer ? '（' + a.customer + '）' : ''}` }),
        h('div', { class: 'alert-detail', text: a.detail }),
      ]),
    ]),
    action ? h('div', { class: 'alert-actions' }, [action]) : null,
  ]);
}

// アラート種別ごとの解決ボタン（その場で記録 → ホーム再描画）。
function alertAction(a, onResolved) {
  const site = () => store.get('sites', a.siteId);
  if (a.action === 'invoice') {
    return h('button', { class: 'btn sm', text: '🧾 請求書を作った', onclick: () => markInvoiced(site(), onResolved) });
  }
  if (a.action === 'payment') {
    return h('button', { class: 'btn sm', text: '💰 入金を確認した', onclick: () => markPaid(site(), onResolved) });
  }
  if (a.action === 'estimate') {
    return h('button', { class: 'btn sm secondary', text: '🧮 見積を作る', onclick: () => navigate('estimate/' + a.siteId) });
  }
  if (a.action === 'call') {
    // 追客の連絡を済ませたら消す。現場を開いて詳細確認もできる。
    return h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn sm secondary', text: '現場を見る', onclick: () => navigate('site/' + a.siteId) }),
      h('button', {
        class: 'btn sm', text: '✔ 連絡した',
        onclick: () => { store.update('sites', a.siteId, { nextContact: '' }); toast('連絡済みにしました'); onResolved && onResolved(); },
      }),
    ]);
  }
  return null;
}

function stat(num, lbl, variant = '') {
  return h('div', { class: 'stat' + (variant ? ' ' + variant : '') }, [
    h('div', { class: 'num', text: String(num) }),
    h('div', { class: 'lbl', text: lbl }),
  ]);
}

function caseRow(s, meta) {
  const si = statusInfo(s.status);
  return h('div', { class: 'card tap', onclick: () => navigate('site/' + s.id) }, [
    h('div', { class: 'card-row' }, [
      h('h3', { text: s.name }),
      h('span', { class: 'pill ' + si.cls, text: si.label }),
    ]),
    h('div', { class: 'sub', text: `${s.customer || ''}　${meta}` }),
  ]);
}

// ---------- 案件一覧 / カレンダー ----------
export function renderCases() {
  let filter = 'all';
  let view = 'list'; // 'list' | 'calendar'
  const body = h('div', {});
  const listWrap = h('div', {});

  const renderList = () => {
    let sites = store.all('sites').sort((a, b) => b.createdAt - a.createdAt);
    if (filter !== 'all') sites = sites.filter((s) => s.status === filter);
    listWrap.replaceChildren(
      sites.length === 0
        ? h('div', { class: 'empty', text: '該当する案件がありません' })
        : h('div', {}, sites.map((s) => caseRow(s,
            `${s.estimateAmount ? yen(s.estimateAmount) : '見積未'}・担当 ${s.manager || '—'}`))));
  };

  const filterBar = h('div', { class: 'photo-strip', style: 'margin-bottom:8px' }, [
    chip('すべて', 'all'), ...STATUSES.map((st) => chip(st.label, st.key)),
  ].map((c) => c));

  function chip(label, key) {
    const b = h('button', {
      class: 'btn sm ' + (key === filter ? '' : 'secondary'),
      style: 'flex:0 0 auto',
      text: label,
      onclick: () => {
        filter = key;
        filterBar.querySelectorAll('button').forEach((x) => x.classList.add('secondary'));
        b.classList.remove('secondary');
        renderList();
      },
    });
    return b;
  }

  const renderBody = () => {
    if (view === 'list') {
      renderList();
      body.replaceChildren(filterBar, listWrap);
    } else {
      body.replaceChildren(renderCasesCalendar());
    }
  };

  // 一覧 / カレンダー 切替
  const viewSwitch = h('div', { class: 'role-switch', style: 'width:100%;margin-bottom:10px' }, [
    h('button', { class: view === 'list' ? 'active' : '', text: '📋 一覧', onclick: (e) => { view = 'list'; pickView(e); } }),
    h('button', { class: view === 'calendar' ? 'active' : '', text: '📅 カレンダー', onclick: (e) => { view = 'calendar'; pickView(e); } }),
  ]);
  function pickView(e) { viewSwitch.querySelectorAll('button').forEach((b) => b.classList.remove('active')); e.target.classList.add('active'); renderBody(); }

  renderBody();

  return h('div', {}, [
    h('div', { class: 'card-row' }, [
      h('h1', { class: 'page-title', text: '案件' }),
      h('button', { class: 'btn sm', text: '＋ 新規', onclick: () => openCaseForm(null, renderBody) }),
    ]),
    viewSwitch,
    body,
  ]);
}

// 案件の新規登録・編集を兼ねるフォーム。site を渡すと編集、null なら新規。
// 新規は「迷わず入れられる」よう必要最小限の項目だけ。日付・金額の詳細は登録後に編集で足す。
// preset を渡すと新規時に初期値を流し込む（例: 顧客詳細から「この顧客で新規案件」）。
export function openCaseForm(site, onDone, preset = null) {
  const editing = !!site;
  const f = {};
  const src = editing ? site : (preset || {});
  const input = (key, label, type = 'text', ph = '') => {
    const v = src[key] ?? (key === 'inquiryDate' && !editing ? todayStr() : '');
    const el = h('input', { type, placeholder: ph, value: v });
    f[key] = el;
    return h('div', { class: 'field' }, [h('label', { text: label }), el]);
  };
  // 問合せ経路は選択式（自由入力をやめて迷いを減らす）
  const channelSel = h('select', {}, [
    h('option', { value: '', text: '（未選択）' }),
    ...CHANNELS.map((c) => h('option', { value: c, selected: src.channel === c ? 'selected' : null, text: c })),
  ]);
  f.channel = channelSel;
  const statusSel = h('select', {}, STATUSES.map((st) =>
    h('option', { value: st.key, selected: (src.status || 'lead') === st.key ? 'selected' : null, text: st.label })));
  f.status = statusSel;
  const memo = h('textarea', { placeholder: '例）色は後日決定。日中不在、夕方連絡可', style: 'min-height:56px' }, src.memo || '');
  f.memo = memo;

  // 新規＝最小項目 / 編集＝詳細（日付・金額）も表示
  const baseFields = [
    input('name', '現場名 / 案件名（必須）', 'text', '例）田中様邸 外壁塗装'),
    input('customer', '顧客名', 'text', '例）田中 健一'),
    h('div', { class: 'grid-2' }, [input('phone', '連絡先', 'tel', '090-...'), input('manager', '担当', 'text', '担当者名')]),
    input('address', '住所', 'text', '市区町村〜番地'),
    h('div', { class: 'grid-2' }, [
      h('div', { class: 'field' }, [h('label', { text: '問合せ経路' }), channelSel]),
      input('inquiryDate', '問合せ日', 'date'),
    ]),
    h('div', { class: 'grid-2' }, [input('surveyDate', '現調予定日', 'date'), input('constructionStart', '着工予定日', 'date')]),
    h('div', { class: 'field' }, [h('label', { text: 'ステータス' }), statusSel]),
    h('div', { class: 'field' }, [h('label', { text: 'メモ' }), memo]),
  ];
  const detailFields = editing ? [
    h('div', { class: 'section-title', text: '金額・日程（必要になったら入力）' }),
    h('div', { class: 'grid-2' }, [input('estimateDate', '見積提出日', 'date'), input('estimateAmount', '見積金額', 'number', '円')]),
    h('div', { class: 'grid-2' }, [input('contractAmount', '契約金額', 'number', '円'), input('completionDate', '完工日', 'date')]),
    h('div', { class: 'grid-2' }, [input('invoiceDate', '請求日', 'date'), input('paymentDueDate', '入金予定日', 'date')]),
    h('div', { class: 'grid-2' }, [input('paymentDate', '入金日', 'date'), input('nextContact', '次回連絡日', 'date')]),
  ] : [];

  const save = () => {
    if (!f.name.value.trim()) { toast('現場名を入力してください'); return; }
    const data = {
      name: f.name.value.trim(), customer: f.customer.value.trim(), phone: f.phone.value.trim(),
      manager: f.manager.value.trim(), address: f.address.value.trim(), channel: channelSel.value,
      inquiryDate: f.inquiryDate.value, surveyDate: f.surveyDate.value,
      constructionStart: f.constructionStart.value, status: f.status.value, memo: memo.value.trim(),
      customerId: editing ? (site.customerId || null) : (preset?.customerId || null),
    };
    // 詳細項目は編集時のみ更新（新規では既存の最小項目だけ保存）
    if (editing) {
      Object.assign(data, {
        estimateDate: f.estimateDate.value, completionDate: f.completionDate.value,
        invoiceDate: f.invoiceDate.value, paymentDueDate: f.paymentDueDate.value,
        paymentDate: f.paymentDate.value, nextContact: f.nextContact.value,
        estimateAmount: f.estimateAmount.value ? parseInt(f.estimateAmount.value, 10) : null,
        contractAmount: f.contractAmount.value ? parseInt(f.contractAmount.value, 10) : null,
      });
      store.update('sites', site.id, data); toast('案件を更新しました');
    } else {
      store.insert('sites', data); toast('案件を登録しました');
    }
    document.getElementById('modal-root').replaceChildren();
    if (onDone) onDone();
  };

  const form = h('div', {}, [
    ...baseFields, ...detailFields,
    h('button', { class: 'btn', text: editing ? '更新する' : '登録する', onclick: save }),
  ]);
  openModal(editing ? '案件を編集' : '新規案件', form);
}
