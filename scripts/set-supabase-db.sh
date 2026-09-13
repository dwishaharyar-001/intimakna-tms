#!/usr/bin/env bash
# set-supabase-db.sh — isi DATABASE_URL & DIRECT_URL di apps/api/.env dari kredensial
# Supabase TANPA menampilkan sandi di layar atau riwayat perintah.
# Sandi otomatis di-encode (aman untuk karakter seperti ! # $ @ : / ?).
#
# Pakai:
#   bash scripts/set-supabase-db.sh <project-ref>
# Contoh:
#   bash scripts/set-supabase-db.sh <project-ref>
#
# Opsi lingkungan:
#   POOL_HOST=aws-1-ap-southeast-1.pooler.supabase.com   (bila host pooler berbeda)
#   DIRECT_MODE=ipv6                                     (bila jaringan punya IPv6;
#                                                         default session-pooler port 5432)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/apps/api/.env"
REF="${1:-}"

if [ -z "$REF" ]; then
  echo "Sebutkan project ref Supabase. Contoh: bash scripts/set-supabase-db.sh <project-ref>" >&2
  exit 1
fi
[ -f "$ENV_FILE" ] || { echo "Berkas $ENV_FILE tidak ditemukan." >&2; exit 1; }

read -r -s -p "Database Password Supabase (tidak terlihat): " DBPW; echo
[ -n "$DBPW" ] || { echo "Sandi kosong — dibatalkan." >&2; exit 1; }

# Diteruskan lewat environment (bukan interpolasi shell) agar tidak bocor ke riwayat/log.
export ITM_DB_PASSWORD="$DBPW"
export ITM_REF="$REF"
export ITM_POOL_HOST="${POOL_HOST:-}"
export ITM_DIRECT_MODE="${DIRECT_MODE:-session-pooler}"
export ITM_ENV_FILE="$ENV_FILE"

cp "$ENV_FILE" "$ENV_FILE.bak"

python3 - <<'PY'
import os, re, urllib.parse

env_file = os.environ['ITM_ENV_FILE']
ref = os.environ['ITM_REF']
host = (os.environ.get('ITM_POOL_HOST') or '').strip()
if not host:
    # pakai host pooler yang sudah tersimpan di .env; bila belum ada, default Singapore
    cur = open(env_file).read()
    mm = re.search(r'^DATABASE_URL="[^"]*@([^:/?]+):', cur, re.M)
    host = mm.group(1) if mm and 'pooler.supabase.com' in mm.group(1) else 'aws-0-ap-southeast-1.pooler.supabase.com'
mode = os.environ['ITM_DIRECT_MODE']
pwd = urllib.parse.quote(os.environ['ITM_DB_PASSWORD'], safe='')

pooled = (f"postgresql://postgres.{ref}:{pwd}@{host}:6543/postgres"
          "?pgbouncer=true&connection_limit=1&sslmode=require")
if mode == 'ipv6':
    direct = f"postgresql://postgres:{pwd}@db.{ref}.supabase.co:5432/postgres?sslmode=require"
else:
    direct = f"postgresql://postgres.{ref}:{pwd}@{host}:5432/postgres?sslmode=require"

text = open(env_file).read()

def put(t, key, value):
    pat = re.compile(rf'^{key}=.*$', re.M)
    line = f'{key}="{value}"'
    return pat.sub(line, t, count=1) if pat.search(t) else t.rstrip() + f'\n{line}\n'

text = put(text, 'DATABASE_URL', pooled)
text = put(text, 'DIRECT_URL', direct)
open(env_file, 'w').write(text)
print('✓ DATABASE_URL (transaction pooler 6543) & DIRECT_URL diperbarui (sandi ter-encode).')
PY

unset DBPW ITM_DB_PASSWORD

echo "Cadangan berkas lama: apps/api/.env.bak (diabaikan git)."
echo
echo "Langkah berikutnya:"
echo "  cd apps/api && npx prisma migrate deploy && npx prisma generate"
echo "  impor data: docker run --rm -i postgres:16-alpine psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -1 -f - < dumps/intimakna-data-*.sql"
echo
echo "Catatan:"
echo "  - Host pooler bisa berbeda antar project (aws-0 / aws-1): salin persis dari Dashboard → tombol Connect,"
echo "    lalu: POOL_HOST=<host-dari-dashboard> bash scripts/set-supabase-db.sh $REF"
echo "  - Koneksi direct 'db.<ref>.supabase.co' hanya IPv6; default skrip memakai Session pooler (port 5432)."
