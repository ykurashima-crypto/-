// 現場まわりの中核ビュー: 現場詳細 / 日報フォーム / 写真撮影。
import { store } from '../db.js';
import { deleteBlob, revokeURL } from '../db.js';
import { h, toast, photoThumb, openPhoto, openModal, clear } from '../ui.js';
import {
  STATUSES, statusInfo, PHASES, phaseInfo, addPhoto, sitePhotos, siteReports,
  activeSites, yen, todayStr, fmtDate, fmtDateTime,
} from '../model.js';
import { navigate } from '../app.js';
import { openCaseForm } from './admin.js';
import { markInvoiced, markPaid } from '../money.js';
import { openEstimateDoc, openInvoiceDoc } from '../doc.js';

// ---------- 現場詳細 ----------
export function renderSite(siteId) {
  const s = store.get('sites', siteId);
  if (!s) return h('div', { class: 'empty', text: '現場が見つかりません' });
  const si = statusInfo(s.status);
  const isAdmin = localStorage.getItem('nurilog.role') === 'admin';

  const photos = sitePhotos(s.id);
  const reports = siteReports(s.id);

  const photoSection = h('div', {}, [
    h('div', { class: 'card-row' }, [
      h('div', { class: 'section-title mt-0', text: `現場写真（${photos.length}）` }),
      h('button', { class: 'btn ghost sm', text: '＋ 写真', onclick: () => navigate('photo/' + s.id) }),
    ]),
    photos.length === 0
      ? h('div', { class: 'empty', text: 'まだ写真がありません' })
      : photosByPhase(s.id, () => navigate('site/' + s.id)),
  ]);

  const reportSection = h('div', {}, [
    h('div', { class: 'card-row' }, [
      h('div', { class: 'section-title', text: `日報（${reports.length}）` }),
      h('button', { class: 'btn ghost sm', text: '＋ 日報', onclick: () => navigate('report/' + s.id) }),
    ]),
    reports.length === 0
      ? h('div', { class: 'empty', text: 'まだ日報がありません' })
      : h('div', {}, reports.map(reportCard)),
  ]);

  // 案件情報（管理者はステータス変更可）
  const infoRows = [
    ['顧客', s.customer], ['連絡先', s.phone], ['住所', s.address],
    ['担当', s.manager], ['問合せ経路', s.channel],
    ['問合せ日', fmtDate(s.inquiryDate)], ['現調', fmtDate(s.surveyDate)],
    ['見積提出', fmtDate(s.estimateDate)], ['見積金額', s.estimateAmount ? yen(s.estimateAmount) : '—'],
    ['着工予定', fmtDate(s.constructionStart)], ['次回連絡', fmtDate(s.nextContact)],
  ];
  const infoCard = h('div', { class: 'card' }, infoRows.map(([k, v]) =>
    h('div', { class: 'kv' }, [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v || '—' })])));

  const statusControl = isAdmin
    ? h('div', { class: 'field' }, [
        h('label', { text: 'ステータス' }),
        statusSelect(s.status, (val) => { store.update('sites', s.id, { status: val }); toast('ステータスを更新'); navigate('site/' + s.id); }),
      ])
    : h('span', { class: 'pill ' + si.cls, text: si.label });

  // 連絡導線（電話発信・地図）。職人も使うので役割を問わず表示。
  const contactRow = (s.phone || s.address)
    ? h('div', { class: 'btn-row' }, [
        s.phone ? h('a', { class: 'btn secondary', href: 'tel:' + s.phone, text: '📞 電話する' }) : null,
        s.address ? h('a', {
          class: 'btn secondary', target: '_blank', rel: 'noopener',
          href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.address),
          text: '🗺 地図を開く',
        }) : null,
      ])
    : null;

  // お金まわりのワンタップ操作（管理者のみ）。完工→請求→入金を現場画面からも記録できる。
  const moneyActions = isAdmin ? moneyActionBlock(s) : null;

  const estimateBtn = isAdmin
    ? h('button', { class: 'btn secondary', text: '🧮 この現場の見積を作る', onclick: () => navigate('estimate/' + s.id) })
    : null;

  // 書類PDF（管理者）。見積はこの現場の最新見積、無ければ見積金額の一式から生成。
  const docButtons = isAdmin ? documentBlock(s) : null;

  // 管理者向け: 案件の編集・削除
  const adminActions = isAdmin
    ? h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn ghost', text: '✏️ 案件を編集', onclick: () => openCaseForm(s, () => navigate('site/' + s.id)) }),
        h('button', {
          class: 'btn danger', text: '🗑 削除',
          onclick: () => {
            if (!confirm(`「${s.name}」を削除しますか？\nこの操作は元に戻せません。`)) return;
            store.remove('sites', s.id);
            toast('案件を削除しました');
            navigate('cases');
          },
        }),
      ])
    : null;

  return h('div', {}, [
    h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
    h('h1', { class: 'page-title', text: s.name }),
    statusControl,
    contactRow,
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn', text: '📷 写真を追加', onclick: () => navigate('photo/' + s.id) }),
      h('button', { class: 'btn secondary', text: '📝 日報', onclick: () => navigate('report/' + s.id) }),
    ]),
    moneyActions,
    photoSection,
    reportSection,
    h('div', { class: 'section-title', text: '案件情報' }),
    infoCard,
    estimateBtn,
    docButtons,
    adminActions,
  ]);
}

