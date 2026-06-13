// アプリ設定。値が空ならデモ（端末内保存）モード、値が入っていれば本番（クラウド）モード。
//
// ★ ここに本番のキーを直接コミットしないこと。
//   本番デプロイ(Cloudflare Pages)では、環境変数 SUPABASE_URL / SUPABASE_ANON_KEY から
//   ビルド時に scripts/gen-config.mjs が自動生成して上書きする。
//   ※ anon キーはクライアント公開前提の公開キー（RLSで保護）。service_role キーは絶対に置かない。
window.NURILOG_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
