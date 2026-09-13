#!/usr/bin/env bash
# set-supabase-db.sh — isi DATABASE_URL & DIRECT_URL di apps/api/.env dari kredensial
# Supabase TANPA menampilkan sandi di layar atau riwayat perintah.
#
# Pakai:
#   bash scripts/set-supabase-db.sh <project-ref>
# Contoh:
#   bash scripts/set-supabase-db.sh nuzsgvmdenovjdhqhzdr
#
# Opsi lingkungan:
#   POOL_HOST=aws-1-ap-southeast-1.pooler.supabase.com   (bila host pooler berbeda)
#   DIRECT_MODE=ipv6                                     (bila jaringan Anda punya IPv6;
#                                                         default: session-pooler port 5432)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/apps/api/.env"
REF="${1:-}"

if [ -z "$REF" ]; then
  echo "Sebutkan project ref Supabase. Contoh: bash scripts/set-supabase-db.sh nuzsgvmdenovjdhqhzdr" >&2
  exit 1
fi
[ -f "$ENV_FILE" ] || { echo "Berkas $ENV_FILE tidak ditemukan." >&2; exit 1; }

read -r -s -p "Database Password Supabase (tidak terlihat): " DBPW; echo
[ -n "$DBPW" ] || { echo "Sandi kosong — dibatalkan." >&2; exit 1; }

POOL_HOST="${POOL_HOST:-aws-0-ap-southeast-1.pooler.supabase.com}"
DIRECT_MODE="${DIRECT_MODE:-session-pooler}"

POOLED="postgresql://postgres.${REF}:${DBPW}@${POOL_HOST}:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require"
if [ "$DIRECT_MODE" = "ipv6" ]; then
  DIRECT="postgresql://postgres:${DBPW}@db.${REF}.supabase.co:5432/postgres?sslmode=require"
else
  DIRECT="postgresql://postgres.${REF}:${DBPW}@${POOL_HOST}:5432/postgres?sslmode=require"
fi

cp "$ENV_FILE" "$ENV_FILE.bak"

python3 - "$ENV_FILE" "$POOLED" "$DIRECT" <<'PY'
import re, sys
path, pooled, direct = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path).read()

def put(text, key, value):
    pat = re.compile(rf'^{key}=.*$', re.M)
    line = f'{key}="{value}"'
    if pat.search(text):
        return pat.sub(line, text, count=1)
    return text.rstrip() + f'\n{line}\n'

s = put(s, 'DATABASE_URL', pooled)
s = put(s, 'DIRECT_URL', direct)
open(path, 'w').write(s)
print('✓ DATABASE_URL (transaction pooler 6543) & DIRECT_URL diperbarui.')
PY

echo "Cadangan berkas lama: apps/api/.env.bak (diabaikan git)."
echo
echo "Langkah berikutnya:"
echo "  cd apps/api && npx prisma migrate deploy && npx prisma generate"
echo "  lalu impor data: docker run --rm -i postgres:16-alpine psql \"<DIRECT_URL>\" -v ON_ERROR_STOP=1 -1 -f - < dumps/intimakna-data-*.sql"
echo
echo "Catatan:"
echo "  - Host pooler bisa berbeda antar project (aws-0 / aws-1). Bila gagal menyambung, salin host"
echo "    persis dari Dashboard → tombol Connect, lalu jalankan:"
echo "      POOL_HOST=<host-dari-dashboard> bash scripts/set-supabase-db.sh $REF"
echo "  - Koneksi direct 'db.<ref>.supabase.co' hanya IPv6; default di skrip ini memakai Session pooler"
echo "    (host pooler port 5432) agar tetap jalan di jaringan IPv4."