// 見積書・請求書のPDF出力ボタン群。状況に応じて出せる書類だけ表示する。
function documentBlock(s) {
  const latestEst = store.all('estimates')
    .filter((e) => e.siteId === s.id)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  const canEstimate = !!(latestEst || s.estimateAmount);
  const canInvoice = !!(s.contractAmount || s.estimateAmount) && ['done', 'billed', 'paid'].includes(s.status);
  if (!canEstimate && !canInvoice) return null;
  return h('div', {}, [
    h('div', { class: 'section-title', text: '書類（PDF）' }),
    h('div', { class: 'btn-row' }, [
      canEstimate ? h('button', { class: 'btn secondary', text: '📄 見積書', onclick: () => openEstimateDoc(s, latestEst) }) : null,
      canInvoice ? h('button', { class: 'btn secondary', text: '📄 請求書', onclick: () => openInvoiceDoc(s) }) : null,
    ]),
  ]);
}

// 完工→請求→入金の進み具合に応じたワンタップ操作カード。
function moneyActionBlock(s) {
  const refresh = () => navigate('site/' + s.id);
  if (s.status === 'done') {
    return h('div', { class: 'card alert-money' }, [
      h('div', { class: 'alert-title', text: '🧾 まだ請求していません' }),
      h('div', { class: 'alert-detail', text: '完工済みです。請求書を作ってお金を回収しましょう。' }),
      h('button', { class: 'btn sm', style: 'margin-top:8px', text: '請求書を作った', onclick: () => markInvoiced(s, refresh) }),
    ]);
  }
  if (s.status === 'billed') {
    const overdue = s.paymentDueDate && s.paymentDueDate < todayStr();
    return h('div', { class: 'card ' + (overdue ? 'alert-money' : '') }, [
      h('div', { class: 'alert-title', text: overdue ? '⏰ 入金予定日を過ぎています' : '💰 入金待ち' }),
      h('div', { class: 'alert-detail', text: s.paymentDueDate ? `入金予定日: ${s.paymentDueDate}` : '入金予定日が未設定です' }),
      h('button', { class: 'btn sm', style: 'margin-top:8px', text: '入金を確認した', onclick: () => markPaid(s, refresh) }),
    ]);
  }
  if (s.status === 'paid') {
    return h('div', { class: 'warn-box ok', text: `✅ 入金済み${s.paymentDate ? '（' + s.paymentDate + '）' : ''}` });
  }
  return null;
}

function statusSelect(current, onchange) {
  const sel = h('select', { onchange: (e) => onchange(e.target.value) },
    STATUSES.map((st) => h('option', { value: st.key, selected: st.key === current ? 'selected' : null, text: st.label })));
  return sel;
}

function photosByPhase(siteId, refresh) {
  const wrap = h('div', {});
  for (const ph of PHASES) {
    const list = sitePhotos(siteId).filter((p) => p.phase === ph.key);
    if (list.length === 0) continue;
    wrap.append(h('div', { class: 'section-title', text: ph.label }));
    wrap.append(h('div', { class: 'photo-grid' }, list.map((p) =>
      photoThumb(p, {
        onOpen: openPhoto,
        onDelete: async (photo) => {
          if (!confirm('この写真を削除しますか？')) return;
          await deleteBlob(photo.id); revokeURL(photo.id); store.remove('photos', photo.id);
          toast('削除しました'); refresh();
        },
      }))));
  }
  return wrap;
}

