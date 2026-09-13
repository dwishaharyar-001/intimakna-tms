'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Donut, RingAvatar, Stars, thCls, tdCls } from '@/components/ui';
import { WidgetBoard } from '@/components/widgets';
import {
  cn,
  fmtDate,
  money,
  BATCH_STATUS_BADGE,
  BATCH_STATUS_LABEL,
  LEAD_SOURCE_LABEL,
  PAY_STATUS_BADGE,
  PAY_STATUS_LABEL,
  type BatchRow,
  type BatchStatus,
  type FinancialRow,
  type LeadRow,
  type PaymentStatus,
  type ProgramRow,
  type StageRow,
} from '@/lib/core';

const RED = '#E53935';
const GOLD = '#F5B301';
const CYAN = '#29B6F6';
const PURPLE = '#7E57C2';
const GREEN = '#4CAF50';

const BATCH_COLOR: Record<BatchStatus, string> = {
  ONGOING: RED,
  PLANNED: GOLD,
  COMPLETED: CYAN,
  CANCELLED: PURPLE,
};

type Role = string;

// ---------- Komponen kecil ----------
function SectionTitle({ children, href, linkText = 'See More →' }: { children: ReactNode; href: string; linkText?: string }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-1">
      <h2 className="text-[15px] font-bold text-slate-900">{children}</h2>
      <Link href={href} className="text-[13px] font-bold text-[#E53935] hover:underline">
        {linkText}
      </Link>
    </div>
  );
}

function LeadThumb({ name }: { name: string }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FDECEA] text-sm font-extrabold text-[#E53935]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Card hero: angka raksasa + avatar ring + rating */
function HeroCard({ me }: { me: { name: string; role: Role } }) {
  const [metric, setMetric] = useState<{ big: string; title: string; sub: string; ratingLabel: string; ratingValue: string; stars: number } | null>(null);

  useEffect(() => {
    const role = me.role;
    if (role === 'FINANCE' || role === 'MANAGEMENT' || role === 'ADMIN_TRAINING') {
      api<FinancialRow[]>('/financials/overview')
        .then((rows) => {
          const revenue = rows.reduce((a, r) => a + r.revenue, 0);
          const paid = rows.reduce((a, r) => a + r.paidTotal, 0);
          const expense = rows.reduce((a, r) => a + r.expense, 0);
          const net = revenue - expense;
          const collect = revenue > 0 ? paid / revenue : 0;
          setMetric({
            big: money(net),
            title: 'Total Net Profit',
            sub: `Margin ${revenue ? ((net / revenue) * 100).toFixed(1) : 0}% dari ${rows.length} kelas`,
            ratingLabel: 'Kolektibilitas',
            ratingValue: `${(collect * 100).toFixed(0)}%`,
            stars: collect * 5,
          });
        })
        .catch(() => undefined);
    } else if (role === 'SALES_MARKETING') {
      api<{ total: number }>('/leads?limit=1').then((r) =>
        setMetric({
          big: String(r.total),
          title: 'Total Leads',
          sub: 'Kelola pipeline hingga closed-won',
          ratingLabel: 'Pipeline Aktif',
          ratingValue: '—',
          stars: 0,
        }),
      );
    } else {
      api<BatchRow[]>('/batches').then((bs) => {
        const on = bs.filter((b) => b.status === 'ONGOING').length;
        setMetric({
          big: String(on),
          title: 'Kelas Berjalan',
          sub: `${bs.filter((b) => b.status === 'PLANNED').length} lagi direncanakan`,
          ratingLabel: 'Progress',
          ratingValue: on > 0 ? 'Lancar' : '—',
          stars: on > 0 ? 5 : 0,
        });
      });
    }
  }, [me.role]);

  return (
    <Card className="flex flex-wrap items-center gap-4 px-4 py-4 lg:gap-5 lg:px-6 lg:py-5">
      <RingAvatar letter={me.name} size={56} ringWidth={4} />
      <div className="min-w-[220px] flex-1">
        {metric ? (
          <>
            <p className="text-2xl leading-none font-extrabold tracking-tight text-slate-900 lg:text-[34px]">
              {metric.big}
            </p>
            <p className="mt-1.5 text-sm font-bold text-slate-800 lg:text-[15px]">{metric.title}</p>
            <p className="text-xs text-slate-500">{metric.sub}</p>
          </>
        ) : (
          <p className="text-sm text-slate-400">Memuat…</p>
        )}
      </div>
      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-center lg:px-5 lg:py-3.5">
        <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase lg:text-[11px]">{metric?.ratingLabel ?? '…'}</p>
        <p className="text-xl leading-tight font-extrabold text-slate-900 lg:text-[26px]">{metric?.ratingValue ?? '—'}</p>
        <Stars value={metric?.stars ?? 0} />
      </div>
    </Card>
  );
}

/** Kartu donat: ringkasan batch berdasarkan status */
function DonutCard() {
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  useEffect(() => {
    api<BatchRow[]>('/batches').then(setBatches).catch(() => setBatches([]));
  }, []);
  const counts: Record<BatchStatus, number> = batches
    ? batches.reduce(
        (a, b) => ({ ...a, [b.status]: (a[b.status] ?? 0) + 1 }),
        {} as Record<BatchStatus, number>,
      )
    : ({} as Record<BatchStatus, number>);
  const total = batches?.length ?? 0;
  const segs = (Object.keys(counts) as BatchStatus[])
    .filter((s) => counts[s] > 0)
    .map((s) => ({ label: BATCH_STATUS_LABEL[s], value: counts[s], color: BATCH_COLOR[s] }));

  return (
    <Card className="flex flex-col">
      <SectionTitle href="/batches">Status Kelas</SectionTitle>
      <div className="flex flex-1 items-center gap-4 px-5 pb-5">
        <Donut segments={segs} size={122} centerLabel={batches ? String(total) : '…'} centerSub="Kelas" />
        <ul className="flex-1 space-y-1.5">
          {(Object.keys(counts) as BatchStatus[]).map((s) => (
            <li key={s} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: BATCH_COLOR[s] }} />
              <span className="flex-1 text-slate-500">{BATCH_STATUS_LABEL[s]}</span>
              <span className="font-bold text-slate-800">{counts[s]}</span>
            </li>
          ))}
          {total === 0 ? <li className="text-xs text-slate-400">Belum ada data kelas.</li> : null}
        </ul>
      </div>
    </Card>
  );
}

