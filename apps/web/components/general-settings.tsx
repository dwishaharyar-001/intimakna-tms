'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, ErrorNote, Field, Input, Select } from '@/components/ui';
import { uploadFile } from '@/lib/api';
import { money, fmtDate, ROLE_LABEL, type Role } from '@/lib/core';
import { useSettings, type GeneralSettings } from '@/lib/settings';

const ACCENT_PRESETS = ['#E53935', '#1E88E5', '#0F9D58', '#6D4C41', '#7E57C2', '#F5B301'];
const DATE_FORMATS = ['dd MMM yyyy', 'dd/MM/yyyy', 'MMM dd, yyyy'];
const CURRENCIES = ['IDR', 'USD'];
const NUMBER_LOCALES = [
  { value: 'id-ID', label: 'Indonesia (1.250.000)' },
  { value: 'en-US', label: 'Inggris (1,250,000)' },
];
const TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore'];
const ROWS = [5, 10, 25, 50, 100];
const STATUSES = [
  { value: 'PLANNED', label: 'Terencana (PLANNED)' },
  { value: 'ONGOING', label: 'Berjalan (ONGOING)' },
  { value: 'COMPLETED', label: 'Selesai (COMPLETED)' },
];
const ROLE_VALUES = Object.keys(ROLE_LABEL) as Role[];
const MAX_LOGO_BYTES = 1_500 * 1024;
const STORED_LOGO_LIMIT = 380 * 1024;
const MAX_LOGO_DIM = 320;

function readOnce(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('hasil kosong'));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader gagal'));
    reader.onabort = () => reject(new Error('pembacaan dibatalkan'));
    reader.readAsDataURL(file);
  });
}

/** Baca berkas jadi data URL; pakai FileReader, dengan jalur cadangan arrayBuffer. */
async function fileToDataUrl(file: File): Promise<string> {
  let last: Error = new Error('tidak diketahui');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await readOnce(file);
    } catch (e) {
      last = e as Error;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length) {
          let bin = '';
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          return `data:${file.type || 'image/png'};base64,${window.btoa(bin)}`;
        }
      } catch (second) {
        last = second as Error;
      }
      // NotReadableError sering hanya sementara (berkas masih diunduh iCloud/OneDrive).
      if (attempt < 2) await new Promise((r) => setTimeout(r, 450));
    }
  }
  throw last;
}

/** Penjelasan ramah untuk kegagalan pembacaan berkas. */
function explainReadError(e: unknown): string {
  const name = (e as Error)?.name || '';
  if (name === 'NotReadableError' || /NotReadable/i.test((e as Error)?.message ?? '')) {
    return 'berkas sedang tidak bisa diakses sistem (mis. masih diunduh dari iCloud/OneDrive, atau sedang dipakai aplikasi lain). Salin dulu berkasnya ke folder lokal seperti Desktop, lalu pilih lagi';
  }
  if (name === 'SecurityError') {
    return 'akses berkas dibatasi oleh browser pada lingkungan ini. Simpan gambar ke folder lokal lalu pilih lagi';
  }
  if (name === 'NotFoundError' || name === 'AbortError') {
    return 'berkas tidak lagi ditemukan (mungkin dipindahkan/dihapus setelah dipilih). Pilih ulang berkasnya';
  }
  return `berkas tidak dapat dibaca (${name || 'penyebab tidak diketahui'})`;
}

/** Perkecil gambar raster agar hemat ukuran simpan. */
async function shrinkIfNeeded(dataUrl: string, mime: string): Promise<string> {
  if (mime === 'image/svg+xml') return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('gambar tidak dapat dibuka'));
      el.src = dataUrl;
    });
    if (img.width <= MAX_LOGO_DIM && img.height <= MAX_LOGO_DIM) return dataUrl;
    const scale = MAX_LOGO_DIM / Math.max(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}

const approxKb = (dataUrl: string) => {
  const kb = (dataUrl.length * 3) / 4 / 1024;
  return kb < 1 ? '<1' : String(Math.round(kb));
};

/** Cadangan: kirim berkas ke server bila browser tidak dapat membacanya (dengan satu percobaan ulang). */
async function readViaServer(file: File): Promise<string> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await uploadFile<{ settings: { identity: { logoDataUrl: string } } }>(
        '/settings/general/logo',
        file,
      );
      return res.settings.identity.logoDataUrl;
    } catch (e) {
      last = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw last instanceof Error ? last : new Error('server menolak berkas');
}