function reportCard(r) {
  return h('div', { class: 'card tap', onclick: () => openReport(r) }, [
    h('div', { class: 'card-row' }, [
      h('h3', { text: `${fmtDate(r.date)} の日報` }),
      h('span', { class: 'sub', text: r.worker || '' }),
    ]),
    h('div', { class: 'sub', text: (r.workContent || '作業内容なし').slice(0, 60) }),
    r.problems ? h('div', { class: 'sub', html: '⚠️ ' + r.problems.slice(0, 50) }) : null,
  ]);
}

function openReport(r) {
  const site = store.get('sites', r.siteId);
  const body = h('div', {}, [
    kv('現場', site ? site.name : '—'),
    kv('日付', fmtDate(r.date)), kv('作業者', r.worker || '—'),
    kv('作業時間', r.hours ? r.hours + ' 時間' : '—'),
    h('div', { class: 'section-title', text: '作業内容' }),
    h('div', { text: r.workContent || '—' }),
    r.materials ? h('div', { class: 'section-title', text: '使用材料' }) : null,
    r.materials ? h('div', { text: r.materials }) : null,
    r.problems ? h('div', { class: 'section-title', text: '問題・追加工事' }) : null,
    r.problems ? h('div', { class: 'warn-box bad', text: r.problems }) : null,
    h('div', { class: 'sub', text: '提出: ' + fmtDateTime(r.createdAt) }),
  ]);
  openModal('日報の詳細', body);
}

function kv(k, v) {
  return h('div', { class: 'kv' }, [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v })]);
}

// ---------- 写真撮影 ----------
export function renderPhotoCapture(siteId) {
  const sites = pickSites();
  if (!siteId && sites.length === 0) {
    return h('div', { class: 'empty', text: '対象の現場がありません。管理者に案件登録を依頼してください。' });
  }
  if (!siteId) {
    // 現場選択
    return h('div', {}, [
      h('h1', { class: 'page-title', text: '写真を撮る現場を選ぶ' }),
      h('div', {}, sites.map((s) =>
        h('div', { class: 'card tap', onclick: () => navigate('photo/' + s.id) }, [
          h('h3', { text: s.name }),
          h('div', { class: 'sub', text: s.address || '' }),
        ]))),
    ]);
  }

  const s = store.get('sites', siteId);
  if (!s) return h('div', { class: 'empty', text: '現場が見つかりません' });

  let phase = 'before';
  const phaseBtns = h('div', { class: 'role-switch', style: 'width:100%' },
    PHASES.map((p) => h('button', {
      class: p.key === phase ? 'active' : '',
      text: p.label,
      onclick: (e) => {
        phase = p.key;
        phaseBtns.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
      },
    })));

  const commentInput = h('input', { type: 'text', placeholder: '一言コメント（任意）' });
  const grid = h('div', { class: 'photo-grid' });
  const renderGrid = () => {
    clear(grid);
    sitePhotos(s.id).forEach((p) => grid.append(photoThumb(p, {
      onOpen: openPhoto,
      onDelete: async (photo) => {
        await deleteBlob(photo.id); revokeURL(photo.id); store.remove('photos', photo.id);
        toast('削除'); renderGrid();
      },
    })));
  };
  renderGrid();

  const fileInput = h('input', {
    type: 'file', accept: 'image/*', capture: 'environment', multiple: 'multiple',
    style: 'display:none',
    onchange: async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      toast('保存中…');
      for (const f of files) {
        await addPhoto({ siteId: s.id, phase, comment: commentInput.value.trim(), file: f });
      }
      commentInput.value = '';
      toast(`${files.length}枚を保存しました`);
      renderGrid();
      e.target.value = '';
    },
  });

  return h('div', {}, [
    h('button', { class: 'btn ghost sm', text: '← 現場を変える', onclick: () => navigate('photo') }),
    h('h1', { class: 'page-title', text: s.name }),
    h('div', { class: 'field' }, [h('label', { text: '工程' }), phaseBtns]),
    h('div', { class: 'field' }, [h('label', { text: 'コメント' }), commentInput]),
    fileInput,
    h('button', { class: 'btn', text: '📷 撮影 / 写真を選ぶ', onclick: () => fileInput.click() }),
    h('div', { class: 'section-title', text: `この現場の写真（${sitePhotos(s.id).length}）` }),
    grid,
  ]);
}

