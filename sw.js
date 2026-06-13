// シンプルなオフラインキャッシュ。アプリ資産をキャッシュし、ネット不通でも起動できるようにする。
const CACHE = 'nurilog-v10';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/config.js',
  './js/app.js',
  './js/db.js',
  './js/model.js',
  './js/ui.js',
  './js/alerts.js',
  './js/money.js',
  './js/company.js',
  './js/doc.js',
  './js/sync.js',
  './js/cloud.js',
  './js/views/worker.js',
  './js/views/admin.js',
  './js/views/site.js',
  './js/views/customers.js',
  './js/views/survey.js',
  './js/views/estimate.js',
  './js/views/settings.js',
  './js/views/login.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先（オンライン時は常に最新を取得し、キャッシュを更新）。
// オフライン時のみキャッシュにフォールバックする。
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
