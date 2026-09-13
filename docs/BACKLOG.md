# BACKLOG — Fitur yang Diparkir

> Daftar item yang **sengaja ditunda** atas permintaan pemilik produk. Cukup panggil/"call" item ini di chat untuk memulai implementasinya.

---

## 1) Notifikasi / WhatsApp Reminder H-3 Persiapan Kelas — **PARKED**
- **Diminta/diparkir pada:** 13 Sep 2026
- **Tujuan:** menjelang kelas berjalan (H-3), tim operasional otomatis menerima notifikasi bila **checklist persiapan belum lengkap** (Default/Custom).
- **Konteks yang sudah tersedia di sistem:**
  - Checklist per kelas + progress: `BatchRequirement` (lihat `apps/api/src/requirements/requirements.ts`), badge progress di daftar kelas, dan widget Dashboard “Persiapan Kelas Terdekat”.
  - Kelas punya `startDate` + `status` (PLANNED/ONGOING) pada `ProgramBatch`.
- **Acceptance criteria (usulan saat dikerjakan):**
  1. Job harian (mis. 08:00 WIB) memindai kelas `PLANNED` dengan `startDate` = H+3 dan checklist **belum 100%**.
  2. Kirim ringkasan ke penerima yang dikonfigurasi (WhatsApp tim operasional; opsi fallback email).
  3. Isi pesan: nama kelas, Judul Materi/Level, tanggal mulai, daftar item yang belum selesai, tautan ke halaman detail kelas.
  4. Tidak mengirim bila checklist sudah lengkap; jam kirim, ambang H-, dan daftar penerima **dapat diatur** (Super Admin).
  5. Log pengiriman + tercatat di AuditLog.
- **Yang perlu diputuskan saat implementasi:**
  - Penyedia WhatsApp (WA Cloud API resmi vs vendor), kredensial & nomor pengirim.
  - Template pesan & daftar penerima (grup/individu) → kemungkinan perlu tabel `AppSetting`/`NotificationTarget`.
  - Peran penerima: ADMIN_TRAINING & TRAINING_SUPPORT (usul), atau termasuk MANAGEMENT.
- **Usulan titik implementasi:** backend `@nestjs/schedule` (cron job) + modul `notifications` (adapter WhatsApp/email), UI di **Konfigurasi → Notifikasi**.
- **Prasyarat teknis:** perlu `@nestjs/schedule` (belum terpasang) dan kredensial kanal notifikasi.

---

## Cara memanggil item ini
Contoh perintah: *“kerjakan backlog #1 (reminder H-3)”* — saya akan lanjut dari acceptance criteria di atas.
