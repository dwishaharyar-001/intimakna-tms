#!/usr/bin/env bash
# db-export.sh — ekspor DATA dari database lokal (Docker) ke berkas .sql.
# Aman: hanya membaca data. Hasil disimpan di folder dumps/ (diabaikan git).
#
# Pakai:  bash scripts/db-export.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/dumps"
mkdir -p "$OUT_DIR"

CONTAINER="${DB_CONTAINER:-intimakna-db}"
DB_USER="${DB_USER:-intimakna}"
DB_NAME="${DB_NAME:-intimakna_tms}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/intimakna-data-$STAMP.sql"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container '$CONTAINER' tidak berjalan. Jalankan dulu: bash scripts/dev.sh" >&2
  exit 1
fi

echo "→ Mengekspor data dari $CONTAINER ($DB_NAME)…"
docker exec "$CONTAINER" pg_dump \
  -U "$DB_USER" -d "$DB_NAME" \
  --data-only --no-owner --no-privileges \
  --exclude-table='_prisma_migrations' > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "✓ Selesai: $FILE ($SIZE)"
echo "  Catatan: berkas ini berisi data asli (nama/kontak). Jangan di-commit — folder dumps/ sudah diabaikan git."
