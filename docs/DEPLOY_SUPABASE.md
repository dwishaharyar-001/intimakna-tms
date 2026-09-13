# Deploy: GitHub + Supabase (database sementara)

Panduan ini memindahkan aplikasi Intimakna TMS ke **GitHub** dan memakai **Supabase** sebagai
PostgreSQL sementara (region **Singapore**). Skrip aplikasi hanya butuh dua variabel koneksi.

---

## 1. Buat project Supabase

1. Masuk ke <https://supabase.com/dashboard> → **New project**.
2. Region: **Southeast Asia (Singapore)**. Simpan **Database Password** dengan aman (jangan di chat/git).
3. Tunggu ± 2 menit sampai project siap.

## 2. Salin dua koneksi (penting: keduanya dipakai)

Buka **Project Settings → Database → Connection string**:

| Peran | Ambil dari | Bentuk |
|---|---|---|
| **DATABASE_URL** (dipakai aplikasi) | *Connection pooling* → **Transaction** (port `6543`) | `postgresql://postgres.<ref>:SANDI@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require` |
| **DIRECT_URL** (untuk migrasi/transfer) | *Connection string* → **Direct connection** (port `5432`) | `postgresql://postgres:SANDI@db.<ref>.supabase.co:5432/postgres?sslmode=require` |

> Pooler wajib untuk aplikasi (Supabase memakai PgBouncer). Migrasi & impor data harus lewat
> koneksi **direct**, karena PgBouncer tidak mendukung semua perintah DDL.

## 3. Isi berkas `.env` API

Buat/salin `apps/api/.env` (sudah diabaikan git) dan isi:

```env
DATABASE_URL="<koneksi pooler di atas>"
DIRECT_URL="<koneksi direct di atas>"
JWT_SECRET="<nilai acak panjang: openssl rand -base64 48>"
WEB_ORIGIN="http://localhost:3000"
PORT=4000
```

## 4. Buat skema di Supabase

```bash
cd apps/api
npx prisma migrate deploy      # memakai DIRECT_URL, tidak menghapus data
npx prisma generate
```

Jangan memakai `prisma migrate dev` / `reset` pada database cloud — keduanya bisa mengubah/menghapus data.

## 5. Pindahkan data asli dari database lokal

```bash
# a) Ekspor data lokal (Docker) → dumps/*.sql  (folder ini diabaikan git)
bash scripts/db-export.sh

# b) Impor ke Supabase lewat koneksi DIRECT (port 5432)
docker run --rm -i postgres:16-alpine psql "<DIRECT_URL>" \
  -v ON_ERROR_STOP=1 -1 -f - < dumps/intimakna-data-XXXX.sql
```

Catatan penting:
- **Jalankan impor hanya ke database tujuan yang masih kosong** (baru dibuat). Untuk memuat ulang,
  buat project Supabase baru atau kosongkan tabel lewat **Table Editor** terlebih dahulu.
- Berkas dump berisi data asli (nama, telepon, email) — jangan di-commit, jangan dikirim via chat.
- Impor otomatis TIDAK disediakan karena melibatkan pengosongan tabel (berisiko). Panduan di atas
  sengaja manual agar Anda melihat persis apa yang dijalankan.

## 6. Buat akun admin pertama

Skema saja tidak berisi akun. Dua pilihan:

```bash
# Pilihan A — seed demo (menambah akun demo + dataset contoh)
cd apps/api
SEED_PASSWORD="<sandi kuat pilihan Anda>" ALLOW_REMOTE_SEED=1 npm run seed

# Pilihan B — data asli sudah diimpor (langkah 5), jadi akun sudah ikut terbawa.
#   Setelahnya: WAJIB ganti sandi akun lama lewat menu Pengguna.
```

`ALLOW_REMOTE_SEED=1` adalah pengaman agar seed tidak dijalankan ke database non-lokal secara tidak sengaja.

## 7. Jalankan & uji

```bash
bash scripts/dev.sh          # Docker + API + Web
```

Uji: login, Dashboard, Pelatihan, Checklist, Keuangan, Konfigurasi Umum (unggah logo), Prospek.

## 8. Checklist keamanan sebelum/sesudah unggah

- [ ] `.env` **tidak** ikut ter-commit (`git status` bersih dari `.env`)
- [ ] `JWT_SECRET` produksi berbeda dari lokal dan nilainya acak panjang
- [ ] Sandi akun demo/akun lama diganti
- [ ] Tidak ada dump data asli di repo (`dumps/` diabaikan)
- [ ] Repo publik: tidak ada nama/telepon/email alumni di kode

## 9. Bila nanti pindah ke database produksi sendiri

Ganti `DATABASE_URL` + `DIRECT_URL`, jalankan `prisma migrate deploy`, lalu impor ulang data.
Tidak ada perubahan kode yang diperlukan — semua koneksi berasal dari env.
