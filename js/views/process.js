// 工程管理（個人プラン）: スマホで分かりやすい縦型工程表。
// 標準工程を一括追加し、各工程の予定日・完了・延期を記録する。
// 塗装は天候に左右されるため「雨天延期で以降の予定をまとめてずらす」を簡単にする。
import { store } from '../db.js';
import { h, toast, openModal, clear } from '../ui.js';
import { todayStr, fmtDate } from '../model.js';
import { navigate } from '../app.js';
import { addDays } from '../money.js';

// 塗装の標準工程（順序付き）
const PROCESS_TEMPLATE = [
  '足場', '高圧洗浄', '下地処理', '養生', '下塗り', '中塗り', '上塗り',
  '付帯部', '検査', '手直し', '完工', '足場解体',
];
const DELAY_REASONS = ['雨天', '強風', '乾燥不足', '材料待ち', '顧客都合', '職人都合', 'その他'];

const STATUS = {
  todo: { label: '未着手', cls: '' },
  doing: { label: '進行中', cls: 's-work' },
  done: { label: '完了', cls: 's-paid' },
  delayed: { label: '延期', cls: 's-billed' },
};

function siteProcesses(siteId) {
  return store.all('processes').filter((p) => p.siteId === siteId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
export function processProgress(siteId) {
  const list = siteProcesses(siteId);
  if (!list.length) return null;
  return { done: list.filter((p) => p.status === 'done').length, total: list.length };
}

export function renderProcess(siteId) {
  const site = store.get('sites', siteId);
  if (!site) return h('div', { class: 'empty', text: '現場が見つかりません' });

  const wrap = h('div', {});
  const rerender = () => { clear(wrap); build(wrap, site, rerender); };
  rerender();
  return wrap;
}

function build(wrap, site, rerender) {
  const list = siteProcesses(site.id);

  wrap.append(
    h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
    h('h1', { class: 'page-title', text: '工程表' }),
    h('p', { class: 'sub mt-0', text: site.name }),
  );

  if (list.length === 0) {
    wrap.append(
      h('div', { class: 'empty', text: 'まだ工程がありません' }),
      h('button', {
        class: 'btn', text: '＋ 標準工程を一括で作る',
        onclick: () => {
          const start = site.constructionStart || todayStr();
          PROCESS_TEMPLATE.forEach((name, i) => {
            store.insert('processes', {
              siteId: site.id, processType: name, status: 'todo',
              scheduledDate: addDays(start, i), completedDate: '', delayReason: '', memo: '', sortOrder: i,
            });
          });
          toast('標準工程を作成しました');
          rerender();
        },
      }),
      hint(),
    );
    return;
  }

  const prog = processProgress(site.id);
  wrap.append(h('div', { class: 'stat-row', style: 'grid-template-columns:1fr 1fr;margin-bottom:12px' }, [
    h('div', { class: 'stat' }, [h('div', { class: 'num', text: `${prog.done}/${prog.total}` }), h('div', { class: 'lbl', text: '完了した工程' })]),
    h('div', { class: 'stat' + (prog.done === prog.total ? ' ' : '') }, [
      h('div', { class: 'num', text: prog.done === prog.total ? '完工 🎉' : '工事中' }),
      h('div', { class: 'lbl', text: '進捗' }),
    ]),
  ]));

  wrap.append(h('div', { class: 'timeline' }, list.map((p) => processRow(p, rerender))));
  wrap.append(hint());
}

function hint() {
  return h('p', { class: 'sub', style: 'margin-top:14px', text: '雨で順延したら「延期」→ 理由と日数を選ぶと、以降の工程もまとめてずらせます。' });
}

function processRow(p, rerender) {
  const st = STATUS[p.status] || STATUS.todo;

  const dateInput = h('input', {
    type: 'date', value: p.scheduledDate || '',
    onchange: (e) => { store.update('processes', p.id, { scheduledDate: e.target.value }); toast('予定日を更新'); },
  });

  const doneBtn = h('button', {
    class: 'btn sm ' + (p.status === 'done' ? 'secondary' : ''),
    text: p.status === 'done' ? '完了を取消' : '✓ 完了',
    onclick: () => {
      if (p.status === 'done') store.update('processes', p.id, { status: 'todo', completedDate: '' });
      else store.update('processes', p.id, { status: 'done', completedDate: todayStr() });
      rerender();
    },
  });
  const delayBtn = h('button', { class: 'btn sm secondary', text: '⏭ 延期', onclick: () => openDelay(p, rerender) });

  return h('div', { class: 'tl-item' }, [
    h('div', { class: 'tl-dot ' + (p.status === 'done' ? 'on' : '') }),
    h('div', { class: 'tl-body card' }, [
      h('div', { class: 'card-row' }, [
        h('h3', { text: p.processType }),
        h('span', { class: 'pill ' + st.cls, text: st.label }),
      ]),
      h('div', { class: 'sub', text: p.status === 'done' && p.completedDate ? `完了日 ${fmtDate(p.completedDate)}` : (p.delayReason ? `延期理由: ${p.delayReason}` : '') }),
      h('div', { class: 'field', style: 'margin:8px 0 0' }, [h('label', { text: '予定日' }), dateInput]),
      h('div', { class: 'btn-row' }, [doneBtn, delayBtn]),
    ]),
  ]);
}

// 延期モーダル: 理由と日数を選び、以降の工程もまとめてずらせる。
function openDelay(p, rerender) {
  const reason = h('select', {}, DELAY_REASONS.map((r) => h('option', { value: r, text: r })));
  const days = h('input', { type: 'number', min: '1', value: '1' });
  const cascade = h('input', { type: 'checkbox', checked: 'checked' });

  const apply = () => {
    const n = Math.max(1, parseInt(days.value, 10) || 1);
    store.update('processes', p.id, {
      status: 'delayed', delayReason: reason.value,
      scheduledDate: addDays(p.scheduledDate || todayStr(), n),
    });
    if (cascade.checked) {
      // 以降（sortOrderが大きい）の未完了工程もまとめてずらす
      for (const q of store.all('processes')) {
        if (q.siteId === p.siteId && q.id !== p.id && (q.sortOrder ?? 0) > (p.sortOrder ?? 0) && q.status !== 'done') {
          store.update('processes', q.id, { scheduledDate: addDays(q.scheduledDate || todayStr(), n) });
        }
      }
    }
    clear(document.getElementById('modal-root'));
    toast('日程をずらしました');
    rerender();
  };

  openModal('工程を延期', h('div', {}, [
    h('p', { class: 'sub mt-0', text: p.processType }),
    h('div', { class: 'field' }, [h('label', { text: '延期理由' }), reason]),
    h('div', { class: 'field' }, [h('label', { text: '何日ずらす' }), days]),
    h('label', { class: 'check-row' }, [cascade, h('span', { text: ' 以降の工程もまとめてずらす' })]),
    h('button', { class: 'btn', text: 'この内容でずらす', onclick: apply }),
  ]));
}
