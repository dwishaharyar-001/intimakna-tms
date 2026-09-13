# Intimakna TMS — Training Management System

Sistem internal PT. Intimakna (perusahaan penyelenggara pelatihan) untuk mengelola **leads pipeline**, **direktori & riwayat alumni** (cross-selling/up-selling), **penjadwalan training batch**, dan **cost & profit per batch**.

> Repositori ini di-scaffold dari PRD + Prisma schema + API spec + Security Architecture yang disepakati.
> Catatan keputusan desain: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Arsitektur

```
intimakna-tms/
├── apps/
│   ├── api/    # Backend NestJS + Prisma (PostgreSQL)
│   └── web/    # Frontend Next.js (App Router) + Tailwind CSS v4
├── docs/       # Keputusan desain
└── docker-compose.yml  # PostgreSQL lokal
```

| Layer | Stack |
|---|---|
| Database | PostgreSQL + Prisma ORM |
| API | NestJS 11 (Guards RBAC, class-validator, Throttler, Helmet) |
| Auth | JWT Access Token 15 mnt (header) + Refresh Token opaque di **HttpOnly cookie**, rotasi & revoke via tabel `RefreshSession` (hash SHA-256) |
| Password | Argon2id |
| Web | Next.js 15 (App Router), React 19, Tailwind v4 |

## Alur bisnis utama

1. **Lead masuk** dari WhatsApp/Call/Referensi Alumni/Post-Training → `SALES_MARKETING`/`ADMIN_TRAINING` kelola status pipeline (`NEW → CONTACTED → PROPOSAL_SENT → CLOSED_WON/CLOSED_LOST`).
2. **Pendaftaran ke kelas** (dari lead atau alumni) otomatis membuat `BatchParticipant` + **draf tagihan** sebesar **harga kelas** (`pricePerPax`). Kelas Reguler adalah *menu training default* INTIMAKNA dan **berdiri sendiri** (tidak terikat Program).
3. **Lead menjadi Peserta saat biaya training dibayar** — ketika Finance mencatat pembayaran lunas (`PAID`), lead tertaut (atau lead dengan nomor HP sama yang masih pipeline) otomatis di-`CLOSED_WON` dan ditautkan ke participant.
4. **Net profit per batch** = Σ Revenue − Σ Expense, dihitung real-time.

## Menjalankan (lokal)

**Cara cepat — satu perintah (Docker + API + Web sekaligus):**

```bash
bash scripts/dev.sh
# Aplikasi : http://localhost:3000
# Dari HP  : http://<IP-LAN>:3000   (HP & Mac di Wi-Fi yang sama)
# Log      : .logs/web.log · .logs/api.log
```

Skrip akan menyalakan Docker Desktop bila perlu, container PostgreSQL, API, dan web dev (hot reload).

**Cara manual:**

```bash
# 1. Database PostgreSQL
docker compose up -d

# 2. Backend
cd apps/api
cp .env.example .env        # isi DATABASE_URL & JWT_SECRET
npm install
npx prisma migrate dev      # buat skema (jalankan sekali)
SEED_PASSWORD="sandi-pilihan-anda" npm run seed   # data demo + 6 akun peran
npm run start:dev           # http://localhost:4000/api/v1

# 3. Frontend (terminal lain)
cd apps/web
npm install
npm run dev                 # http://localhost:3000
```

Tanpa Docker, arahkan `DATABASE_URL` ke instance PostgreSQL mana pun.

## Akun demo (sandi ditentukan saat seed)

- `superadmin@intimakna.id` — **Super Admin**: akses penuh seluruh resource, kelola semua akun/peran, & pusat konfigurasi aplikasi (menu Konfigurasi; cakupan modul menyusul)
- `management@intimakna.id` — Executive Dashboard (read-only analitik)
- `sales@intimakna.id` — Leads Pipeline & Alumni Inquiry
- `admin@intimakna.id` — master kelas reguler, program custom, jadwal, pendaftaran
- `support@intimakna.id` — operasional harian kelas
- `finance@intimakna.id` — expense, revenue, status pembayaran

## Endpoint API (ringkas)

