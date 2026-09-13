'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAccessToken } from '@/lib/api';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { useSettings } from '@/lib/settings';

export default function LoginPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const brand = settings.identity.brandName || 'Intimakna TMS';
  const brandInitial = brand.trim().charAt(0).toUpperCase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      setAccessToken(data.accessToken);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Panel brand */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(700px 420px at 20% -10%, rgba(238,58,52,.5), transparent 60%), radial-gradient(600px 380px at 90% 110%, rgba(245,179,1,.28), transparent 60%)',
          }}
        />
        <div className="relative flex items-center gap-3">
          {settings.identity.logoDataUrl ? (
            <img
              src={settings.identity.logoDataUrl}
              alt={brand}
              className="h-10 w-10 rounded-xl bg-white/95 object-contain p-0.5"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-base font-bold">
              {brandInitial}
            </div>
          )}
          <div>
            <p className="font-semibold">{brand}</p>
            <p className="text-xs text-slate-400">
              {settings.identity.tagline || 'Training Management System'}
            </p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight">
            Kelola pelatihan, alumni, dan profitabilitas batch dalam satu sistem.
          </h1>
          <ul className="mt-6 space-y-3 text-sm text-slate-300">
            <li className="flex gap-2.5">
              <span className="text-[#F5B301]">✓</span> Pipeline leads dari WhatsApp, telepon,
              hingga referensi alumni
            </li>
            <li className="flex gap-2.5">
              <span className="text-[#F5B301]">✓</span> Inquiry instan riwayat alumni untuk
              strategi cross-selling
            </li>
            <li className="flex gap-2.5">
              <span className="text-[#F5B301]">✓</span> Visibilitas cost & profit per batch secara
              real-time
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} {settings.identity.legalName || 'PT Intimakna'} — sistem internal
        </p>
      </div>

      {/* Form */}
      <div className="flex min-w-0 flex-1 items-center justify-center bg-slate-50 px-5 py-8 lg:px-6">
        <div className="w-full min-w-0 max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              {settings.identity.logoDataUrl ? (
                <img
                  src={settings.identity.logoDataUrl}
                  alt={brand}
                  className="h-9 w-9 rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
                  {brandInitial}
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-900">{brand}</p>
                <p className="text-xs text-slate-400">
                  {settings.identity.tagline || 'Training Management System'}
                </p>
              </div>
            </div>
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 lg:text-2xl">Masuk</h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">
            Gunakan akun yang diberikan oleh admin sistem.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="nama@intimakna.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorNote message={error} />
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Memeriksa…' : 'Masuk'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
