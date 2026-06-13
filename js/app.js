// アプリ本体: ロール切替・ハッシュルーター・タブバー制御。
import { store } from './db.js';
import { seedIfEmpty } from './model.js';
import { clear } from './ui.js';
import { renderWorkerHome } from './views/worker.js';
import { renderAdminHome, renderCases } from './views/admin.js';
import { renderSite, renderReportForm, renderPhotoCapture } from './views/site.js';
import { renderEstimate } from './views/estimate.js';
import { renderSettings } from './views/settings.js';
import { renderLogin } from './views/login.js';
import { initSync, onSyncEvent, syncState, syncNow } from './sync.js';
import { cloudEnabled, initCloud, cloudState, currentRole, onCloud, signOut } from './cloud.js';

const ROLE_KEY = 'nurilog.role';

const tabsByRole = {
  worker: [
    { route: 'worker', icon: '🏠', label: 'ホーム' },
    { route: 'photo',  icon: '📷', label: '写真' },
    { route: 'report', icon: '📝', label: '日報' },
    { route: 'settings', icon: '🔗', label: '共有' },
  ],
  admin: [
    { route: 'admin',    icon: '📊', label: 'ダッシュ' },
    { route: 'cases',    icon: '📋', label: '案件' },
    { route: 'estimate', icon: '🧮', label: '見積' },
    { route: 'settings', icon: '🔗', label: '共有' },
  ],
};

function getRole() { return localStorage.getItem(ROLE_KEY) || 'worker'; }
function setRole(role) { localStorage.setItem(ROLE_KEY, role); }

// route文字列 -> 描画関数
const routes = {
  worker: () => renderWorkerHome(),
  photo: (id) => renderPhotoCapture(id),
  report: (id) => renderReportForm(id),
  admin: () => renderAdminHome(),
  cases: () => renderCases(),
  estimate: (id) => renderEstimate(id),
  settings: () => renderSettings(),
  site: (id) => renderSite(id),
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [route, arg] = raw.split('/');
  return { route: route || (getRole() === 'admin' ? 'admin' : 'worker'), arg };
}

export function navigate(path) { location.hash = '#/' + path; }

function renderTabbar(activeRoute) {
  const bar = document.getElementById('tabbar');
  clear(bar);
  for (const t of tabsByRole[getRole()]) {
    const btn = document.createElement('button');
    btn.className = t.route === activeRoute ? 'active' : '';
    btn.innerHTML = `<span class="ic">${t.icon}</span><span>${t.label}</span>`;
    btn.addEventListener('click', () => navigate(t.route));
    bar.append(btn);
  }
}

function render() {
  const view = document.getElementById('view');
  const tabbar = document.getElementById('tabbar');

  // 本番(クラウド)モードで未ログインならログイン画面のみ表示
  if (cloudEnabled() && !cloudState().signedIn) {
    clear(view);
    tabbar.style.display = 'none';
    view.append(renderLogin(() => { applyCloudRole(); render(); }));
    return;
  }
  tabbar.style.display = '';

  const { route, arg } = parseHash();
  const fn = routes[route] || routes[getRole() === 'admin' ? 'admin' : 'worker'];
  clear(view);
  const node = fn(arg);
  if (node) view.append(node);
  // タブのアクティブ表示は主要タブのみ。詳細画面(site等)はホーム扱い。
  const tabRoutes = tabsByRole[getRole()].map((t) => t.route);
  renderTabbar(tabRoutes.includes(route) ? route : tabRoutes[0]);
  window.scrollTo(0, 0);
}

function setupRoleSwitch() {
  const sw = document.getElementById('roleSwitch');
  const sync = () => {
    sw.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.role === getRole());
    });
  };
  sw.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      setRole(b.dataset.role);
      sync();
      navigate(getRole() === 'admin' ? 'admin' : 'worker');
      render();
    });
  });
  sync();
}

// 同期で他端末の変更が入ったら、閲覧系の画面だけ再描画（入力中フォームは触らない）
const REFRESH_ROUTES = ['worker', 'admin', 'cases', 'site'];
function onSynced() {
  const { route } = parseHash();
  if (REFRESH_ROUTES.includes(route)) render();
}

function updateSyncBadge() {
  const el = document.getElementById('syncBadge');
  if (!el) return;
  // 本番(クラウド)モード
  if (cloudEnabled()) {
    const c = cloudState();
    if (!c.signedIn) { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'sync-badge on';
    el.textContent = 'クラウド';
    return;
  }
  const s = syncState();
  if (!s.enabled) { el.hidden = true; return; }
  el.hidden = false;
  el.className = 'sync-badge ' + (s.lastError ? 'err' : s.syncing ? 'busy' : 'on');
  el.textContent = s.lastError ? '同期エラー' : s.syncing ? '同期中…' : '共有中';
}

// クラウドモード: 役割はアカウント(プロフィール)から決まる。手動の役割切替は隠す。
function applyCloudRole() {
  const r = currentRole();
  if (r) setRole(r);
  // クラウドモードでは役割はアカウント由来。手動切替は常に隠す。
  const sw = document.getElementById('roleSwitch');
  if (sw) sw.style.display = cloudEnabled() ? 'none' : '';
}

async function boot() {
  seedIfEmpty();
  setupRoleSwitch();
  onSyncEvent(updateSyncBadge);
  updateSyncBadge();
  document.addEventListener('nurilog:synced', onSynced);
  window.addEventListener('hashchange', render);

  if (cloudEnabled()) {
    // 本番モード: Supabase認証。役割はアカウント由来。デモ用のチーム同期は使わない。
    try { await initCloud(); } catch (e) { console.warn('クラウド初期化に失敗', e); }
    onCloud(() => { applyCloudRole(); updateSyncBadge(); render(); });
    applyCloudRole();
  } else {
    // デモモード: 端末内保存 ＋ 任意のチームコード共有
    initSync();
  }

  if (!location.hash) navigate(getRole() === 'admin' ? 'admin' : 'worker');
  render();

  // Service Worker（オフライン対応）。ローカルfile://では失敗してもアプリは動作する。
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// デバッグ用に公開
window.__nurilog = store;
window.__syncNow = syncNow;
boot();
