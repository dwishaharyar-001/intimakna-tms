'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { cn, getRuntimeRowsPerPage, onRuntimeRowsPerPageChange } from '@/lib/core';

// ---------- Button ----------
type ButtonVariant = 'primary' | 'outline' | 'danger' | 'ghost' | 'green';

const BTN: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700',
  green: 'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600',
  outline: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-[11px] lg:text-xs' : 'px-3.5 py-1.5 text-[13px] lg:px-4 lg:py-2 lg:text-sm',
        BTN[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---------- Form controls ----------
const CTRL =
  'w-full rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400 lg:px-4 lg:py-2 lg:text-sm';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CTRL, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CTRL, 'pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-[13px] font-medium text-slate-600 lg:text-sm">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

// ---------- Layout primitives ----------
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[20px] border border-slate-100 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_6px_18px_-6px_rgba(0,0,0,0.06)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:mb-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900 lg:text-[22px]">{title}</h1>
        {desc ? <p className="mt-0.5 text-[13px] text-slate-500 lg:text-sm">{desc}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap lg:px-2.5 lg:text-xs',
        className ?? 'bg-slate-100 text-slate-500',
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  tone = 'default',
  sub,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'bad' | 'accent';
  sub?: string;
}) {
  const tones: Record<string, string> = {
    default: 'text-slate-900',
    good: 'text-emerald-600',
    bad: 'text-rose-600',
    accent: 'text-indigo-600',
  };
  return (
    <Card className="px-4 py-3 lg:px-5 lg:py-4">
      <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase lg:text-[11px]">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums tracking-tight lg:text-2xl', tones[tone])}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-400">{sub}</p> : null}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">
      {message}
    </div>
  );
}

/** Pilihan jumlah baris per halaman yang tersedia. */
export const ROWS_OPTIONS = [5, 10, 25, 50, 100, 250];

/**
 * Preferensi jumlah baris per halaman milik pengguna.
 * Disimpan di perangkat (localStorage) per kunci halaman, mis. `itm:rows:alumni`.
 */
export function useRowsPerPage(key: string, fallback = getRuntimeRowsPerPage()) {
  const storageKey = `itm:rows:${key}`;
  const [pageSize, setPageSizeState] = useState<number>(fallback);
  const pinned = useRef(false);

  useEffect(() => {
    try {
      const raw = Number(window.localStorage.getItem(storageKey));
      if (ROWS_OPTIONS.includes(raw)) {
        pinned.current = true;
        setPageSizeState(raw);
      }
    } catch {
      /* localStorage tidak tersedia — pakai bawaan */
    }
  }, [storageKey]);

  // Selama pengguna belum memilih sendiri, ikuti default organisasi (Konfigurasi Umum).
  useEffect(() => {
    if (pinned.current) return;
    return onRuntimeRowsPerPageChange((rows) => {
      if (!pinned.current) setPageSizeState(rows);
    });
  }, []);

  const setPageSize = useCallback(
    (next: number) => {
      const value = ROWS_OPTIONS.includes(next) ? next : fallback;
      pinned.current = true;
      setPageSizeState(value);
      try {
        window.localStorage.setItem(storageKey, String(value));
      } catch {
        /* abaikan */
      }
    },
    [storageKey, fallback],
  );

  return [pageSize, setPageSize] as const;
}

/** Reset halaman ke 1 saat jumlah baris berubah. */
export function useResetPageOnSize(rows: number, reset: (page: number) => void) {
  useEffect(() => {
    reset(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
}

/** Navigasi halaman daftar: Previous / Next + info rentang + pengatur jumlah baris. */
export function Pager({
  page,
  total,
  limit = 10,
  onChange,
  rows,
  onRowsChange,
  rowsOptions = ROWS_OPTIONS,
  rowsLabel = 'Baris/hal.',
  className,
  compact,
}: {
  page: number;
  total: number;
  limit?: number;
  onChange: (page: number) => void;
  rows?: number;
  onRowsChange?: (rows: number) => void;
  rowsOptions?: number[];
  rowsLabel?: string;
  className?: string;
  compact?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const showRows = typeof rows === 'number' && typeof onRowsChange === 'function';
  return (
    <div className={cn('flex flex-wrap items-center gap-2', compact ? 'justify-between' : 'justify-between', className)}>
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Previous
      </Button>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">
          {from}–{to} dari {total} · hal. {page}/{pages}
        </span>
        {showRows ? (
          <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Atur sendiri berapa baris data yang tampil per halaman">
            {rowsLabel}
            <select
              value={rows}
              onChange={(e) => onRowsChange(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 outline-none focus:border-rose-300"
            >
              {rowsOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              {rowsOptions.includes(rows) ? null : <option value={rows}>{rows}</option>}
            </select>
          </label>
        ) : null}
      </div>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next ›
      </Button>
    </div>
  );
}

// ---------- Table ----------
export const thCls =
  'px-3 py-2 text-left text-[11px] font-semibold text-slate-400 whitespace-nowrap lg:px-4 lg:py-3 lg:text-xs';
export const tdCls = 'border-t border-slate-100 px-3 py-2 align-middle lg:px-4 lg:py-3';

// ---------- Elemen khas referensi ----------
export function Stars({ value, max = 5, className }: { value: number; max?: number; className?: string }) {
  const rounded = Math.round(Math.max(0, Math.min(value, max)));
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-sm leading-none', className)}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < rounded ? 'star' : 'star-off'}>
          ★
        </span>
      ))}
    </span>
  );
}

const RING_COLORS = ['#29B6F6', '#F5B301', '#EE3A34', '#7E57C2'];

export function RingAvatar({
  letter,
  size = 44,
  ringWidth = 3,
}: {
  letter: string;
  size?: number;
  ringWidth?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        padding: ringWidth,
        background: `conic-gradient(${RING_COLORS[0]} 0 25%, ${RING_COLORS[1]} 25% 50%, ${RING_COLORS[2]} 50% 75%, ${RING_COLORS[3]} 75% 100%)`,
      }}
    >
      <span
        className="flex h-full w-full items-center justify-center rounded-full bg-white font-bold text-indigo-600"
        style={{ fontSize: size * 0.42 }}
      >
        {letter.slice(0, 1).toUpperCase()}
      </span>
    </span>
  );
}

export function Donut({
  segments,
  size = 128,
  thickness = 15,
  centerLabel,
  centerSub,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const stops =
    total > 0
      ? (() => {
          let acc = 0;
          const parts: string[] = [];
          for (const s of segments) {
            if (s.value <= 0) continue;
            const from = (acc / total) * 100;
            acc += s.value;
            const to = (acc / total) * 100;
            parts.push(`${s.color} ${from}% ${to}%`);
          }
          return parts.length ? parts.join(', ') : '#E2E2E6 0% 100%';
        })()
      : '#E2E2E6 0% 100%';

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="donut block h-full w-full"
        style={{ background: `conic-gradient(${stops})`, ['--donut-w' as string]: `${thickness}px` }}
      />
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        {centerLabel ? (
          <span className="text-xl font-extrabold tracking-tight text-slate-900">{centerLabel}</span>
        ) : null}
        {centerSub ? <span className="text-[10px] font-medium text-slate-400">{centerSub}</span> : null}
      </span>
    </span>
  );
}
