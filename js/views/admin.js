// 管理者ビュー: ダッシュボード（今日の現場・進捗集計）と案件一覧。
import { store } from '../db.js';
import { h, toast, openModal } from '../ui.js';
import {
  STATUSES, statusInfo, activeSites, sitePhotos, siteReports,
  yen, fmtDate, todayStr,
} from '../model.js';
import { navigate } from '../app.js';
import { computeAlerts, moneySummary } from '../alerts.js';

export function renderAdminHome() {
  const sites = store.all('sites');
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
      : h('div', {}, money.map(alertCard)),
  ]);

  // 📌 やること（仕事の漏れ・中）
  const workSection = h('div', {}, [
    h('div', { class: 'section-title', text: '📌 やること（忘れ物チェック）' }),
    work.length === 0
      ? h('div', { class: 'empty', text: 'やり残しはありません 👍' })
      : h('div', {}, work.map(alertCard)),
  ]);

  const todaySection = h('div', {}, [
    h('div', { class: 'section-title', text: '🚧 今日の現場' }),
    active.length === 0
      ? h('div', { class: 'empty', text: '稼働中の現場はありません' })
      : h('div', {}, active.map((s) => caseRow(s, `写真 ${sitePhotos(s.id).length}・日報 ${siteReports(s.id).length}`))),
  ]);

  return h('div', {}, [
    h('h1', { class: 'page-title', text: '今日やること' }),
    stats,
    moneySection,
    workSection,
    todaySection,
  ]);
}

// アラート1件のカード。タップで該当現場へ。
function alertCard(a) {
  return h('div', { class: 'card tap alert-' + a.severity, onclick: () => navigate('site/' + a.siteId) }, [
    h('div', { class: 'alert-row' }, [
      h('span', { class: 'alert-ic', text: a.icon }),
      h('div', {}, [
        h('div', { class: 'alert-title', text: a.title }),
        h('div', { class: 'sub', text: `${a.name}${a.customer ? '（' + a.customer + '）' : ''}` }),
        h('div', { class: 'alert-detail', text: a.detail }),
      ]),
    ]),
  ]);
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

// ---------- 案件一覧 ----------
export function renderCases() {
  let filter = 'all';
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

  renderList();

  return h('div', {}, [
    h('div', { class: 'card-row' }, [
      h('h1', { class: 'page-title', text: '案件一覧' }),
      h('button', { class: 'btn sm', text: '＋ 新規', onclick: () => openCaseForm(null, renderList) }),
    ]),
    filterBar,
    listWrap,
  ]);
}

// 案件の新規登録・編集を兼ねるフォーム。site を渡すと編集、null なら新規。
export function openCaseForm(site, onDone) {
  const editing = !!site;
  const f = {};
  const input = (key, label, type = 'text', ph = '') => {
    const v = editing ? (site[key] ?? '') : '';
    const el = h('input', { type, placeholder: ph, value: type === 'number' ? (v ?? '') : v });
    f[key] = el;
    return h('div', { class: 'field' }, [h('label', { text: label }), el]);
  };
  const statusSel = h('select', {}, STATUSES.map((st) =>
    h('option', { value: st.key, selected: editing && site.status === st.key ? 'selected' : null, text: st.label })));
  f.status = statusSel;

  const form = h('div', {}, [
    input('name', '現場名 / 案件名', 'text', '例）田中様邸 外壁塗装'),
    input('customer', '顧客名', 'text', '例）田中 健一'),
    h('div', { class: 'grid-2' }, [input('phone', '連絡先', 'tel', '090-...'), input('manager', '担当', 'text', '担当者名')]),
    input('address', '住所', 'text', '市区町村〜番地'),
    h('div', { class: 'grid-2' }, [input('channel', '問合せ経路', 'text', 'チラシ/紹介/Web'), input('inquiryDate', '問合せ日', 'date')]),
    h('div', { class: 'grid-2' }, [input('surveyDate', '現調日', 'date'), input('estimateDate', '見積提出日', 'date')]),
    h('div', { class: 'grid-2' }, [input('estimateAmount', '見積金額', 'number', '円'), input('constructionStart', '着工予定日', 'date')]),
    h('div', { class: 'grid-2' }, [input('paymentDueDate', '入金予定日', 'date'), input('nextContact', '次回連絡日', 'date')]),
    h('div', { class: 'field' }, [h('label', { text: 'ステータス' }), statusSel]),
    h('button', {
      class: 'btn', text: editing ? '更新する' : '登録する',
      onclick: () => {
        if (!f.name.value.trim()) { toast('現場名を入力してください'); return; }
        const data = {
          name: f.name.value.trim(), customer: f.customer.value.trim(), phone: f.phone.value.trim(),
          manager: f.manager.value.trim(), address: f.address.value.trim(), channel: f.channel.value.trim(),
          inquiryDate: f.inquiryDate.value, surveyDate: f.surveyDate.value, estimateDate: f.estimateDate.value,
          constructionStart: f.constructionStart.value, paymentDueDate: f.paymentDueDate.value,
          nextContact: f.nextContact.value, status: f.status.value,
          estimateAmount: f.estimateAmount.value ? parseInt(f.estimateAmount.value, 10) : null,
        };
        if (editing) { store.update('sites', site.id, data); toast('案件を更新しました'); }
        else { store.insert('sites', data); toast('案件を登録しました'); }
        document.getElementById('modal-root').replaceChildren();
        if (onDone) onDone();
      },
    }),
  ]);

  openModal(editing ? '案件を編集' : '新規案件', form);
}
