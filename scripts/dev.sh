#!/usr/bin/env bash
# dev.sh — nyalakan seluruh stack Intimakna TMS untuk pengembangan lokal.
# Pakai:  bash scripts/dev.sh
# Proses dijalankan detached (sesi baru) sehingga tetap hidup walau terminal/sesi penutup.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.logs"
mkdir -p "$LOGS"

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# Jalankan perintah di sesi proses baru (detached betulan).
launch() { # launch <dir> <logfile> <perintah-shell>
  python3 - "$1" "$2" "$3" <<'PY'
import os, subprocess, sys
cwd, log, cmd = sys.argv[1], sys.argv[2], sys.argv[3]
f = open(log, 'ab')
subprocess.Popen(
    ['/bin/bash', '-lc', cmd],
    cwd=cwd, stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
    start_new_session=True,
)
PY
}

echo "== Intimakna TMS · dev up =="

# 1) Docker + PostgreSQL
if ! docker info >/dev/null 2>&1; then
  echo "… menyalakan Docker Desktop"
  open -a Docker >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
fi
if docker info >/dev/null 2>&1; then
  (cd "$ROOT" && docker compose up -d >/dev/null 2>&1) && echo "✓ Database (docker) siap"
else
  echo "✗ Docker belum siap — buka Docker Desktop manual lalu ulangi skrip ini"
fi

# 2) API (NestJS, hasil build terakhir)
if port_busy 4000; then
  echo "✓ API sudah berjalan di port 4000"
else
  launch "$ROOT/apps/api" "$LOGS/api.log" 'set -a; . ./.env; set +a; exec node dist/main.js'
  echo "… API dijalankan (log: .logs/api.log)"
fi

# 3) Web (Next.js dev, hot reload)
if port_busy 3000; then
  echo "✓ Web sudah berjalan di port 3000"
else
  launch "$ROOT/apps/web" "$LOGS/web.log" 'exec npm run dev'
  echo "… Web dev dijalankan (log: .logs/web.log)"
fi

# 4) Tunggu siap lalu laporkan
for _ in $(seq 1 40); do curl -sf -o /dev/null --max-time 2 http://localhost:3000/login && break; sleep 1; done
for _ in $(seq 1 40); do curl -s -o /dev/null --max-time 2 http://localhost:4000/api/v1/auth/me && break; sleep 1; done

IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
echo
echo "Aplikasi   : http://localhost:3000"
[ -n "${IP:-}" ] && echo "Dari HP    : http://$IP:3000"
echo "API        : http://localhost:4000/api/v1"
echo "Log        : .logs/web.log · .logs/api.log"