const isHttpUrl = (v: string) => /^https?:\/\/[^\s]+$/i.test(v.trim());

function GroupCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4 lg:p-5">
      <div className="mb-3">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="text-[12px] text-slate-400">{desc}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

export function GeneralSettingsManager() {
  const { settings, save, refreshFull } = useSettings();
  const [form, setForm] = useState<GeneralSettings>(settings);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const set = <K extends keyof GeneralSettings>(group: K, patch: Partial<GeneralSettings[K]>) =>
    setForm((f) => ({ ...f, [group]: { ...f[group], ...patch } }));

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(settings), [form, settings]);

  async function onFile(file: File | undefined, input?: HTMLInputElement) {
    // Event tanpa berkas (mis. penutupan dialog) tidak boleh menghapus status yang sudah tampil.
    if (!file) return;
    setLogoError('');
    setMsg('');
    const resetInput = () => {
      if (input) input.value = '';
    };
    const okType =
      /^image\/(png|jpeg|jpg|webp|svg\+xml)$/.test(file.type) ||
      /\.(png|jpe?g|webp|svg)$/i.test(file.name);
    if (!okType) {
      setLogoError('Format harus PNG, JPG, WEBP, atau SVG.');
      resetInput();
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(
        `Ukuran berkas maksimal 1,5 MB (berkas ini ${(file.size / 1024 / 1024).toFixed(2)} MB).`,
      );
      resetInput();
      return;
    }
    // Jalur 1: baca di perangkat lalu perkecil bila perlu.
    try {
      const raw = await fileToDataUrl(file);
      const mime = (raw.match(/^data:([^;]+);/) || [])[1] ?? file.type ?? 'image/png';
      const shrunk = await shrinkIfNeeded(raw, mime);
      if (shrunk.length > STORED_LOGO_LIMIT) {
        setLogoError(
          `Logo terlalu besar setelah diproses (${approxKb(shrunk)} KB). Gunakan gambar paling besar 320×320 px.`,
        );
        return;
      }
      set('identity', { logoDataUrl: shrunk });
      setMsg(
        `Logo ${file.name || 'berkas'} siap disimpan (${approxKb(shrunk)} KB). Tekan “Simpan Konfigurasi Umum”.`,
      );
      return;
    } catch (clientError) {
      // Catatan tenang: browser gagal membaca lokal; kita lanjut lewat jalur server.
      console.warn('[logo] pembacaan berkas di perangkat tidak tersedia, mencoba jalur server:', (clientError as Error)?.name);
      // Jalur 2: biarkan server yang membaca berkas (multipart) lalu sinkronkan setelan.
      try {
        await readViaServer(file);
        await refreshFull();
        setMsg(
          'Logo tersimpan lewat jalur server karena pembacaan berkas di perangkat sedang tidak tersedia.',
        );
        return;
      } catch (serverError) {
        const srv = (serverError as Error)?.message || 'server menolak berkas';
        setLogoError(
          `Logo belum bisa dipakai: ${explainReadError(clientError)}. Jalur unggah server: ${srv}.`,
        );
      }
    } finally {
      resetInput();
    }
  }

  async function submit() {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await save(form);
      setMsg('Konfigurasi Umum tersimpan dan langsung berlaku.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan konfigurasi');
    } finally {
      setBusy(false);
    }
  }

  const periodLabel =
    form.period.label || `${form.period.semester} ${form.period.year}`;

  return (
    <div className="space-y-4">
      {error ? <ErrorNote message={error} /> : null}
      {msg ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {msg}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <GroupCard title="Identitas Organisasi" desc="Tampil di halaman masuk, sidebar, dan dokumen resmi.">
          <div className="flex items-center gap-3">
            {form.identity.logoDataUrl ? (
              <img
                src={form.identity.logoDataUrl}
                alt="Logo"
                className="h-14 w-14 rounded-2xl border border-slate-200 bg-white object-contain p-1"
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-lg font-bold text-slate-300">
                {(form.identity.brandName || 'I').trim().charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => void onFile(e.target.files?.[0], e.currentTarget)}
                className="block w-full text-[12px] text-slate-500 file:mr-2 file:rounded-full file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-indigo-700"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                PNG/JPG/WEBP/SVG · maks 1,5 MB (otomatis diperkecil ke maks 320 px)
              </p>
              {form.identity.logoDataUrl ? (
                <button
                  type="button"
                  onClick={() => set('identity', { logoDataUrl: '' })}
                  className="mt-1 text-[11px] font-semibold text-[#E53935] underline"
                >
                  Hapus logo
                </button>
              ) : null}
            </div>
          </div>
          {logoError ? <p className="text-[12px] text-rose-600">{logoError}</p> : null}
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="mb-1.5 text-[12px] font-semibold text-slate-600">
              Alternatif: pakai URL gambar
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…/logo.png"
                className="min-w-56 flex-1"
              />
              <Button
                variant="outline"
                onClick={() => {
                  const url = logoUrl.trim();
                  if (!isHttpUrl(url)) {
                    setLogoError('URL harus diawali http:// atau https://');
                    return;
                  }
                  setLogoError('');
                  set('identity', { logoDataUrl: url });
                  setMsg('URL logo dipakai. Tekan “Simpan Konfigurasi Umum”.');
                }}
              >
                Pakai URL
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Berguna bila berkas tersangkut di iCloud/OneDrive dan tidak bisa dibaca browser.
            </p>
          </div>
          <Field label="Nama legal">
            <Input
              value={form.identity.legalName}
              onChange={(e) => set('identity', { legalName: e.target.value })}
              placeholder="PT Intimakna"
            />
          </Field>
          <Field label="Nama brand (tampil di aplikasi)">
            <Input
              value={form.identity.brandName}
              onChange={(e) => set('identity', { brandName: e.target.value })}
              placeholder="Intimakna TMS"
            />
          </Field>
          <Field label="Tagline">
            <Input
              value={form.identity.tagline}
              onChange={(e) => set('identity', { tagline: e.target.value })}
              placeholder="Training Management System"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kota">
              <Input
                value={form.identity.city}
                onChange={(e) => set('identity', { city: e.target.value })}
              />
            </Field>
            <Field label="Telepon / WhatsApp">
              <Input
                value={form.identity.phone}
                onChange={(e) => set('identity', { phone: e.target.value })}
                placeholder="08xx"
              />
            </Field>
            <Field label="Email resmi">
              <Input
                value={form.identity.email}
                onChange={(e) => set('identity', { email: e.target.value })}
              />
            </Field>
            <Field label="Website">
              <Input
                value={form.identity.website}
                onChange={(e) => set('identity', { website: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Alamat">
            <Input
              value={form.identity.address}
              onChange={(e) => set('identity', { address: e.target.value })}
            />
          </Field>
          <Field label="NPWP / nomor izin (opsional)">
            <Input
              value={form.identity.taxId}
              onChange={(e) => set('identity', { taxId: e.target.value })}
            />
          </Field>
        </GroupCard>

        <div className="space-y-4">
          <GroupCard title="Bahasa & Format" desc="Menentukan tampilan tanggal dan nilai uang di seluruh aplikasi.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Format tanggal">
                <Select
                  value={form.locale.dateFormat}
                  onChange={(e) => set('locale', { dateFormat: e.target.value })}
                >
                  {DATE_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Mata uang">
                <Select
                  value={form.locale.currency}
                  onChange={(e) => set('locale', { currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Format angka">
                <Select
                  value={form.locale.numberLocale}
                  onChange={(e) => set('locale', { numberLocale: e.target.value })}
                >
                  {NUMBER_LOCALES.map((n) => (
                    <option key={n.value} value={n.value}>
                      {n.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Zona waktu">
                <Select
                  value={form.locale.timezone}
                  onChange={(e) => set('locale', { timezone: e.target.value })}
                >
                  {TIMEZONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Awal minggu">
                <Select
                  value={form.locale.weekStart}
                  onChange={(e) => set('locale', { weekStart: e.target.value as 'monday' | 'sunday' })}
                >
                  <option value="monday">Senin</option>
                  <option value="sunday">Minggu</option>
                </Select>
              </Field>
              <Field label="Format jam">
                <Select
                  value={form.locale.timeFormat}
                  onChange={(e) => set('locale', { timeFormat: e.target.value as '24h' | '12h' })}
                >
                  <option value="24h">24 jam</option>
                  <option value="12h">12 jam (AM/PM)</option>
                </Select>
              </Field>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
              Contoh: <b className="text-slate-700">{money(1250000)}</b> ·{' '}
              <b className="text-slate-700">{fmtDate(new Date().toISOString())}</b>
            </div>
          </GroupCard>

          <GroupCard title="Periode Berjalan" desc="Dipakai sebagai usulan nama kelas baru dan penanda laporan.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Semester">
                <Select
                  value={form.period.semester}
                  onChange={(e) =>
                    set('period', {
                      semester: e.target.value as 'GANJIL' | 'GENAP',
                      label: `${e.target.value} ${form.period.year}`,
                    })
                  }
                >
                  <option value="GANJIL">Ganjil</option>
                  <option value="GENAP">Genap</option>
                </Select>
              </Field>
              <Field label="Tahun">
                <Input
                  type="number"
                  value={form.period.year}
                  onChange={(e) =>
                    set('period', {
                      year: Number(e.target.value),
                      label: `${form.period.semester} ${Number(e.target.value)}`,
                    })
                  }
                />
              </Field>
              <Field label="Label periode">
                <Input
                  value={form.period.label}
                  onChange={(e) => set('period', { label: e.target.value })}
                  placeholder="GANJIL 2026"
                />
              </Field>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
              Nama kelas baru akan diusulkan sebagai <b className="text-slate-700">{periodLabel}</b>.
            </div>
          </GroupCard>
        </div>

        <GroupCard title="Operasional Default" desc="Nilai awal saat membuat kelas, akun, dan daftar.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Baris per halaman bawaan">
              <Select
                value={String(form.defaults.rowsPerPage)}
                onChange={(e) => set('defaults', { rowsPerPage: Number(e.target.value) })}
              >
                {ROWS.map((r) => (
                  <option key={r} value={r}>
                    {r} baris
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status kelas saat dibuat">
              <Select
                value={form.defaults.classStatus}
                onChange={(e) => set('defaults', { classStatus: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Harga default Kelas Reguler (per peserta)">
              <Input
                type="number"
                value={form.defaults.regularPrice}
                onChange={(e) => set('defaults', { regularPrice: Number(e.target.value) })}
              />
            </Field>
            <Field label="Peran default akun baru">
              <Select
                value={form.defaults.newUserRole}
                onChange={(e) => set('defaults', { newUserRole: e.target.value })}
              >
                {ROLE_VALUES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Jam kerja mulai (follow-up)">
              <Input
                type="time"
                value={form.defaults.workStart}
                onChange={(e) => set('defaults', { workStart: e.target.value })}
              />
            </Field>
            <Field label="Jam kerja selesai">
              <Input
                type="time"
                value={form.defaults.workEnd}
                onChange={(e) => set('defaults', { workEnd: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-[11px] text-slate-400">
            Jam kerja dipakai sebagai dasar pengingat follow-up (fitur pengingat menyusul).
          </p>
        </GroupCard>

        <GroupCard title="Tampilan Organisasi" desc="Warna aksen dan kepadatan tabel untuk seluruh pengguna.">
          <Field label="Warna aksen">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={form.appearance.accent}
                onChange={(e) => set('appearance', { accent: e.target.value.toUpperCase() })}
                className="h-9 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
              />
              <Input
                value={form.appearance.accent}
                onChange={(e) => set('appearance', { accent: e.target.value.toUpperCase() })}
                className="max-w-[120px]"
              />
              <div className="flex gap-1.5">
                {ACCENT_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => set('appearance', { accent: c })}
                    style={{ background: c }}
                    className={
                      'h-7 w-7 rounded-full border transition ' +
                      (form.appearance.accent === c ? 'border-slate-900' : 'border-white shadow-sm')
                    }
                  />
                ))}
              </div>
            </div>
          </Field>
          <Field label="Kepadatan tabel">
            <div className="flex gap-2">
              {(['comfortable', 'compact'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('appearance', { density: d })}
                  className={
                    'rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ' +
                    (form.appearance.density === d
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }
                >
                  {d === 'comfortable' ? 'Nyaman' : 'Padat'}
                </button>
              ))}
            </div>
          </Field>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
            Aksen berlaku pada tombol utama, menu aktif, sidebar, dan penanda penting lain.
          </div>
        </GroupCard>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={busy || !dirty}>
          {busy ? 'Menyimpan…' : 'Simpan Konfigurasi Umum'}
        </Button>
        <Button variant="outline" onClick={() => setForm(settings)} disabled={busy || !dirty}>
          Kembalikan
        </Button>
        {dirty ? (
          <span className="text-[12px] text-amber-600">Ada perubahan yang belum disimpan.</span>
        ) : (
          <span className="text-[12px] text-slate-400">Tersimpan.</span>
        )}
      </div>
    </div>
  );
}
