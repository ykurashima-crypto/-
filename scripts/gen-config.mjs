// 環境変数から js/config.js を生成する（秘密情報をコードに直書きしないため）。
// Cloudflare Pages のビルドコマンドに設定する: node scripts/gen-config.mjs
//
// 使う環境変数:
//   SUPABASE_URL       … 例) https://xxxx.supabase.co
//   SUPABASE_ANON_KEY  … 公開anonキー（RLSで保護。クライアント公開前提）
import { writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL || '';
const anon = process.env.SUPABASE_ANON_KEY || '';

if (!url || !anon) {
  console.warn('[gen-config] SUPABASE_URL / SUPABASE_ANON_KEY 未設定。デモ(端末内保存)モードで生成します。');
}

const body = `// このファイルはビルド時に scripts/gen-config.mjs が自動生成します。手動編集しないでください。
window.NURILOG_CONFIG = {
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(anon)},
};
`;

writeFileSync(new URL('../js/config.js', import.meta.url), body);
console.log(`[gen-config] js/config.js を生成しました (cloud=${url ? 'ON' : 'OFF'})`);
