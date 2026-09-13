'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { api, logout } from '@/lib/api';
import { cn, ROLE_LABEL, type Role } from '@/lib/core';
import { useSettings } from '@/lib/settings';
import { RingAvatar } from '@/components/ui';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: Role[];
  badge?: 'leads-open';
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦', roles: [] },
  { href: '/leads', label: 'Leads Pipeline', icon: '◈', roles: ['SALES_MARKETING', 'ADMIN_TRAINING', 'MANAGEMENT'], badge: 'leads-open' },
  { href: '/alumni', label: 'Alumni', icon: '◎', roles: ['SALES_MARKETING', 'ADMIN_TRAINING', 'MANAGEMENT'] },
  { href: '/prospects', label: 'Prospek', icon: '🎯', roles: ['SALES_MARKETING', 'ADMIN_TRAINING', 'MANAGEMENT'] },
  { href: '/batches', label: 'Pelatihan', icon: '☰', roles: [] },
  { href: '/financials', label: 'Keuangan', icon: '₨', roles: ['FINANCE', 'MANAGEMENT', 'ADMIN_TRAINING'] },
  { href: '/users', label: 'Pengguna', icon: '☺', roles: ['MANAGEMENT', 'ADMIN_TRAINING'] },
  { href: '/settings', label: 'Konfigurasi', icon: '⚙', roles: ['SUPER_ADMIN'] },
];

function useOpenLeadsCount(meRole: Role | undefined) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!meRole || !['SALES_MARKETING', 'ADMIN_TRAINING', 'MANAGEMENT', 'SUPER_ADMIN'].includes(meRole)) return;
    let alive = true;
    Promise.all(
      ['NEW', 'CONTACTED', 'PROPOSAL_SENT'].map((s) =>
        api<{ total: number }>(`/leads?status=${s}&limit=1`).catch(() => ({ total: 0 })),
      ),
    ).then((rows) => {
      if (alive) setCount(rows.reduce((a, r) => a + r.total, 0));
    });
    return () => {
      alive = false;
    };
  }, [meRole]);
  return count;
}

// ---------- Preferensi sidebar (per pengguna, tersimpan di perangkat) ----------
const NAV_DEFAULT = 232;
const NAV_MIN = 188;
const NAV_MAX = 380;

function useNavPrefs() {
  const [width, setWidthState] = useState(NAV_DEFAULT);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const w = Number(window.localStorage.getItem('itm:nav:width'));
      if (Number.isFinite(w) && w >= NAV_MIN && w <= NAV_MAX) setWidthState(Math.round(w));
      const v = window.localStorage.getItem('itm:nav:visible');
      if (v === '0') setVisible(false);
    } catch {
      /* abaikan */
    }
    setReady(true);
  }, []);

  const setWidth = useCallback((w: number) => {
    const clamped = Math.max(NAV_MIN, Math.min(NAV_MAX, Math.round(w)));
    setWidthState(clamped);
    try {
      window.localStorage.setItem('itm:nav:width', String(clamped));
    } catch {
      /* abaikan */
    }
  }, []);

  const toggle = useCallback(() => {
    setVisible((v) => {
      try {
        window.localStorage.setItem('itm:nav:visible', v ? '0' : '1');
      } catch {
        /* abaikan */
      }
      return !v;
    });
  }, []);

  return { width, setWidth, visible, toggle, ready };
}

