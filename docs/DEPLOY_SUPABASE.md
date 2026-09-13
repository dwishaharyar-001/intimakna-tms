# Deploy: GitHub + Supabase (database sementara)

Panduan memindahkan Intimakna TMS ke **GitHub** dan memakai **Supabase** sebagai PostgreSQL
sementara (region **Singapore**). Aplikasi hanya butuh dua variabel koneksi.

---

## 1. Buat project Supabase

1. <https://supabase.com/dashboard> → **New project**.
2. Region: **Southeast Asia (Singapore)**. Simpan **Database Password** (jangan di chat/git).

## 2. Ambil connection string — ada di tombol **Connect**

> Di dashboard Supabase terbaru, connection string **tidak lagi** di *Project Settings → Database*.
> Cari tombol **Connect** di **kanan atas halaman project**.

1. Buka project → klik **Connect**.
2. Pilih tab **Connection string** / **Connection pooling**.
3. Salin dua-duanya:
   - **Transaction pooler**, port `6543` → dipakai aplikasi (`DATABASE_URL`).
   - **Session pooler**, port `5432` (host `...pooler.supabase.com`) → dipakai migrasi/impor (`DIRECT_URL`).
     Pilihan **Direct connection** (`db.<ref>.supabase.co`) kini **IPv6-only** sehingga sering gagal di jaringan IPv4.
4. Ganti `[YOUR-PASSWORD]` dengan **Database Password** project. Lupa sandinya?
   **Project Settings → Database → Reset database password**.

Bila akun Anda masih memakai UI lama: **Project Settings → Database → Connection string** & **Connection pooling**.
Kunci **Project URL / publishable / anon key** ada di **Project Settings → API** — itu **tidak dipakai** Prisma.

Bentuk akhirnya:

| Variabel | Bentuk |
|---|---|
| `DATABASE_URL` | `postgresql://postgres.<ref>:<PASSWORD>@<POOL_HOST>:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require` |
| `DIRECT_URL` | `postgresql://postgres.<ref>:<PASSWORD>@<POOL_HOST>:5432/postgres?sslmode=require` (Session pooler) |

`<POOL_HOST>` untuk Singapore umumnya `aws-0-ap-southeast-1.pooler.supabase.com` (bisa juga `aws-1-…`).

## 3. Isi `apps/api/.env`

Cara termudah (sandi diketik tanpa terlihat, berkas lama dicadangkan ke `.env.bak`):

```bash
cd <folder-repo>/intimakna-tms
bash scripts/set-supabase-db.sh <project-ref>
# bila host pooler berbeda:
# POOL_HOST=aws-1-ap-southeast-1.pooler.supabase.com bash scripts/set-supabase-db.sh <project-ref>
```

Atau isi manual:

```env
DATABASE_URL="…pooler 6543…"
DIRECT_URL="…session pooler 5432…"
JWT_SECRET="<acak panjang: openssl rand -base64 48>"
WEB_ORIGIN="http://localhost:3000"
PORT=4000
```

Jangan commit `.env` (sudah diabaikan `.gitignore`).

## 4. Buat skema di Supabase

```bash
cd apps/api
npx prisma migrate deploy      # memakai DIRECT_URL; tidak menghapus data
npx prisma generate
```

Jangan pakai `prisma migrate dev` / `reset` pada database cloud.

## 5. Pindahkan data asli dari database lokal

```bash
bash scripts/db-export.sh        # → dumps/intimakna-data-<stamp>.sql (diabaikan git)
docker run --rm -i postgres:16-alpine psql "<DIRECT_URL>" \
  -v ON_ERROR_STOP=1 -1 -f - < dumps/intimakna-data-<stamp>.sql
```

Catatan:
- Impor hanya ke database tujuan yang **masih kosong** (project baru). Untuk memuat ulang, buat project baru
  atau kosongkan tabel lewat Table Editor lebih dulu — impor otomatis sengaja tidak disediakan.
- Berkas dump memuat data asli (nama/telepon/email): jangan di-commit atau dikirim via chat.

## 6. Akun admin pertama

- Jika data asli ikut diimpor (langkah 5), akun lama sudah terbawa — langsung bisa login.
- Jika hanya skema: `cd apps/api && SEED_PASSWORD="<sandi kuat>" ALLOW_REMOTE_SEED=1 npm run seed`.
- Setelah online: **ganti sandi** akun lama/demo lewat menu Pengguna.

## 7. Jalankan & uji

```bash
bash scripts/dev.sh
```

Uji: login, Dashboard, Pelatihan & Detail Kelas, Checklist, Keuangan, Prospek, Konfigurasi Umum (unggah logo).

## 8. Checklist keamanan

- [ ] `.env` tidak ter-commit (`git status` bersih)
- [ ] `JWT_SECRET` acak & berbeda dari lokal
- [ ] Sandi akun lama/demo diganti
- [ ] Tidak ada dump data asli di repo (`dumps/` diabaikan)
- [ ] Repo publik: tidak ada nama/telepon/email alumni di kode

## 9. Pindah ke database produksi sendiri nanti

Ganti `DATABASE_URL` + `DIRECT_URL`, jalankan `prisma migrate deploy`, impor ulang data.
Tidak ada perubahan kode — semua dari env.
