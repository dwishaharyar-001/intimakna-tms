#!/usr/bin/env bash
# check-deploy.sh — pemeriksaan cepat setelah deploy.
# Pakai:
#   bash scripts/check-deploy.sh https://intimakna-tms.vercel.app [https://api-anda.onrender.com]
set -uo pipefail

WEB="${1:-}"
API="${2:-}"
if [ -z "$WEB" ]; then
  echo "Pakai: bash scripts/check-deploy.sh <url-web> [url-api]"; exit 1
fi
WEB="${WEB%/}"; API="${API%/}"

pass() { printf '  ✓ %s\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1"; HINTS+=("$2"); }
HINTS=()

echo "== Web: $WEB =="
code=$(curl -s -o /tmp/cd-root.html -w '%{http_code}' "$WEB" --max-time 25)
case "$code" in
  200|307|308) pass "halaman utama merespons ($code)";;
  *) fail "halaman utama $code" "Root Directory Vercel kemungkinan belum 'apps/web'";;
esac
code=$(curl -s -o /tmp/cd-login.html -w '%{http_code}' "$WEB/login" --max-time 25)
if [ "$code" = "200" ] && grep -q "Masuk" /tmp/cd-login.html; then
  pass "halaman login tampil"
else
  fail "halaman login $code" "cek log build Vercel (harus 'Detected Next.js')"
fi

echo "== Jalur API lewat web (rewrite /api/*) =="
code=$(curl -s -o /tmp/cd-proxy.json -w '%{http_code}' "$WEB/api/v1/settings/public" --max-time 30)
if [ "$code" = "200" ]; then
  pass "rewrite bekerja (200)"
elif grep -q "DNS_HOSTNAME_RESOLVED_PRIVATE" /tmp/cd-proxy.json 2>/dev/null; then
  fail "rewrite gagal: tujuan privat" "set API_URL di Vercel ke URL API publik, lalu Redeploy"
else
  fail "rewrite gagal ($code)" "pastikan API sudah online dan API_URL benar (tanpa slash di akhir)"
fi

if [ -n "$API" ]; then
  echo "== API langsung: $API =="
  code=$(curl -s -o /tmp/cd-api.json -w '%{http_code}' "$API/api/v1/settings/public" --max-time 30)
  if [ "$code" = "200" ] && grep -q '"identity"' /tmp/cd-api.json; then
    pass "API membalas data identitas organisasi"
    brand=$(python3 -c "import json;print(json.load(open('/tmp/cd-api.json'))['identity'].get('brandName',''))" 2>/dev/null)
    [ -n "$brand" ] && echo "     brand di database: $brand"
  else
    fail "API $code" "cek log host API: migrasi/env (DATABASE_URL, DIRECT_URL, JWT_SECRET)"
  fi
else
  echo "== API langsung: (belum diberikan) =="
  echo "  ℹ jalankan ulang dengan URL API untuk memeriksa bagian ini"
fi

echo
if [ ${#HINTS[@]} -eq 0 ]; then
  echo "Hasil: SEMUA PEMERIKSAAN LULUS ✓"
else
  echo "Hasil: ada yang perlu diperbaiki:"
  for h in "${HINTS[@]}"; do echo "  - $h"; done
fi