function Sidebar({
  open,
  onClose,
  width,
  onWidthChange,
  collapsed,
}: {
  open: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  collapsed: boolean;
}) {
  const { me, signOut } = useAuth();
  const { settings } = useSettings();
  const pathname = usePathname();
  const openLeads = useOpenLeadsCount(me?.role);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const NAV_RAIL = 76;

  const startResize = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      setDragging(true);
      const onMove = (ev: PointerEvent) => {
        onWidthChange(startWidth + (ev.clientX - startX));
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [width, onWidthChange],
  );

  if (!me) return null;

  const items = NAV.filter(
    (n) => n.roles.length === 0 || me.role === 'SUPER_ADMIN' || n.roles.includes(me.role),
  );

  return (
    <aside
      style={{ '--nav-w': `${collapsed ? NAV_RAIL : width}px` } as CSSProperties}
      className={cn(
        'relative z-40 flex w-[232px] shrink-0 flex-col bg-indigo-600 text-white shadow-[0_10px_30px_-8px_rgba(238,58,52,0.45)] transition-[transform,width,opacity] duration-200',
        'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[268px] max-lg:rounded-r-[26px] max-lg:shadow-2xl',
        open ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
        'm-0 rounded-[26px] lg:static lg:m-3 lg:mr-0 lg:translate-x-0 lg:w-[var(--nav-w)] lg:opacity-100',
        dragging ? 'lg:select-none' : null,
      )}
    >
      {/* Gagang geser lebar (khusus desktop, saat menu lengkap) */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ubah lebar sidebar"
        title="Seret untuk memperkecil/memperlebar sidebar · klik 2× untuk lebar bawaan"
        onPointerDown={startResize}
        onDoubleClick={() => onWidthChange(NAV_DEFAULT)}
        className={cn(
          'absolute inset-y-6 -right-1 z-50 hidden w-3 cursor-col-resize',
          'after:absolute after:inset-y-2 after:left-1/2 after:w-1 after:-translate-x-1/2 after:rounded-full after:transition',
          dragging ? 'after:bg-white/80' : 'after:bg-white/0 hover:after:bg-white/60',
          collapsed ? 'lg:hidden' : 'lg:block',
        )}
      />
      {/* Logo */}
      <div
        className={cn(
          'flex items-center gap-2.5 px-5 pt-5 pb-3.5 lg:pt-6 lg:pb-4',
          collapsed ? 'lg:justify-center lg:gap-0 lg:px-0' : null,
        )}
      >
        {settings.identity.logoDataUrl ? (
          <img
            src={settings.identity.logoDataUrl}
            alt={settings.identity.brandName}
            className="h-10 w-10 rounded-2xl bg-white object-contain p-0.5 shadow-sm"
          />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-base font-extrabold text-indigo-600 shadow-sm">
            {(settings.identity.brandName || 'I').trim().charAt(0).toUpperCase()}
          </span>
        )}
        <span className={cn('min-w-0', collapsed ? 'lg:hidden' : null)}>
          <span className="block truncate text-[15px] leading-tight font-bold tracking-tight">
            {settings.identity.brandName || 'Intimakna'}
          </span>
          <span className="block truncate text-[10px] font-medium tracking-widest text-white/60 uppercase">
            {settings.identity.tagline || 'Training Management System'}
          </span>
        </span>
        <button
          onClick={onClose}
          aria-label="Tutup menu"
          className="ml-auto rounded-full px-2 py-1 text-white/80 transition hover:bg-white/15 lg:hidden"
        >
          ✕
        </button>
      </div>

      {/* Menu */}
      <nav
        className={cn('flex-1 space-y-1 overflow-y-auto py-1.5', collapsed ? 'px-3 lg:px-2' : 'px-3')}
      >
        {items.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + '/');
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onClose}
              onMouseEnter={() => setHovered(n.href)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(n.href)}
              onBlur={() => setHovered(null)}
              className={cn(
                'group/item relative mx-1 flex h-10 items-center gap-3 rounded-[14px] px-3.5 text-[13px] transition lg:h-11 lg:text-sm',
                active
                  ? 'bg-white font-semibold text-indigo-600 shadow-sm before:absolute before:top-[-10px] before:left-[-9px] before:h-5 before:w-5 before:rounded-full before:bg-white after:absolute after:bottom-[-10px] after:left-[-9px] after:h-5 after:w-5 after:rounded-full after:bg-white'
                  : 'text-white/90 hover:bg-white/10 hover:text-white',
                collapsed ? 'lg:mx-auto lg:h-11 lg:w-11 lg:justify-center lg:gap-0 lg:px-0' : null,
              )}
            >
              <span className="w-4 text-center text-base leading-none">{n.icon}</span>
              <span className={cn('truncate', collapsed ? 'lg:hidden' : null)}>{n.label}</span>
              {n.badge === 'leads-open' && openLeads !== null && openLeads > 0 ? (
                <span
                  className={cn(
                    'ml-auto rounded-full px-2 py-0.5 text-[11px] leading-none font-bold',
                    active ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-indigo-600',
                    collapsed ? 'lg:hidden' : null,
                  )}
                >
                  {openLeads}
                </span>
              ) : null}
              {collapsed && n.badge === 'leads-open' && openLeads !== null && openLeads > 0 ? (
                <span className="absolute top-1.5 right-1.5 hidden h-2 w-2 rounded-full bg-amber-300 lg:block" />
              ) : null}
              {collapsed && hovered === n.href ? (
                <span className="pointer-events-none absolute top-1/2 left-full z-[60] ml-3 hidden -translate-y-1/2 rounded-xl bg-slate-900/95 px-2.5 py-1.5 text-[12px] font-semibold whitespace-nowrap text-white opacity-0 shadow-xl transition-opacity duration-150 lg:block lg:opacity-100">
                  {n.label}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Bawah: logout + role */}
      <div className={cn('space-y-1.5 px-4 pt-2 pb-4 lg:pb-5', collapsed ? 'lg:px-2' : null)}>
        <button
          onClick={signOut}
          title="Keluar dari akun"
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-full bg-[#C62828] py-2.5 text-[13px] font-semibold transition hover:bg-[#AB2121] lg:text-sm',
            collapsed ? 'lg:h-11 lg:w-11 lg:gap-0 lg:px-0' : null,
          )}
        >
          <span className="text-base leading-none">⎋</span>
          <span className={cn(collapsed ? 'lg:hidden' : null)}>Logout</span>
        </button>
        <p
          className={cn(
            'text-center text-[10px] font-medium tracking-widest text-white/70 uppercase',
            collapsed ? 'lg:hidden' : null,
          )}
        >
          {ROLE_LABEL[me.role]}
        </p>
      </div>
    </aside>
  );
}

