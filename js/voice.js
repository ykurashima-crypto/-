// 音声入力（無料・ブラウザのWeb Speech API）。
// 対応ブラウザ（Chrome/Edge/Safari等）では話して入力でき、未対応では手入力にフォールバックする。
// ※ きれいな項目分解（顧客名/作業/明日の予定 など）の高精度抽出はLLM(有料API)が必要。
//    本モジュールは無料でできる範囲＝音声→テキスト＋電話番号/日付の簡易抽出を担う。
import { h, toast } from './ui.js';

export function voiceSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// 連続ディクテーション。onFinal は確定した区切りごと、onInterim は認識途中。
export function dictate({ onInterim, onFinal, onEnd, onError, lang = 'ja-JP' }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onError && onError('unsupported'); return null; }
  const rec = new SR();
  rec.lang = lang; rec.interimResults = true; rec.continuous = true;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) onFinal && onFinal(r[0].transcript);
      else interim += r[0].transcript;
    }
    onInterim && onInterim(interim);
  };
  rec.onerror = (e) => onError && onError(e.error || 'error');
  rec.onend = () => onEnd && onEnd();
  try { rec.start(); } catch { /* すでに開始済みなど */ }
  return { stop: () => { try { rec.stop(); } catch {} } };
}

// テキスト入力欄に付けるマイクボタン。録音中は入力欄へ逐次反映。
// onCommit(value) は確定区切りごとに最新の全文を渡す（電話/日付の自動抽出などに使う）。
export function micButton(target, onCommit) {
  if (!voiceSupported()) {
    return h('button', {
      class: 'btn ghost sm', disabled: 'disabled', text: '🎤 非対応',
      title: 'このブラウザは音声入力に未対応です。手で入力してください',
    });
  }
  let session = null;
  let committed = '';
  const btn = h('button', { class: 'btn secondary sm mic-btn', type: 'button', text: '🎤 話す' });
  const stop = () => { if (session) session.stop(); };
  btn.addEventListener('click', () => {
    if (session) { stop(); return; }
    committed = target.value ? target.value.replace(/\s*$/, '') + ' ' : '';
    btn.classList.add('rec'); btn.textContent = '● 録音中（タップで停止）';
    session = dictate({
      onInterim: (t) => { target.value = committed + t; },
      onFinal: (seg) => { committed += seg; target.value = committed; onCommit && onCommit(committed); },
      onError: (err) => { if (err !== 'no-speech') toast('音声入力エラー: ' + err); },
      onEnd: () => { btn.classList.remove('rec'); btn.textContent = '🎤 話す'; session = null; },
    });
  });
  return btn;
}

// ── 無料の簡易抽出（正規表現ベース）────────────────
export function parsePhone(text) {
  const m = (text || '').replace(/[ー－]/g, '-').match(/0\d{1,4}-?\d{1,4}-?\d{3,4}/);
  return m ? m[0] : '';
}

// 「今日/明日/明後日/M月D日/D日」をざっくり日付(yyyy-mm-dd)へ。
export function parseDate(text, now = new Date()) {
  const t = text || '';
  const iso = (d) => d.toISOString().slice(0, 10);
  const add = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return iso(d); };
  if (/今日/.test(t)) return add(0);
  if (/明後日|あさって/.test(t)) return add(2);
  if (/明日|あした/.test(t)) return add(1);
  let m = t.match(/(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const y = now.getFullYear();
    let d = new Date(y, +m[1] - 1, +m[2]);
    if (d < new Date(iso(now))) d = new Date(y + 1, +m[1] - 1, +m[2]);
    return iso(d);
  }
  m = t.match(/(\d{1,2})日/);
  if (m) {
    const day = +m[1];
    let d = new Date(now.getFullYear(), now.getMonth(), day);
    if (d < new Date(iso(now))) d = new Date(now.getFullYear(), now.getMonth() + 1, day);
    return iso(d);
  }
  return '';
}
