// ぬりログ 共有サーバー: 依存ライブラリなし(node:http)。
//  - 同期API: POST /api/sync   （差分の送受信）
//  - 写真Blob: PUT /api/blob/:id, GET /api/blob/:id
//  - フロントのPWAを同梱配信（1デプロイ単位）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyChanges, changesSince, saveBlob, readBlob } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..'); // PWA配信ルート
const PORT = process.env.PORT || 8787;
const MAX_BODY = 25 * 1024 * 1024; // 25MB（写真1枚の上限目安）

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(body);
}
function sendJSON(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req, raw = false) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (raw) return resolve(buf);
      try { resolve(buf.length ? JSON.parse(buf.toString('utf8')) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const validCode = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(c);

async function handleApi(req, res, url) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return send(res, 204, '', {
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  }

  // 同期
  if (url.pathname === '/api/sync' && req.method === 'POST') {
    const body = await readBody(req);
    const { teamCode, cursor = 0, changes = {} } = body;
    if (!validCode(teamCode)) return sendJSON(res, 400, { error: 'invalid teamCode' });
    applyChanges(teamCode, changes);
    const result = changesSince(teamCode, Number(cursor) || 0);
    return sendJSON(res, 200, result);
  }

  // 写真Blob
  const blobMatch = url.pathname.match(/^\/api\/blob\/([A-Za-z0-9_]+)$/);
  if (blobMatch) {
    const id = blobMatch[1];
    if (req.method === 'PUT' || req.method === 'POST') {
      const buf = await readBody(req, true);
      if (!saveBlob(id, buf)) return sendJSON(res, 400, { error: 'invalid id' });
      return sendJSON(res, 200, { ok: true, id, size: buf.length });
    }
    if (req.method === 'GET') {
      const buf = readBlob(id);
      if (!buf) return send(res, 404, 'not found');
      return send(res, 200, buf, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000' });
    }
  }

  return sendJSON(res, 404, { error: 'not found' });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  // ルート外アクセス防止
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'not found');
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => sendJSON(res, 500, { error: String(e.message || e) }));
  } else {
    serveStatic(req, res, url);
  }
});

server.listen(PORT, () => {
  console.log(`ぬりログ 共有サーバー: http://localhost:${PORT}`);
});
