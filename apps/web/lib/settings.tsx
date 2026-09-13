'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import {
  setRuntimeFormats,
  setRuntimeRowsPerPage,
  DEFAULT_RUNTIME_FORMATS,
} from '@/lib/core';

export interface GeneralSettings {
  identity: {
    legalName: string;
    brandName: string;
    tagline: string;
    address: string;
    city: string;
    phone: string;
    email: string;
    website: string;
    taxId: string;
    logoDataUrl: string;
  };
  locale: {
    language: 'id' | 'en';
    dateFormat: string;
    currency: string;
    numberLocale: string;
    timezone: string;
    weekStart: 'monday' | 'sunday';
    timeFormat: '24h' | '12h';
  };
  period: { semester: 'GANJIL' | 'GENAP'; year: number; label: string };
  defaults: {
    rowsPerPage: number;
    classStatus: string;
    regularPrice: number;
    newUserRole: string;
    workStart: string;
    workEnd: string;
  };
  appearance: { accent: string; density: 'comfortable' | 'compact'; theme: 'light' };
}

export const FALLBACK_SETTINGS: GeneralSettings = {
  identity: {
    legalName: 'PT Intimakna',
    brandName: 'Intimakna TMS',
    tagline: 'Training Management System',
    address: '',
    city: '',
    phone: '',
    email: '',
    website: '',
    taxId: '',
    logoDataUrl: '',
  },
  locale: { ...DEFAULT_RUNTIME_FORMATS, language: 'id', timezone: 'Asia/Jakarta', weekStart: 'monday' },
  period: { semester: 'GANJIL', year: new Date().getFullYear(), label: 'GANJIL' },
  defaults: {
    rowsPerPage: 10,
    classStatus: 'PLANNED',
    regularPrice: 0,
    newUserRole: 'SALES_MARKETING',
    workStart: '08:00',
    workEnd: '17:00',
  },
  appearance: { accent: '#E53935', density: 'comfortable', theme: 'light' },
};

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`;

/** Campur warna dengan putih (amount>0) atau hitam (amount<0). */
const mix = (hex: string, amount: number) => {
  const { r, g, b } = hexToRgb(hex);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t);
};

/** Bangun skala aksen 50–950 dari satu warna pilihan, lalu pasang ke variabel tema. */
function applyAccent(accent: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  const scale: Record<string, string> = {
    '50': mix(accent, 0.94),
    '100': mix(accent, 0.88),
    '200': mix(accent, 0.74),
    '300': mix(accent, 0.55),
    '400': mix(accent, 0.3),
    '500': mix(accent, 0.12),
    '600': accent,
    '700': mix(accent, -0.12),
    '800': mix(accent, -0.28),
    '900': mix(accent, -0.44),
    '950': mix(accent, -0.58),
  };
  for (const [step, color] of Object.entries(scale)) {
    root.style.setProperty(`--color-indigo-${step}`, color);
  }
  root.style.setProperty('--color-rose-600', mix(accent, -0.05));
  root.style.setProperty('--brand-soft', mix(accent, 0.88));
}

/** Terapkan format & tema ke seluruh aplikasi (tanpa reload). */
function applySettings(s: GeneralSettings) {
  setRuntimeFormats({
    numberLocale: s.locale.numberLocale,
    currency: s.locale.currency,
    dateFormat: s.locale.dateFormat,
    timeFormat: s.locale.timeFormat,
  });
  setRuntimeRowsPerPage(s.defaults.rowsPerPage);
  applyAccent(s.appearance.accent);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.density = s.appearance.density;
  }
}

interface Ctx {
  settings: GeneralSettings;
  ready: boolean;
  isSuperAdmin: boolean;
  refresh: () => Promise<void>;
  refreshFull: () => Promise<void>;
  save: (patch: Partial<GeneralSettings>) => Promise<GeneralSettings>;
}

const SettingsContext = createContext<Ctx | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<GeneralSettings>(FALLBACK_SETTINGS);
  const [ready, setReady] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const pub = await api<Partial<GeneralSettings>>('/settings/public', { auth: false });
      const merged = mergeSettings(pub);
      setSettings(merged);
      applySettings(merged);
    } catch {
      applySettings(FALLBACK_SETTINGS);
    } finally {
      setReady(true);
    }
  }, []);

  const refreshFull = useCallback(async () => {
    try {
      const res = await api<{ settings: GeneralSettings }>('/settings/general');
      const merged = mergeSettings(res.settings);
      setSettings(merged);
      applySettings(merged);
    } catch {
      /* belum login atau bukan pengguna tersedia — tetap pakai setelan publik */
    }
  }, []);

  const save = useCallback(async (patch: Partial<GeneralSettings>) => {
    const res = await api<{ settings: GeneralSettings }>('/settings/general', {
      method: 'PUT',
      body: patch,
    });
    const merged = mergeSettings(res.settings);
    setSettings(merged);
    applySettings(merged);
    return merged;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('itm:me');
      setIsSuperAdmin(raw ? JSON.parse(raw)?.role === 'SUPER_ADMIN' : false);
    } catch {
      setIsSuperAdmin(false);
    }
  }, []);

  const value = useMemo(
    () => ({ settings, ready, isSuperAdmin, refresh, refreshFull, save }),
    [settings, ready, isSuperAdmin, refresh, refreshFull, save],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function mergeSettings(raw: Partial<GeneralSettings> | null | undefined): GeneralSettings {
  const s = raw ?? {};
  return {
    identity: { ...FALLBACK_SETTINGS.identity, ...(s.identity ?? {}) },
    locale: { ...FALLBACK_SETTINGS.locale, ...(s.locale ?? {}) },
    period: { ...FALLBACK_SETTINGS.period, ...(s.period ?? {}) },
    defaults: { ...FALLBACK_SETTINGS.defaults, ...(s.defaults ?? {}) },
    appearance: { ...FALLBACK_SETTINGS.appearance, ...(s.appearance ?? {}) },
  };
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings harus dipakai di dalam AppSettingsProvider');
  return ctx;
}
