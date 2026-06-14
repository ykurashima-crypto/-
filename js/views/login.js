// ログイン / 新規登録 / パスワード再設定（本番・クラウドモードのみ表示）。
import { h, toast } from '../ui.js';
import { signIn, signUp, resetPassword } from '../cloud.js';

export function renderLogin(onSuccess) {
  let mode = 'login'; // 'login' | 'register'
  const wrap = h('div', { style: 'max-width:420px;margin:5vh auto 0;' });

  const render = () => {
    const email = h('input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'username' });
    const pw = h('input', { type: 'password', placeholder: 'パスワード（6文字以上）', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
    const name = h('input', { type: 'text', placeholder: 'お名前（屋号でも可）' });
    const btn = h('button', { class: 'btn', text: mode === 'login' ? 'ログイン' : '新規登録する' });

    const submit = async () => {
      if (!email.value.trim() || !pw.value) { toast('メールとパスワードを入力してください'); return; }
      btn.disabled = true; btn.textContent = '処理中…';
      try {
        if (mode === 'login') {
          await signIn(email.value.trim(), pw.value);
          toast('ログインしました');
          onSuccess && onSuccess();
        } else {
          const { needsConfirm } = await signUp(email.value.trim(), pw.value, name.value.trim());
          if (needsConfirm) {
            toast('確認メールを送信しました。メール内のリンクを開いてください');
            mode = 'login'; render();
          } else {
            toast('登録しました');
            onSuccess && onSuccess();
          }
        }
      } catch (e) {
        toast((mode === 'login' ? 'ログイン' : '登録') + 'に失敗: ' + (e.message || e));
        btn.disabled = false; btn.textContent = mode === 'login' ? 'ログイン' : '新規登録する';
      }
    };
    btn.addEventListener('click', submit);
    pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

    const doReset = async () => {
      if (!email.value.trim()) { toast('メールアドレスを入力してから押してください'); return; }
      try { await resetPassword(email.value.trim()); toast('パスワード再設定メールを送信しました'); }
      catch (e) { toast('送信に失敗: ' + (e.message || e)); }
    };

    const toggle = h('div', { class: 'role-switch', style: 'width:100%;margin-bottom:14px' }, [
      h('button', { class: mode === 'login' ? 'active' : '', text: 'ログイン', onclick: () => { mode = 'login'; render(); } }),
      h('button', { class: mode === 'register' ? 'active' : '', text: '新規登録', onclick: () => { mode = 'register'; render(); } }),
    ]);

    wrap.replaceChildren(
      h('div', { style: 'text-align:center;margin-bottom:18px;' }, [
        h('img', { src: 'icons/icon.svg', alt: '', style: 'width:56px;height:56px;' }),
        h('h1', { class: 'page-title', text: 'ぬりログ', style: 'margin-top:8px;' }),
        h('p', { class: 'sub', text: mode === 'login' ? 'アカウントでログイン' : 'メールアドレスで新規登録' }),
      ]),
      toggle,
      h('div', { class: 'card' }, [
        mode === 'register' ? h('div', { class: 'field' }, [h('label', { text: 'お名前' }), name]) : null,
        h('div', { class: 'field' }, [h('label', { text: 'メールアドレス' }), email]),
        h('div', { class: 'field' }, [h('label', { text: 'パスワード' }), pw]),
        btn,
        mode === 'login' ? h('button', { class: 'btn ghost sm', style: 'margin-top:10px', text: 'パスワードを忘れた', onclick: doReset }) : null,
      ]),
    );
  };

  render();
  return wrap;
}