function Topbar({
  onMenu,
  navVisible,
  onToggleNav,
}: {
  onMenu: () => void;
  navVisible: boolean;
  onToggleNav: () => void;
}) {
  const { me, signOut } = useAuth();
  const { settings } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!me) return null;

  return (
    <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-1 lg:justify-end lg:px-6 lg:pt-5">
      {/* Tombol tampil/sembunyi sidebar — desktop */}
      <button
        onClick={onToggleNav}
        aria-label={navVisible ? 'Perkecil sidebar ke mode ikon' : 'Tampilkan sidebar lengkap'}
        aria-pressed={!navVisible}
        title={`${navVisible ? 'Perkecil jadi mode ikon' : 'Tampilkan menu lengkap'} (Ctrl/Cmd + B)`}
        className="hidden h-9 items-center gap-2 rounded-full bg-white px-3.5 text-[12px] font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 lg:inline-flex"
      >
        <span className="text-sm leading-none">{navVisible ? '⇤' : '⇥'}</span>
        {navVisible ? 'Mode ikon' : 'Menu lengkap'}
      </button>

      {/* Kiri: hanya di mobile */}
      <div className="flex items-center gap-2 lg:hidden">
        <button
          onClick={onMenu}
          aria-label="Buka menu"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-sm transition hover:bg-slate-50"
        >
          ☰
        </button>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-xs font-extrabold text-white">
          {(settings.identity.brandName || 'I').trim().charAt(0).toUpperCase()}
        </span>
      </div>

      <div className="flex items-center gap-2.5 lg:gap-4">
        <div className="text-right">
          <p className="hidden text-[11px] text-slate-400 sm:block">Selamat datang,</p>
          <p className="text-[13px] leading-tight font-bold text-indigo-600 lg:text-sm">{me.name}</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#EE3A34]/60"
            aria-label="Menu akun"
          >
            <RingAvatar letter={me.name} size={38} />
            <span className="hidden text-xs text-slate-400 sm:inline">▾</span>
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-100 bg-white py-1 shadow-xl">
              <p className="px-4 py-2 text-xs text-slate-400">{me.email}</p>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  void logout().then(() => window.location.assign('/login'));
                }}
                className="block w-full px-4 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
              >
                Keluar
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const pathname = usePathname();
  const [refresh, setRefresh] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const nav = useNavPrefs();
  const reload = useCallback(() => setRefresh((r) => r + 1), []);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  // Pintasan papan tulis: Ctrl/Cmd + B untuk tampil/sembunyikan sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        nav.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
          Memuat…
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-500">
        Silakan login terlebih dahulu.
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {drawer ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setDrawer(false)}
          aria-hidden
        />
      ) : null}
      <Sidebar
        open={drawer}
        onClose={() => setDrawer(false)}
        width={nav.width}
        onWidthChange={nav.setWidth}
        collapsed={!nav.visible}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenu={() => setDrawer(true)}
          navVisible={nav.visible}
          onToggleNav={nav.toggle}
        />
        <main className="flex-1 overflow-y-auto px-4 pt-2 pb-8 lg:px-6 lg:pt-3 lg:pb-10">
          <div key={refresh} className="mx-auto max-w-[1200px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsSync />
      <ShellInner>{children}</ShellInner>
    </AuthProvider>
  );
}

/** Setelah login, muat setelan lengkap (termasuk Operasional Default) dari Konfigurasi Umum. */
function SettingsSync() {
  const { me } = useAuth();
  const { refreshFull } = useSettings();
  useEffect(() => {
    if (me) void refreshFull();
  }, [me, refreshFull]);
  return null;
}