| Method | Path | Akses |
|---|---|---|
| POST | `/api/v1/auth/login` · `/refresh` · `/logout` | publik |
| GET | `/api/v1/auth/me` | semua (token) |
| POST | `/api/v1/leads` · GET `/api/v1/leads` · PATCH `/api/v1/leads/:id` | SALES_MARKETING, ADMIN_TRAINING, MANAGEMENT |
| POST | `/api/v1/leads/:id/enroll` | SALES_MARKETING, ADMIN_TRAINING |
| GET | `/api/v1/alumni?search=&programId=&page=&limit=` | SALES_MARKETING, ADMIN_TRAINING, MANAGEMENT |
| GET | `/api/v1/alumni/:id` · POST `/api/v1/alumni/:id/enroll` | SALES_MARKETING, ADMIN_TRAINING, MANAGEMENT |
| GET | `/api/v1/programs` · POST `/api/v1/programs` · PATCH/DELETE `/api/v1/programs/:id` | semua (auth) / ADMIN_TRAINING (mutasi; SUPER_ADMIN otomatis) |
| GET | `/api/v1/batches` · `/api/v1/batches/:id` | semua (auth); data finansial: FINANCE, MANAGEMENT, ADMIN_TRAINING |
| POST/PATCH/DELETE | `/api/v1/batches(/:id)` | ADMIN_TRAINING (mutasi; SUPER_ADMIN otomatis) — **Kelas Reguler** (dulu disebut “Batch”) |
| PATCH | `/api/v1/financials/batches/:batchId/package` | FINANCE — pembayaran **paket In-House** (batch-level) |
| GET/POST/PATCH/DELETE | `/api/v1/requirement-templates(/:id)` · `GET/POST /api/v1/batches/:id/requirements` · `PATCH/DELETE /api/v1/requirements/:id` | ADMIN_TRAINING/SUPER_ADMIN (template) · ADMIN_TRAINING, TRAINING_SUPPORT, SUPER_ADMIN (checklist kelas) |
| GET/PUT | `/api/v1/me/layout/:pageKey` | semua (auth) — susunan widget milik user sendiri |
| GET | `/api/v1/settings/public` | tanpa login — brand, logo, format, periode untuk halaman masuk |
| GET | `/api/v1/settings/general` | semua (auth) — setelan Konfigurasi Umum lengkap |
| PUT | `/api/v1/settings/general` | **Super Admin** — ubah Konfigurasi Umum (tercatat di Audit Log) |
| GET | daftar mendukung `?paged=1&page=&limit=10` (batches, materials, programs, users, financials/revenues) | semua (auth) |
| GET | `/api/v1/financials/overview` · `/batches/:batchId/summary` | FINANCE, MANAGEMENT, ADMIN_TRAINING |
| GET | `/api/v1/financials/revenues` | FINANCE, MANAGEMENT |
| POST | `/api/v1/financials/expenses` | FINANCE |
| PATCH | `/api/v1/financials/revenues/:id` | FINANCE |
| GET/POST/PATCH | `/api/v1/users…` | MANAGEMENT (+ sebagian ADMIN_TRAINING); **SUPER_ADMIN mengelola semua akun/peran** |
| GET | `/api/v1/lead-stages` | semua (auth) — daftar kolom pipeline |
| GET/POST/PATCH/DELETE | `/api/v1/lead-stages/admin/*` | **SUPER_ADMIN** — tambah/ubah/urutkan/hapus kolom status |

> **SUPER_ADMIN** (level tertinggi): tembus seluruh pembatasan RBAC backend & melihat semua menu di aplikasi. Hanya SUPER_ADMIN yang dapat membuat/menonaktifkan SUPER_ADMIN lain.

Semua endpoint mutasi penting tercatat di `AuditLog`.

## Roadmap (di luar MVP / ditunda)

- **Backlog fitur (diparkir, siap dipanggil): [`docs/BACKLOG.md`](docs/BACKLOG.md)** — mis. *Notifikasi/WhatsApp Reminder H-3 Persiapan Kelas*.

- Model perhitungan revenue korporat & paket (keputusan #4).
- Alur sertifikat & feedback peserta (keputusan #5) — field `certificateNo`/`feedbackScore` sudah tersedia di schema.
- Integrasi eksternal (sengaja di luar cakupan MVP).

## Deploy (GitHub + Supabase + Vercel)

- Vercel/API produksi & mengatasi `404: NOT_FOUND`: [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md)

Panduan langkah demi langkah ada di [docs/DEPLOY_SUPABASE.md](docs/DEPLOY_SUPABASE.md):
Supabase sebagai PostgreSQL sementara (region Singapore), migrasi skema, impor data lokal, dan checklist keamanan.
