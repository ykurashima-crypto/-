// ログイン画面（本番/クラウドモードのみ表示）。
import { h, toast } from '../ui.js';
import { signIn } from '../cloud.js';

export function renderLogin(onSuccess) {
  const email = h('input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'username' });
  const pw = h('input', { type: 'password', placeholder: 'パスワード', autocomplete: 'current-password' });
  const btn = h('button', { class: 'btn', text: 'ログイン' });

  const submit = async () => {
    if (!email.value.trim() || !pw.value) { toast('メールとパスワードを入力してください'); return; }
    btn.disabled = true; btn.textContent = 'ログイン中…';
    try {
      await signIn(email.value.trim(), pw.value);
      toast('ログインしました');
      onSuccess && onSuccess();
    } catch (e) {
      toast('ログインに失敗しました: ' + (e.message || e));
      btn.disabled = false; btn.textContent = 'ログイン';
    }
  };
  btn.addEventListener('click', submit);
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  return h('div', { style: 'max-width:420px;margin:6vh auto 0;' }, [
    h('div', { style: 'text-align:center;margin-bottom:18px;' }, [
      h('img', { src: 'icons/icon.svg', alt: '', style: 'width:56px;height:56px;' }),
      h('h1', { class: 'page-title', text: 'ぬりログ ログイン', style: 'margin-top:8px;' }),
      h('p', { class: 'sub', text: '会社から発行されたアカウントでログインしてください' }),
    ]),
    h('div', { class: 'card' }, [
      h('div', { class: 'field' }, [h('label', { text: 'メールアドレス' }), email]),
      h('div', { class: 'field' }, [h('label', { text: 'パスワード' }), pw]),
      btn,
    ]),
    h('p', { class: 'sub', style: 'text-align:center;margin-top:14px;', text: 'アカウントの発行・パスワード再設定は管理者へご依頼ください' }),
  ]);
}
