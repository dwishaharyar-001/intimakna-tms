# Deploy ke Vercel (web) + host API

Dua bagian harus jalan bersamaan: **web (Next.js) di Vercel** dan **API (NestJS) di host Node**
(mis. Render/Railway/Fly). Vercel hanya menjalankan web; API tidak bisa berjalan sebagai server
persisten di Vercel, jadi jangan deploy API ke sana.

---

## A. Kenapa muncul `404: NOT_FOUND`

Repo ini **monorepo** (`apps/web`, `apps/api`) dan **tidak punya `package.json` di root**.
Kalau Vercel mem-build dari root repo, tidak ada aplikasi yang dihasilkan → setiap URL balas 404.

**Perbaikan (wajib):** arahkan Vercel ke folder web.

1. Vercel → project Anda → **Settings → Build and Deployment**.
2. **Root Directory** → klik *Edit* → pilih **`apps/web`** → Save.
3. Pastikan:
   - **Framework Preset**: `Next.js`
   - **Build Command**: `next build` (biarkan default)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)
   - **Node.js Version**: `22.x` (Settings → General → Node.js Version)
4. Tab **Deployments** → **Redeploy** (centang *Use existing Build Cache* boleh).

Hasil yang benar: halaman login tampil, bukan 404.

## B. Variabel lingkungan di Vercel

Settings → **Environment Variables** (Production & Preview):

| Nama | Nilai | Kenapa |
|---|---|---|
| `API_URL` | `https://<nama-api>.onrender.com` (URL API, **tanpa** slash di akhir) | Next.js meneruskan `/api/*` ke API ini |

Tidak ada kredensial database di Vercel — database hanya diakses oleh API. Setelah mengubah env,
**Redeploy** agar rewrite memakai URL baru.

## C. Deploy API (Render — sudah disiapkan `render.yaml`)

1. Render → **New → Blueprint** → pilih repo `dwishaharyar-001/intimakna-tms`.
2. Render membaca `render.yaml` (Dockerfile `apps/api/Dockerfile`, migrasi otomatis saat start).
3. Isi env saat diminta:

| Variabel | Nilai |
|---|---|
| `DATABASE_URL` | koneksi **transaction pooler** Supabase (port `6543`, `?pgbouncer=true&connection_limit=1&sslmode=require`) |
| `DIRECT_URL` | koneksi **session pooler** Supabase (port `5432`) — dipakai `prisma migrate deploy` saat start |
| `JWT_SECRET` | hasil `openssl rand -base64 48` |
| `WEB_ORIGIN` | domain Vercel Anda, mis. `https://intimakna-tms.vercel.app` (boleh beberapa, pisahkan koma) |
| `PORT` | `4000` |

4. Setelah deploy, cek: `https://<nama-api>.onrender.com/api/v1/settings/public` harus membalas JSON
   berisi identitas organisasi (bukan 502/500).
5. Salin URL itu ke `API_URL` di Vercel (bagian B) lalu Redeploy web.

Alternatif selain Render: Railway/Fly.io/VPS — pakai `apps/api/Dockerfile` yang sama
(`docker build -t intimakna-api apps/api` lalu jalankan dengan env yang sama).

## D. Urutan yang disarankan

1. Deploy API dulu → dapat URL.
2. Set `API_URL` di Vercel → Redeploy web.
3. Set `WEB_ORIGIN` di host API = domain Vercel (agar CORS tidak memblokir).
4. Uji: buka domain Vercel → login → buka Dashboard/Kelas (data berasal dari Supabase).

## E. Kalau masih 404 setelah Root Directory diubah

- Cek **Deployments → log build**: pastikan `Detected Next.js` dan `Compiled successfully`.
- Pastikan domain yang dibuka adalah **domain produksi** deployment terakhir (bukan preview lama).
- Bila build gagal karena Node terlalu tua, set Node.js Version ke 22.x lalu redeploy.
- Kalau memakai **Preview Deployment** dari PR, env `API_URL` harus diisi juga untuk environment Preview.

## F. Catatan cookie & keamanan

- Login memakai cookie refresh **httpOnly** pada domain Vercel; karena web meneruskan `/api/*` secara
  same-origin, tidak ada masalah CORS/cookie lintas domain.
- `secure` cookie aktif otomatis saat `NODE_ENV=production` (host API harus HTTPS).
- Jangan taruh `DATABASE_URL`/`JWT_SECRET` di Vercel; simpan hanya di host API.
