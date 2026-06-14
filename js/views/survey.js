// 現地調査: 現場でスマホから建物情報・劣化状態を選択式で記録する。
// 入力負担を減らすため選択式中心。劣化と面積は見積へ引き継げる。
import { store } from '../db.js';
import { h, toast } from '../ui.js';
import { todayStr, fmtDate } from '../model.js';
import { navigate } from '../app.js';

// 劣化状態（複数選択）
export const DETERIORATION = [
  'チョーキング', 'クラック', '塗膜剥離', '色あせ', 'コーキング劣化',
  'カビ', '苔', '鉄部さび', '木部劣化', '雨漏り',
];
const BUILDING_TYPES = ['戸建て', 'アパート・マンション', '店舗・ビル', '工場・倉庫', 'その他'];
const WALL_MATERIALS = ['モルタル', 'サイディング', 'ALC', 'タイル', 'コンクリート', 'その他'];
const ROOF_MATERIALS = ['スレート', 'ガルバリウム', '瓦', 'トタン', '陸屋根', 'その他'];

// 現場の最新調査を取得（見積などからの参照用）
export function latestSurvey(siteId) {
  return store.all('surveys').filter((s) => s.siteId === siteId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}

export function renderSurvey(siteId) {
  const site = store.get('sites', siteId);
  if (!site) return h('div', { class: 'empty', text: '現場が見つかりません' });
  const existing = latestSurvey(siteId);

  const selected = new Set(existing?.deterioration || []);
  const chipBar = h('div', { class: 'chip-wrap' }, DETERIORATION.map((d) => {
    const btn = h('button', {
      class: 'chip' + (selected.has(d) ? ' on' : ''), text: d,
      onclick: () => {
        if (selected.has(d)) { selected.delete(d); btn.classList.remove('on'); }
        else { selected.add(d); btn.classList.add('on'); }
      },
    });
    return btn;
  }));

  const sel = (options, current) => h('select', {},
    [h('option', { value: '', text: '（未選択）' }),
     ...options.map((o) => h('option', { value: o, selected: o === current ? 'selected' : null, text: o }))]);

  const buildingType = sel(BUILDING_TYPES, existing?.buildingType);
  const wallMaterial = sel(WALL_MATERIALS, existing?.wallMaterial);
  const roofMaterial = sel(ROOF_MATERIALS, existing?.roofMaterial);
  const buildingAge = h('input', { type: 'number', min: '0', placeholder: '例）15', value: existing?.buildingAge ?? '' });
  const floors = h('input', { type: 'number', min: '0', placeholder: '例）2', value: existing?.floors ?? '' });
  const paintingArea = h('input', { type: 'number', min: '0', placeholder: '例）180', value: existing?.paintingArea ?? '' });
  const parking = h('input', { type: 'text', placeholder: '例）前面道路に駐車可・1台', value: existing?.parking || '' });
  const memo = h('textarea', { placeholder: '気づいた点を話して入力（音声入力が便利です）。例）北面の苔が広範囲。雨樋に割れあり' }, existing?.memo || '');

  // 足場：要 / 不要 のトグル
  let scaffolding = existing?.scaffolding ?? null;
  const scfBtns = h('div', { class: 'role-switch', style: 'width:100%' }, [
    h('button', { class: scaffolding === true ? 'active' : '', text: '足場 要', onclick: (e) => { scaffolding = true; toggle(e); } }),
    h('button', { class: scaffolding === false ? 'active' : '', text: '足場 不要', onclick: (e) => { scaffolding = false; toggle(e); } }),
  ]);
  function toggle(e) { scfBtns.querySelectorAll('button').forEach((b) => b.classList.remove('active')); e.target.classList.add('active'); }

  const save = (thenEstimate = false) => {
    const data = {
      siteId,
      buildingType: buildingType.value, wallMaterial: wallMaterial.value, roofMaterial: roofMaterial.value,
      buildingAge: buildingAge.value ? parseInt(buildingAge.value, 10) : null,
      floors: floors.value ? parseInt(floors.value, 10) : null,
      paintingArea: paintingArea.value ? parseFloat(paintingArea.value) : null,
      scaffolding, parking: parking.value.trim(),
      deterioration: [...selected], memo: memo.value.trim(),
      surveyedBy: localStorage.getItem('nurilog.worker') || '',
      surveyedAt: Date.now(),
    };
    if (existing) store.update('surveys', existing.id, data);
    else store.insert('surveys', data);
    // 案件側: 現調日を記録し、未着手なら見積作成中へ進める
    const patch = { surveyDate: site.surveyDate || todayStr() };
    if (site.status === 'lead' || site.status === 'survey') patch.status = 'quote';
    store.update('sites', siteId, patch);
    toast('現地調査を保存しました');
    if (thenEstimate) navigate('estimate/' + siteId);
    else navigate('site/' + siteId);
  };

  return h('div', {}, [
    h('button', { class: 'btn ghost sm', text: '← 戻る', onclick: () => history.back() }),
    h('h1', { class: 'page-title', text: '現地調査' }),
    h('p', { class: 'sub mt-0', text: `${site.name}${site.address ? '／' + site.address : ''}` }),

    h('div', { class: 'section-title mt-0', text: '建物情報' }),
    h('div', { class: 'grid-2' }, [
      h('div', { class: 'field' }, [h('label', { text: '建物種別' }), buildingType]),
      h('div', { class: 'field' }, [h('label', { text: '築年数' }), buildingAge]),
    ]),
    h('div', { class: 'grid-2' }, [
      h('div', { class: 'field' }, [h('label', { text: '階数' }), floors]),
      h('div', { class: 'field' }, [h('label', { text: '塗装面積（㎡）' }), paintingArea]),
    ]),
    h('div', { class: 'grid-2' }, [
      h('div', { class: 'field' }, [h('label', { text: '外壁材' }), wallMaterial]),
      h('div', { class: 'field' }, [h('label', { text: '屋根材' }), roofMaterial]),
    ]),
    h('div', { class: 'field' }, [h('label', { text: '足場' }), scfBtns]),
    h('div', { class: 'field' }, [h('label', { text: '駐車スペース' }), parking]),

    h('div', { class: 'section-title', text: '劣化状態（当てはまるものをタップ）' }),
    chipBar,

    h('div', { class: 'field', style: 'margin-top:14px' }, [h('label', { text: 'メモ' }), memo]),

    h('button', { class: 'btn secondary', text: '📷 調査写真を撮る', onclick: () => navigate('photo/' + siteId) }),
    h('button', { class: 'btn', text: '保存する', onclick: () => save(false) }),
    h('button', { class: 'btn ghost', text: '保存して見積を作る →', onclick: () => save(true) }),
  ]);
}

// 調査内容の要約（案件詳細などで表示）
export function surveySummary(srv) {
  if (!srv) return null;
  const parts = [];
  if (srv.buildingType) parts.push(srv.buildingType);
  if (srv.buildingAge != null) parts.push(`築${srv.buildingAge}年`);
  if (srv.paintingArea != null) parts.push(`${srv.paintingArea}㎡`);
  if (srv.scaffolding === true) parts.push('足場要');
  return {
    head: parts.join('・') || '記録あり',
    deterioration: srv.deterioration || [],
    date: srv.surveyedAt ? fmtDate(new Date(srv.surveyedAt).toISOString().slice(0, 10)) : '',
  };
}
