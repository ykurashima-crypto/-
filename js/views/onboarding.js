// 初回セットアップ（デモ/端末内保存モード）。
// ITが苦手な親方でも、説明書なしで「屋号・連絡先・振込先」を1画面で登録して使い始められる。
import { h, toast } from '../ui.js';
import { setCompany, setOnboarded } from '../company.js';
import { createMyCompany, joinCompany, signOut } from '../cloud.js';

export function renderOnboarding(onDone) {
  let plan = 'individual';
  const planBtns = h('div', { class: 'plan-pick' }, [
    planCard('individual', '👷 個人プラン', '一人親方・家族経営向け。案件・写真・見積・請求を忘れずに'),
    planCard('corporate', '🏢 法人プラン', '複数の職人・現場を共有。担当・工程・原価を見える化'),
  ]);
  function planCard(key, title, desc) {
    const card = h('button', {
      class: 'plan-card' + (key === plan ? ' on' : ''), 'data-plan': key,
      onclick: () => { plan = key; planBtns.querySelectorAll('.plan-card').forEach((c) => c.classList.toggle('on', c.dataset.plan === key)); },
    }, [h('div', { class: 'pt', text: title }), h('div', { class: 'pd', text: desc })]);
    return card;
  }

  const name = h('input', { type: 'text', placeholder: '例）伊藤塗装' });
  const phone = h('input', { type: 'tel', placeholder: '090-1234-5678' });
  const address = h('input', { type: 'text', placeholder: '市区町村〜番地' });
  const bank = h('textarea', { placeholder: '例）〇〇銀行 △△支店 普通 1234567 ｲﾄｳﾄｿｳ', style: 'min-height:56px' });

  const start = () => {
    if (!name.value.trim()) { toast('屋号（会社名）を入力してください'); return; }
    setCompany({
      name: name.value.trim(), phone: phone.value.trim(), address: address.value.trim(),
      bank: bank.value.trim(), planType: plan,
    });
    setOnboarded();
    toast('準備ができました！');
    onDone && onDone();
  };

  return h('div', { class: 'onboard' }, [
    h('div', { style: 'text-align:center;margin-bottom:8px' }, [
      h('img', { src: 'icons/icon.svg', alt: '', style: 'width:56px;height:56px' }),
      h('h1', { class: 'page-title', text: 'ぬりログへようこそ', style: 'margin-top:8px' }),
      h('p', { class: 'sub', text: '最初に少しだけ設定します（あとから変更できます）' }),
    ]),
    h('div', { class: 'section-title mt-0', text: '使い方を選ぶ' }),
    planBtns,
    h('div', { class: 'card', style: 'margin-top:14px' }, [
      h('div', { class: 'field' }, [h('label', { text: '屋号 / 会社名（必須）' }), name]),
      h('div', { class: 'field' }, [h('label', { text: '電話番号' }), phone]),
      h('div', { class: 'field' }, [h('label', { text: '住所' }), address]),
      h('div', { class: 'field' }, [h('label', { text: '振込先（請求書に表示されます）' }), bank]),
      h('button', { class: 'btn', text: 'この内容で始める', onclick: start }),
      h('button', { class: 'btn ghost', text: 'あとで設定する', onclick: () => { setOnboarded(); onDone && onDone(); } }),
    ]),
    h('p', { class: 'sub', style: 'text-align:center', text: 'データはこの端末に保存されます。チームで共有する場合は「共有」タブから設定できます。' }),
  ]);
}

// クラウド（本番）モードのオンボーディング: ログイン済みだが会社未所属のとき。
// 「新しく会社を作る」か「招待コードで参加」を選ぶ。
export function renderCloudOnboarding(onDone) {
  let plan = 'individual';
  const name = h('input', { type: 'text', placeholder: '例）伊藤塗装' });
  const planBtns = h('div', { class: 'role-switch', style: 'width:100%' }, [
    h('button', { class: 'active', 'data-plan': 'individual', text: '👷 個人プラン', onclick: (e) => pick('individual', e) }),
    h('button', { 'data-plan': 'corporate', text: '🏢 法人プラン', onclick: (e) => pick('corporate', e) }),
  ]);
  function pick(p, e) { plan = p; planBtns.querySelectorAll('button').forEach((b) => b.classList.remove('active')); e.target.classList.add('active'); }

  const createBtn = h('button', {
    class: 'btn', text: 'この内容で会社を作る',
    onclick: async () => {
      if (!name.value.trim()) { toast('屋号（会社名）を入力してください'); return; }
      createBtn.disabled = true; createBtn.textContent = '作成中…';
      try {
        await createMyCompany(name.value.trim(), plan);
        setCompany({ name: name.value.trim(), planType: plan });
        toast('会社を作成しました');
        onDone && onDone();
      } catch (e) { toast('作成に失敗: ' + (e.message || e)); createBtn.disabled = false; createBtn.textContent = 'この内容で会社を作る'; }
    },
  });

  const code = h('input', { type: 'text', placeholder: '招待コード（管理者から受け取る）' });
  const joinBtn = h('button', {
    class: 'btn secondary', text: '招待コードで参加',
    onclick: async () => {
      if (!code.value.trim()) { toast('招待コードを入力してください'); return; }
      joinBtn.disabled = true; joinBtn.textContent = '参加中…';
      try { await joinCompany(code.value.trim()); toast('会社に参加しました'); onDone && onDone(); }
      catch (e) { toast('参加に失敗: ' + (e.message || e)); joinBtn.disabled = false; joinBtn.textContent = '招待コードで参加'; }
    },
  });

  return h('div', { class: 'onboard' }, [
    h('h1', { class: 'page-title', text: 'はじめの設定' }),
    h('p', { class: 'sub mt-0', text: 'まだ会社に所属していません。会社を新しく作るか、招待コードで参加してください。' }),
    h('div', { class: 'section-title', text: '新しく会社を作る' }),
    h('div', { class: 'card' }, [
      h('div', { class: 'field' }, [h('label', { text: '使い方' }), planBtns]),
      h('div', { class: 'field' }, [h('label', { text: '屋号 / 会社名' }), name]),
      createBtn,
    ]),
    h('div', { class: 'section-title', text: 'または 招待で参加する' }),
    h('div', { class: 'card' }, [
      h('div', { class: 'field' }, [h('label', { text: '招待コード' }), code]),
      joinBtn,
    ]),
    h('button', { class: 'btn ghost', text: 'ログアウト', onclick: async () => { await signOut(); onDone && onDone(); } }),
  ]);
}
