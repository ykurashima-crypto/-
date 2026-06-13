// 管理者ビュー: ダッシュボード（今日の現場・進捗集計）と案件一覧。
import { store } from '../db.js';
import { h, toast, openModal } from '../ui.js';
import {
  STATUSES, statusInfo, activeSites, sitePhotos, siteReports,
  yen, fmtDate, todayStr,
} from '../model.js';
import { navigate } from '../app.js';

export function renderAdminHome() {
  const sites = store.all('sites');
  const active = activeSites();
  const today = todayStr();

  // 集計
  const wonAmount = sites.filter((s) => ['won', 'work', 'done', 'billed', 'paid'].includes(s.status))
    .reduce((a, s) => a + (s.estimateAmount || 0), 0);
  const openLeads = sites.filter((s) => ['lead', 'survey', 'quote', 'quoted', 'follow'].includes(s.status)).length;
  const reportCount = store.all('reports').length;
  const photoCount = store.all('photos').length;

  const stats = h('div', { class: 'stat-row' }, [
    stat(active.length, '稼働中の現場'),
    stat(openLeads, '追客中の案件'),
    stat(yen(wonAmount), '受注金額（累計）'),
    stat(`${photoCount}枚 / ${reportCount}件`, '写真 / 日報'),
  ]);

  // 要対応: 次回連絡日が今日以前のもの
  const needFollow = sites
    .filter((s) => s.nextContact && s.nextContact <= today && !['paid', 'done', 'billed'].includes(s.status))
    .sort((a, b) => (a.nextContact || '').localeCompare(b.nextContact || ''));

  const followSection = h('div', {}, [
    h('div', { class: 'section-title', text: '⏰ 要対応（次回連絡日が到来）' }),
    needFollow.length === 0
      ? h('div', { class: 'empty', text: '対応漏れはありません 👍' })
      : h('div', {}, needFollow.map((s) => caseRow(s, `次回連絡: ${fmtDate(s.nextContact)}`))),
  ]);

  const todaySection = h('div', {}, [
    h('div', { class: 'section-title', text: '🚧 今日の現場' }),
    active.length === 0
      ? h('div', { class: 'empty', text: '稼働中の現場はありません' })
      : h('div', {}, active.map((s) => caseRow(s, `写真 ${sitePhotos(s.id).length}・日報 ${siteReports(s.id).length}`))),
  ]);

  return h('div', {}, [
    h('h1', { class: 'page-title', text: 'ダッシュボード' }),
    stats,
    followSection,
    todaySection,
  ]);
}

function stat(num, lbl) {
  return h('div', { class: 'stat' }, [
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
      h('button', { class: 'btn sm', text: '＋ 新規', onclick: () => openNewCase(renderList) }),
    ]),
    filterBar,
    listWrap,
  ]);
}

function openNewCase(refresh) {
  const f = {};
  const input = (key, label, type = 'text', ph = '') => {
    const el = h('input', { type, placeholder: ph });
    f[key] = el;
    return h('div', { class: 'field' }, [h('label', { text: label }), el]);
  };
  const statusSel = h('select', {}, STATUSES.map((st) => h('option', { value: st.key, text: st.label })));
  f.status = statusSel;

  const form = h('div', {}, [
    input('name', '現場名 / 案件名', 'text', '例）田中様邸 外壁塗装'),
    input('customer', '顧客名'),
    h('div', { class: 'grid-2' }, [input('phone', '連絡先', 'tel'), input('manager', '担当')]),
    input('address', '住所'),
    h('div', { class: 'grid-2' }, [input('channel', '問合せ経路', 'text', 'チラシ/紹介/Web'), input('inquiryDate', '問合せ日', 'date')]),
    h('div', { class: 'grid-2' }, [input('estimateAmount', '見積金額', 'number', '円'), input('nextContact', '次回連絡日', 'date')]),
    h('div', { class: 'field' }, [h('label', { text: 'ステータス' }), statusSel]),
    h('button', {
      class: 'btn', text: '登録する',
      onclick: () => {
        if (!f.name.value.trim()) { toast('現場名を入力してください'); return; }
        store.insert('sites', {
          name: f.name.value.trim(), customer: f.customer.value.trim(), phone: f.phone.value.trim(),
          manager: f.manager.value.trim(), address: f.address.value.trim(), channel: f.channel.value.trim(),
          inquiryDate: f.inquiryDate.value, nextContact: f.nextContact.value, status: f.status.value,
          estimateAmount: f.estimateAmount.value ? parseInt(f.estimateAmount.value, 10) : null,
          surveyDate: '', estimateDate: '', constructionStart: '',
        });
        toast('案件を登録しました');
        document.getElementById('modal-root').replaceChildren();
        refresh();
      },
    }),
  ]);

  openModal('新規案件', form);
}
