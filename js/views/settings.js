// 共有設定: サーバーURLとチームコードで参加し、複数人・複数端末でデータを同期する。
import { h, toast } from '../ui.js';
import { store } from '../db.js';
import {
  getConfig, setConfig, isEnabled, syncNow, ping, syncState,
  onSyncEvent, resetCursorsForFullSync,
} from '../sync.js';
import { cloudEnabled, cloudState, signOut, cloudSync } from '../cloud.js';

export function renderSettings() {
  // 本番(クラウド)モード: アカウント情報とログアウトを表示（チームコード共有は使わない）
  if (cloudEnabled()) {
    const s = cloudState();
    const roleLabel = s.role === 'admin' ? '管理者' : s.role === 'worker' ? '職人' : '未割当';
    return h('div', {}, [
      h('h1', { class: 'page-title', text: 'アカウント' }),
      h('div', { class: 'card' }, [
        kvRow('ログイン', s.email || '—'),
        kvRow('役割', roleLabel),
        kvRow('会社ID', s.companyId || '（管理者に割当を依頼）'),
        kvRow('保存先', 'クラウド（Supabase）'),
      ]),
      h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn secondary', text: 'いま同期する', onclick: async () => { await cloudSync(); toast('同期しました'); } }),
        h('button', { class: 'btn ghost', text: 'ログアウト', onclick: async () => { await signOut(); toast('ログアウトしました'); } }),
      ]),
      !s.companyId ? h('div', { class: 'warn-box bad', text: '会社が未割当です。管理者がSupabaseでprofilesにcompanyIdを設定すると、データが表示されます。' }) : null,
      h('p', { class: 'sub', text: 'データは会社単位でクラウド保存され、別の端末からも同じ内容を確認できます。' }),
    ]);
  }

  const cfg = getConfig();

  const serverInput = h('input', { type: 'text', placeholder: '空欄=このサーバー（同一オリジン）', value: cfg.serverUrl || '' });
  const codeInput = h('input', { type: 'text', placeholder: '例）ito-toso-2026', value: cfg.teamCode || '' });

  const statusLine = h('div', { class: 'sub' });
  const renderStatus = () => {
    const s = syncState();
    if (!s.enabled) { statusLine.textContent = '共有はオフです（この端末のみに保存）'; return; }
    const at = s.lastSync ? new Date(s.lastSync).toLocaleTimeString('ja-JP') : '未';
    statusLine.textContent = (s.syncing ? '同期中…' : '待機中') + `　最終同期: ${at}` + (s.lastError ? `　⚠️ ${s.lastError}` : '');
  };
  const off = onSyncEvent(renderStatus);
  // 画面離脱時にリスナ解除（簡易: 次のレンダリングまで保持されるため大きな問題はない）
  renderStatus();

  const connect = async () => {
    const teamCode = codeInput.value.trim();
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(teamCode)) {
      toast('チームコードは英数字3〜40文字で入力してください');
      return;
    }
    const wasCode = getConfig().teamCode;
    setConfig({ enabled: true, serverUrl: serverInput.value.trim(), teamCode });
    if (wasCode !== teamCode) resetCursorsForFullSync();
    toast('接続を確認中…');
    try {
      const ok = await ping();
      if (!ok) { toast('サーバーに接続できませんでした'); return; }
    } catch {
      toast('サーバーに接続できませんでした。URLを確認してください');
      return;
    }
    toast('チームに参加しました。同期します');
    await syncNow();
    renderStatus();
  };

  const disconnect = () => {
    setConfig({ ...getConfig(), enabled: false });
    toast('共有をオフにしました（データは端末に残ります）');
    renderStatus();
  };

  const counts = h('div', { class: 'stat-row' }, [
    statCard(store.all('sites').length, '案件'),
    statCard(store.all('reports').length, '日報'),
    statCard(store.all('photos').length, '写真'),
    statCard(store.all('estimates').length, '見積'),
  ]);

  return h('div', {}, [
    h('h1', { class: 'page-title', text: '共有設定' }),
    h('div', { class: 'card' }, [
      h('p', { class: 'sub mt-0', text: '同じ「チームコード」を入力した職人・管理者の間で、案件・日報・写真・見積を共有します。サーバーURLを空欄にすると、このアプリを配信しているサーバーに接続します。' }),
      h('div', { class: 'field' }, [h('label', { text: 'サーバーURL' }), serverInput]),
      h('div', { class: 'field' }, [h('label', { text: 'チームコード（合言葉）' }), codeInput,
        h('div', { class: 'hint', text: '会社・現場チームで共通の文字列。これを知っている人だけが同じデータを見られます。' })]),
      h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn', text: isEnabled() ? '再接続して同期' : 'チームに参加して同期', onclick: connect }),
      ]),
      isEnabled() ? h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn secondary', text: 'いま同期する', onclick: async () => { await syncNow(); renderStatus(); toast('同期しました'); } }),
        h('button', { class: 'btn ghost', text: '共有をオフ', onclick: disconnect }),
      ]) : null,
      statusLine,
    ]),
    h('div', { class: 'section-title', text: 'この端末のデータ' }),
    counts,
    h('p', { class: 'sub', text: 'ヒント: PCでサーバーを起動し、職人さんのスマホで同じチームコードを入力すると、現場の写真・日報がリアルタイムに集約されます。' }),
  ]);
}

function statCard(num, lbl) {
  return h('div', { class: 'stat' }, [
    h('div', { class: 'num', text: String(num) }),
    h('div', { class: 'lbl', text: lbl }),
  ]);
}

function kvRow(k, v) {
  return h('div', { class: 'kv' }, [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v })]);
}