// ---------- 日報フォーム ----------
export function renderReportForm(arg) {
  const issueFocus = arg === '_issue';
  const presetSite = arg && arg !== '_issue' ? arg : null;
  const sites = pickSites();
  if (sites.length === 0) {
    return h('div', { class: 'empty', text: '対象の現場がありません。管理者に案件登録を依頼してください。' });
  }

  const siteSel = h('select', {},
    sites.map((s) => h('option', { value: s.id, selected: s.id === presetSite ? 'selected' : null, text: s.name })));
  const dateInput = h('input', { type: 'date', value: todayStr() });
  const workerInput = h('input', { type: 'text', placeholder: '氏名', value: localStorage.getItem('nurilog.worker') || '' });
  const contentInput = h('textarea', { placeholder: '例）外壁 下塗り（シーラー）2面 完了' });
  const materialInput = h('textarea', { placeholder: '例）シーラー 1缶 / マスキング 3巻', style: 'min-height:60px' });
  const hoursInput = h('input', { type: 'number', step: '0.5', min: '0', placeholder: '例）7.5' });
  const problemInput = h('textarea', { placeholder: '例）破風板に腐食あり。追加で板金補修が必要（写真添付済）' });

  // 添付写真（送信時に日報へ紐付け）
  const pending = []; // {file, phase}
  const pendingGrid = h('div', { class: 'photo-grid' });
  const renderPending = () => {
    clear(pendingGrid);
    pending.forEach((item, i) => {
      const img = h('img', { alt: '' });
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result; };
      reader.readAsDataURL(item.file);
      pendingGrid.append(h('div', { class: 'photo-thumb' }, [
        img,
        h('span', { class: `phase-tag ${phaseInfo(item.phase).cls}`, text: phaseInfo(item.phase).label }),
        h('button', { class: 'del', text: '×', onclick: () => { pending.splice(i, 1); renderPending(); } }),
      ]));
    });
  };
  const attachInput = h('input', {
    type: 'file', accept: 'image/*', capture: 'environment', multiple: 'multiple', style: 'display:none',
    onchange: (e) => { [...e.target.files].forEach((file) => pending.push({ file, phase: 'during' })); renderPending(); e.target.value = ''; },
  });

  const submit = async () => {
    const siteId = siteSel.value;
    if (!contentInput.value.trim() && !problemInput.value.trim()) {
      toast('作業内容か問題のどちらかを入力してください');
      return;
    }
    localStorage.setItem('nurilog.worker', workerInput.value.trim());
    const report = store.insert('reports', {
      siteId,
      date: dateInput.value,
      worker: workerInput.value.trim(),
      workContent: contentInput.value.trim(),
      materials: materialInput.value.trim(),
      hours: hoursInput.value ? parseFloat(hoursInput.value) : null,
      problems: problemInput.value.trim(),
    });
    for (const item of pending) {
      await addPhoto({ siteId, reportId: report.id, phase: item.phase, comment: '', file: item.file });
    }
    toast('日報を送信しました');
    navigate('site/' + siteId);
  };

  const problemField = h('div', { class: 'field' }, [
    h('label', { text: '⚠️ 問題・追加工事の報告' }),
    problemInput,
    h('div', { class: 'hint', text: '口頭依頼のトラブル防止のため、追加工事は写真とともに残しましょう' }),
  ]);
  if (issueFocus) problemInput.setAttribute('autofocus', 'true');

  const fields = [
    h('div', { class: 'field' }, [h('label', { text: '現場' }), siteSel]),
    h('div', { class: 'grid-2' }, [
      h('div', { class: 'field' }, [h('label', { text: '日付' }), dateInput]),
      h('div', { class: 'field' }, [h('label', { text: '作業時間（h）' }), hoursInput]),
    ]),
    h('div', { class: 'field' }, [h('label', { text: '作業者' }), workerInput]),
    h('div', { class: 'field' }, [h('label', { text: '作業内容' }), contentInput]),
    h('div', { class: 'field' }, [h('label', { text: '使用材料' }), materialInput]),
    problemField,
    h('div', { class: 'field' }, [
      h('label', { text: '写真を添付' }),
      attachInput,
      h('button', { class: 'btn secondary', text: '📷 写真を選ぶ', onclick: () => attachInput.click() }),
      pendingGrid,
    ]),
    h('button', { class: 'btn', text: '日報を送信', onclick: submit }),
  ];

  return h('div', {}, [
    h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
    h('h1', { class: 'page-title', text: issueFocus ? '問題・追加工事の報告' : '日報を書く' }),
    ...fields,
  ]);
}

// 日報・写真の対象にできる現場（稼働中を優先、なければ全件）
function pickSites() {
  const active = activeSites();
  return active.length ? active : store.all('sites');
}
