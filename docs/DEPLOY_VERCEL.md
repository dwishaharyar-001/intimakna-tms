# Deploy ke Vercel (web) + host API

Dua bagian harus jalan bersamaan: **web (Next.js) di Vercel** dan **API (NestJS) di host Node**
(mis. Render/Railway/Fly). Vercel hanya menjalankan web.

---

## A. Kenapa muncul `404: NOT_FOUND`

Repo ini **monorepo** (`apps/web`, `apps/api`) dan **tidak punya `package.json` di root**.
Kalau Vercel membangun dari root repo, tidak ada aplikasi yang dihasilkan → semua URL balas 404.

Yang harus dicapai: **Root Directory project = `apps/web`**.
Berikut 4 cara mencapainya — pilih salah satu.

### Cara 1 — Lewat URL langsung (paling cepat)

Buka: `https://vercel.com/<nama-akun>/<nama-project>/settings/build-and-deployment`
Contoh: `https://vercel.com/dwishaharyar-001/intimakna-tms/settings/build-and-deployment`

Di halaman itu gulir ke bawah → **Root Directory** → klik **Edit** → isi `apps/web` → **Save**.
Lalu tab **Deployments** → **Redeploy**.

> Catatan: halaman settings di atas adalah **settings project** (URL mengandung `/settings`),
> bukan settings akun. Pastikan Anda sedang di dalam project, bukan di daftar project.

### Cara 2 — Lewat Settings → General

1. Buka project → tab **Settings** → **General**.
2. Cari kartu **Build & Development Settings** → klik **Edit**/**Override**.
3. Isi kolom **Root Directory** = `apps/web` → Save → **Redeploy**.

### Cara 3 — Buat ulang project dari repo (paling pasti)

1. Vercel → **Add New… → Project** → pilih repo `intimakna-tms`.
2. Pada layar **Configure Project**, bagian **Root Directory** klik **Edit** → pilih **`apps/web`**.
3. Framework Preset otomatis **Next.js**. Klik **Deploy**.
4. Project baru ini pasti benar; project lama bisa dihapus setelahnya.

### Cara 4 — Tanpa dashboard (Vercel CLI)

```bash
cd apps/web
npx vercel link      # pilih project yang sudah ada (atau buat baru)
npx vercel --prod
```
CLI memakai folder aktif (`apps/web`) sebagai root, jadi tidak perlu mengubah menu apa pun.

### Setelah Root Directory benar

Pastikan juga:

| Pengaturan | Nilai |
|---|---|
| Framework Preset | `Next.js` |
| Build Command | `next build` (default) |
| Output Directory | `.next` (default) |
| Install Command | `npm install` (default) |
| **Node.js Version** (Settings → General) | `22.x` |

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
- Pastikan Root Directory benar-benar tersimpan: buka lagi halaman settings dan cek nilainya masih `apps/web`.

## F. Catatan cookie & keamanan

- Login memakai cookie refresh **httpOnly** pada domain Vercel; karena web meneruskan `/api/*` secara
  same-origin, tidak ada masalah CORS/cookie lintas domain.
- `secure` cookie aktif otomatis saat `NODE_ENV=production` (host API harus HTTPS).
- Jangan taruh `DATABASE_URL`/`JWT_SECRET` di Vercel; simpan hanya di host API.