/** Kartu pembayaran (finance/management/admin) */
function PaymentsCard() {
  const [rows, setRows] = useState<FinancialRow[] | null>(null);
  useEffect(() => {
    api<FinancialRow[]>('/financials/overview').then(setRows).catch(() => setRows([]));
  }, []);
  const revenue = (rows ?? []).reduce((a, r) => a + r.revenue, 0);
  const paid = (rows ?? []).reduce((a, r) => a + r.paidTotal, 0);
  const outstanding = revenue - paid;
  const pct = revenue > 0 ? (paid / revenue) * 100 : 0;

  return (
    <Card className="flex flex-col">
      <SectionTitle href="/financials">Pembayaran</SectionTitle>
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-center">
        <div className="shrink-0 text-center sm:w-32">
          <p className="text-[26px] leading-tight font-extrabold text-emerald-600">{pct.toFixed(0)}%</p>
          <Stars value={(pct / 100) * 5} />
          <p className="mt-1 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Terkumpul</p>
          <p className="text-xs font-bold text-[#E53935]">{money(outstanding)} piutang</p>
        </div>
        <div className="min-h-[86px] flex-1 space-y-2 border-slate-100 sm:border-l sm:pl-4">
          {rows === null ? <p className="text-xs text-slate-400">Memuat…</p> : null}
          {rows?.slice(0, 3).map((r) => (
            <div key={r.batchId} className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-extrabold text-slate-500">
                {r.batchName.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">{r.batchName}</p>
                <p className="truncate text-[10px] text-slate-400">{r.category ?? '—'}</p>
              </div>
              <span className="text-xs font-bold text-slate-700 tabular-nums">{money(r.revenue)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Baris program rekomendasi */
function RecommendedRow() {
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  useEffect(() => {
    api<BatchRow[]>('/batches')
      .then((bs) =>
        setBatches(
          bs
            .filter((b) => b.status === 'ONGOING' || b.status === 'PLANNED')
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .slice(0, 3),
        ),
      )
      .catch(() => setBatches([]));
  }, []);
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-slate-900">Kelas Reguler Terdekat</h2>
        <Link href="/batches" className="text-[13px] font-bold text-[#E53935] hover:underline">
          See More →
        </Link>
      </div>
      {batches === null ? (
        <p className="text-xs text-slate-400">Memuat…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {batches.map((b) => (
            <Card key={b.id} className="flex items-center gap-3 p-4 transition hover:border-[#FAC2BE]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
                🎓
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold tracking-widest text-slate-400 uppercase">
                  {b.material?.title ?? b.category ?? 'Kelas'}
                </p>
                <p className="truncate text-sm font-bold text-slate-900">{b.batchName}</p>
                <p className="truncate text-[11px] text-slate-400">{fmtDate(b.startDate)}</p>
              </div>
              <Link href="/batches" className="shrink-0 text-xs font-bold text-[#E53935] hover:underline">
                Lihat →
              </Link>
            </Card>
          ))}
          {batches.length === 0 ? (
            <Card className="p-4 text-xs text-slate-400">Belum ada kelas reguler.</Card>
          ) : null}
        </div>
      )}
    </section>
  );
}

// ---------- Panel kanan ----------
function LeadsPanel() {
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const load = useCallback(() => {
    api<{ data: LeadRow[] }>('/leads?limit=8')
      .then((r) => setLeads(r.data))
      .catch(() => setLeads([]));
    api<StageRow[]>('/lead-stages').then(setStages).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  const openStages = stages.filter((s) => s.kind === 'OPEN');
  const wonStage = stages.find((s) => s.kind === 'WON');
  const lostStage = stages.find((s) => s.kind === 'LOST');
  const nextStageId = (curStage?: { id: string; kind: string }) => {
    const idx = openStages.findIndex((s) => s.id === curStage?.id);
    if (idx >= 0 && idx < openStages.length - 1) return openStages[idx + 1].id;
    if (idx === openStages.length - 1) return wonStage?.id;
    return idx === -1 ? openStages[0]?.id : undefined;
  };

  async function act(id: string, stageId?: string) {
    if (!stageId) return;
    await api(`/leads/${id}`, { method: 'PATCH', body: { stageId } }).catch(() => undefined);
    load();
  }

  const open = (leads ?? []).filter((l) => l.stage?.kind === 'OPEN');
  return (
    <Card className="flex h-fit flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-slate-900">Leads</h2>
          <Badge className="bg-[#FDECEA] text-[#E53935]">{open.length}</Badge>
        </div>
      </div>
      <div className="space-y-2 px-4 py-3 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0 xl:grid-cols-3">
        {leads === null ? <p className="px-1 text-xs text-slate-400">Memuat…</p> : null}
        {(leads ?? []).slice(0, 5).map((l) => (
          <div key={l.id} className="rounded-2xl border border-slate-100 p-3 shadow-[0_1px_6px_rgba(0,0,0,0.03)]">
            <div className="flex items-start gap-2.5">
              <LeadThumb name={l.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-tight font-bold text-[#E53935]">{l.name}</p>
                <p className="truncate text-[11px] text-slate-400">
                  via {LEAD_SOURCE_LABEL[l.source]} · {l.company ?? l.phone}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 tabular-nums">
                📋 {l._count?.activities ?? l.activities?.length ?? 0} aktivitas
              </span>
              <Link href={`/leads/${l.id}`} className="text-[11px] font-bold text-[#E53935] hover:underline">
                Kelola →
              </Link>
            </div>
          </div>
        ))}
        {leads && leads.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-slate-400">Belum ada leads.</p>
        ) : null}
      </div>
      <Link href="/leads" className="pb-4 text-center text-[13px] font-bold text-[#E53935] hover:underline">
        See More
      </Link>
    </Card>
  );
}

/** Panel tagihan tertagih untuk Finance (mirip kartu request: ✓ = lunas) */
function InvoicesPanel() {
  const [rows, setRows] = useState<Array<{ id: string; participantName: string; batchName: string; totalAmount: number; totalPaid: number; paymentStatus: PaymentStatus }> | null>(null);
  const load = useCallback(() => {
    api<typeof rows>(`/financials/revenues`).then((r) => setRows((r ?? []).filter((x) => x.paymentStatus !== 'PAID'))).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  async function markPaid(id: string) {
    const res = await api<{ convertedLeadId: string | null }>(`/financials/revenues/${id}`, {
      method: 'PATCH',
      body: { paymentStatus: 'PAID' },
    }).catch(() => null);
    if (res?.convertedLeadId) {
      alert('Pembayaran lunas — lead terkait otomatis dikonversi menjadi peserta (CLOSED_WON).');
    }
    load();
  }

  return (
    <Card className="flex h-fit flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-slate-900">Perlu Ditagih</h2>
          <Badge className="bg-[#FDECEA] text-[#E53935]">{rows?.length ?? '…'}</Badge>
        </div>
      </div>
      <div className="space-y-2 px-4 py-3 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0 xl:grid-cols-3">
        {rows === null ? <p className="px-1 text-xs text-slate-400">Memuat…</p> : null}
        {(rows ?? []).slice(0, 5).map((r) => (
          <div key={r.id} className="rounded-2xl border border-slate-100 p-3 shadow-[0_1px_6px_rgba(0,0,0,0.03)]">
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FDECEA] text-xs font-extrabold text-[#E53935]">
                {r.participantName.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-tight font-bold text-[#E53935]">{r.participantName}</p>
                <p className="truncate text-[11px] text-slate-400">{r.batchName}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 tabular-nums">
                {money(r.totalAmount)} <span className="text-slate-300">· {money(r.totalPaid)} dibayar</span>
              </span>
              <button
                title="Catat lunas"
                onClick={() => markPaid(r.id)}
                className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-emerald-500 text-xs text-white transition hover:bg-emerald-600"
              >
                ✓
              </button>
            </div>
          </div>
        ))}
        {rows && rows.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-slate-400">Semua tagihan sudah lunas 🎉</p>
        ) : null}
      </div>
      <Link href="/financials" className="pb-4 text-center text-[13px] font-bold text-[#E53935] hover:underline">
        See More
      </Link>
    </Card>
  );
}

/** Panel batch aktif untuk Training Support */
function BatchesPanel() {
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  useEffect(() => {
    api<BatchRow[]>('/batches')
      .then((bs) =>
        setBatches(
          bs
            .filter((b) => b.status === 'ONGOING' || b.status === 'PLANNED')
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .slice(0, 5),
        ),
      )
      .catch(() => setBatches([]));
  }, []);
  return (
    <Card className="flex h-fit flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <h2 className="text-[15px] font-bold text-slate-900">Kelas Aktif</h2>
      </div>
      <div className="space-y-2 px-4 py-3">
        {batches === null ? <p className="px-1 text-xs text-slate-400">Memuat…</p> : null}
        {(batches ?? []).map((b) => (
          <Link key={b.id} href={`/batches/${b.id}`} className="block rounded-2xl border border-slate-100 p-3 shadow-[0_1px_6px_rgba(0,0,0,0.03)] transition hover:border-[#FAC2BE]">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-bold text-[#E53935]">{b.batchName}</p>
              <Badge className={BATCH_STATUS_BADGE[b.status]}>{BATCH_STATUS_LABEL[b.status]}</Badge>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">{b.material?.title ?? b.category ?? '—'}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {fmtDate(b.startDate)} – {fmtDate(b.endDate)} · {b.participantCount} peserta
            </p>
          </Link>
        ))}
        {batches && batches.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-slate-400">Tidak ada kelas aktif.</p>
        ) : null}
      </div>
      <Link href="/batches" className="pb-4 text-center text-[13px] font-bold text-[#E53935] hover:underline">
        See More
      </Link>
    </Card>
  );
}

/** Kalender kelas bulanan (full width, di bawah) — menampilkan rencana kelas per tanggal. */
function ClassCalendarCard() {
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    api<BatchRow[]>('/batches').then(setBatches).catch(() => setBatches([]));
  }, []);

  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const keyOfIso = (iso: string) => dayKey(new Date(iso));

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  // Senin sebagai awal minggu
  const gridStart = new Date(monthStart);
  const dow = (gridStart.getDay() + 6) % 7;
  gridStart.setDate(gridStart.getDate() - dow);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const byDay = new Map<string, BatchRow[]>();
  const spanning = new Map<string, BatchRow[]>();
  for (const b of batches ?? []) {
    const s = new Date(b.startDate);
    const e = new Date(b.endDate);
    const startK = dayKey(s);
    if (!byDay.has(startK)) byDay.set(startK, []);
    byDay.get(startK)!.push(b);
    // penanda hari ke-2..selesai (strip tipis)
    const cur = new Date(s);
    cur.setDate(cur.getDate() + 1);
    while (cur <= e) {
      const k = dayKey(cur);
      if (!spanning.has(k)) spanning.set(k, []);
      spanning.get(k)!.push(b);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const todayKey = dayKey(new Date());
  const monthLabel = monthStart.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const monthClassCount = (batches ?? []).filter((b) => {
    const s = new Date(b.startDate);
    return s >= monthStart && s <= monthEnd;
  }).length;

  const chipCls: Record<string, string> = {
    PLANNED: 'bg-amber-100 text-amber-800',
    ONGOING: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-rose-100 text-rose-700',
  };

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 lg:px-5">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-slate-900">Kalender Kelas</h2>
          <Badge className="bg-slate-100 text-slate-600">{monthLabel}</Badge>
          {batches ? <Badge className="bg-[#FDECEA] text-[#E53935]">{monthClassCount} kelas</Badge> : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            ‹ Bulan lalu
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            Hari ini
          </Button>
          <Button size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            Bulan depan ›
          </Button>
        </div>
      </div>

      <div className="p-3 lg:p-5">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold tracking-wide text-slate-400 uppercase lg:text-[11px]">
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => (
            <span key={d} className="py-1">{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const k = dayKey(d);
            const inMonth = d.getMonth() === monthStart.getMonth();
            const items = byDay.get(k) ?? [];
            const strips = spanning.get(k) ?? [];
            const shown = items.slice(0, 2);
            return (
              <div
                key={k}
                className={cn(
                  'min-h-[86px] rounded-xl border p-1.5 text-left lg:min-h-[96px]',
                  inMonth ? 'border-slate-100 bg-white' : 'border-transparent bg-slate-50/60',
                  k === todayKey ? 'ring-1 ring-[#E53935]/40' : '',
                )}
              >
                <div className={cn('mb-1 text-right text-[11px] font-bold', inMonth ? 'text-slate-600' : 'text-slate-300')}>
                  {d.getDate()}
                </div>
                {strips.map((b) => (
                  <div key={`s-${b.id}`} className={cn('mb-0.5 h-1 w-full rounded-full', chipCls[b.status].split(' ')[0])} />
                ))}
                {shown.map((b) => (
                  <Link
                    key={b.id}
                    href={`/batches/${b.id}`}
                    title={`${b.batchName} · ${b.material?.title ?? b.category ?? ''}`}
                    className={cn('mb-0.5 block truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold hover:underline', chipCls[b.status])}
                  >
                    {b.material?.title ?? b.batchName}
                  </Link>
                ))}
                {items.length > shown.length ? (
                  <p className="text-[10px] text-slate-400">+{items.length - shown.length} kelas lagi</p>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
          {(['PLANNED', 'ONGOING', 'COMPLETED'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn('h-2.5 w-2.5 rounded-full', chipCls[s].split(' ')[0])} /> {BATCH_STATUS_LABEL[s]}
            </span>
          ))}
          <span className="text-slate-400">· Klik nama kelas untuk membuka detail</span>
        </div>
      </div>
    </Card>
  );
}

/** Kelas terdekat yang persiapan (checklist) belum lengkap. */
function ChecklistWatchCard() {
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  useEffect(() => {
    api<BatchRow[]>('/batches').then(setRows).catch(() => setRows([]));
  }, []);

  const list = (rows ?? [])
    .filter(
      (b) =>
        b.status === 'PLANNED' &&
        (b.requirementsTotal ?? 0) > 0 &&
        (b.requirementsDone ?? 0) < (b.requirementsTotal ?? 0),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5);

  const daysTo = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-1 lg:px-5">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-slate-900">Persiapan Kelas Terdekat</h2>
          {list.length > 0 ? <Badge className="bg-amber-100 text-amber-700">{list.length} perlu tindak lanjut</Badge> : null}
        </div>
        <Link href="/batches" className="text-[13px] font-bold text-[#E53935] hover:underline">
          See More →
        </Link>
      </div>

      {rows === null ? (
        <p className="px-4 pb-4 text-xs text-slate-400 lg:px-5">Memuat…</p>
      ) : list.length === 0 ? (
        <div className="px-4 pb-4 lg:px-5">
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">
            ✓ Semua kelas terdekat persiapannya sudah lengkap.
          </div>
        </div>
      ) : (
        <ul className="space-y-2 px-4 py-3 lg:px-5">
          {list.map((b) => {
            const d = daysTo(b.startDate);
            const total = b.requirementsTotal ?? 0;
            const done = b.requirementsDone ?? 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <li key={b.id} className="rounded-2xl border border-slate-100 p-3 shadow-[0_1px_6px_rgba(0,0,0,0.03)]">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-slate-900">
                      {b.material?.title ?? b.category ?? b.batchName}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {b.batchName} · mulai {fmtDate(b.startDate)}
                    </p>
                  </div>
                  <Badge className={d <= 3 ? 'bg-[#FDECEA] text-[#E53935]' : 'bg-slate-100 text-slate-600'}>
                    {d < 0 ? `terlewat ${Math.abs(d)} hari` : d === 0 ? 'hari ini' : `H-${d}`}
                  </Badge>
                  <Badge className="bg-amber-100 text-amber-700">☑ {done}/{total}</Badge>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-right">
                  <Link href={`/batches/${b.id}`} className="text-[11px] font-bold text-[#E53935] hover:underline">
                    Periksa checklist →
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------- Halaman ----------
export default function DashboardPage() {
  const { me } = useAuth();
  if (!me) return null;
  const role = me.role;
  const isFMA = role === 'FINANCE' || role === 'MANAGEMENT' || role === 'ADMIN_TRAINING';
  const canLeads = role === 'SALES_MARKETING' || role === 'MANAGEMENT' || role === 'ADMIN_TRAINING';

  return (
    <div>
      <p className="mb-4 text-[13px] text-slate-400">
        {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <WidgetBoard
        pageKey="dashboard"
        widgets={[
          { key: 'hero', label: 'Ringkasan Anda', node: <HeroCard me={me} />, canHide: false },
          {
            key: 'insight',
            label: 'Status & Keuangan',
            node: isFMA ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <DonutCard />
                <PaymentsCard />
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <DonutCard />
                {canLeads ? (
                  <Card className="p-5">
                    <p className="mb-1 text-[15px] font-bold text-slate-900">Fokus Hari Ini</p>
                    <p className="text-xs text-slate-400">
                      Konversi leads menjadi peserta terjadi saat biaya training dibayar lunas.
                    </p>
                    <div className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3">
                      <span className="text-xl">💡</span>
                      <p className="text-xs leading-relaxed text-slate-600">
                        Gunakan panel <b>Leads</b> di bawah untuk menyegarkan pipeline harian Anda.
                      </p>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-5">
                    <p className="mb-1 text-[15px] font-bold text-slate-900">Ringkasan</p>
                    <div className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3">
                      <span className="text-xl">🎯</span>
                      <p className="text-xs leading-relaxed text-slate-600">
                        Pantau kelas berjalan & jadwal terdekat dari kalender di bawah.
                      </p>
                    </div>
                  </Card>
                )}
              </div>
            ),
          },
          { key: 'checklist', label: 'Persiapan Kelas Terdekat', node: <ChecklistWatchCard /> },
          { key: 'calendar', label: 'Kalender Kelas', node: <ClassCalendarCard /> },
          { key: 'recommended', label: 'Kelas Reguler Terdekat', node: <RecommendedRow /> },
          ...(role === 'FINANCE'
            ? [{ key: 'invoices', label: 'Perlu Ditagih', node: <InvoicesPanel /> }]
            : canLeads
              ? [{ key: 'leads', label: 'Leads', node: <LeadsPanel /> }]
              : []),
        ]}
      />
      <p className="mt-6 text-center text-[10px] text-slate-300">Intimakna TMS · sistem internal PT. Intimakna</p>
    </div>
  );
}
