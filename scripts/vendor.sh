#!/usr/bin/env bash
# Rebuild the self-hosted third-party scripts in web/vendor/ (backlog A3). The app loads nothing from a CDN.
#   bash scripts/vendor.sh
# Bump a version here deliberately, run this, run every test, then bump web/version.js (the app's update check) and
# record the new versions and checksums in docs/setup.md ("Third-party scripts").
set -euo pipefail
SUPABASE_JS=2.117.3
QRCODE=2.0.4
ESBUILD=0.25.10
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
npm init -y >/dev/null
npm i --no-audit --no-fund --save-exact "@supabase/supabase-js@$SUPABASE_JS" "qrcode-generator@$QRCODE" "esbuild@$ESBUILD" >/dev/null
echo "export * from '@supabase/supabase-js';" > entry.js
npx esbuild entry.js --bundle --format=esm --platform=browser --target=es2020 --minify --legal-comments=eof \
  --banner:js="// @supabase/supabase-js $SUPABASE_JS (MIT), bundled with its dependencies by scripts/vendor.sh. Do not edit." \
  --outfile="$ROOT/web/vendor/supabase-js.js"
{ echo "// qrcode-generator $QRCODE (MIT, Kazuhiko Arase), dist/qrcode.mjs copied by scripts/vendor.sh. Do not edit."; cat node_modules/qrcode-generator/dist/qrcode.mjs; } \
  > "$ROOT/web/vendor/qrcode.js"
npm ls --all --parseable=false 2>/dev/null | grep -E '@supabase|phoenix|qrcode' || true
cd "$ROOT" && sha256sum web/vendor/*.js
