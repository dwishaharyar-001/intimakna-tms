'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Pager, Select, StatCard, thCls, tdCls, useResetPageOnSize, useRowsPerPage } from '@/components/ui';
import { WidgetBoard } from '@/components/widgets';
import {
  fmtDate,
  money,
  type Coverage,
  type MaterialProspects,
  type ProspectPerson,
} from '@/lib/core';

function ProspectTable({
  rows,
  title,
  tone,
  action,
  actionLabel,
  busyId,
  onAction,
  page,
  total,
  onPage,
  rowsPerPage,
  onRowsPerPage,
}: {
  rows: ProspectPerson[];
  title: string;
  tone: 'good' | 'accent';
  action?: boolean;
  actionLabel?: string;
  busyId?: string | null;
  onAction?: (p: ProspectPerson) => void;
  page: number;
  total: number;
  onPage: (p: number) => void;
  rowsPerPage: number;
  onRowsPerPage: (n: number) => void;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 lg:px-5">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <Badge className={tone === 'good' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#FDECEA] text-[#E53935]'}>
          {total} orang
        </Badge>
      </div>
      {rows.length === 0 ? (
        <div className="p-4">
          <Empty>Tidak ada data.</Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={thCls}>Nama</th>
                <th className={thCls}>Perusahaan / Jabatan</th>
                <th className={thCls}>Kontak</th>
                <th className={thCls}>Level dituntaskan</th>
                {action ? <th className={thCls}>Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className={tdCls}>
                    <Link href={`/alumni/${p.id}`} className="font-medium text-indigo-600 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className={tdCls}>
                    <p className="text-slate-700">{p.company ?? '—'}</p>
                    <p className="text-xs text-slate-400">{p.position ?? ''}</p>
                  </td>
                  <td className={`${tdCls} text-slate-500`}>
                    {p.phone}
                    <p className="text-xs text-slate-400">{p.email ?? ''}</p>
                  </td>
                  <td className={tdCls}>
                    {p.attendedLevels.length === 0 ? (
                      <span className="text-xs text-slate-300">belum ada</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {p.attendedLevels.map((lv) => (
                          <Badge key={lv} className="bg-slate-100 text-slate-600">
                            Lv {lv}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </td>
                  {action ? (
                    <td className={tdCls}>
                      <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => onAction?.(p)}>
                        {busyId === p.id ? '…' : (actionLabel ?? 'Jadikan Lead')}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-slate-100 px-4 py-2.5">
        <Pager page={page} total={total} limit={rowsPerPage} rows={rowsPerPage} onRowsChange={onRowsPerPage} onChange={onPage} compact />
      </div>
    </Card>
  );
}

export default function ProspectsPage() {
  const { me } = useAuth();
  const canLead = me?.role === 'SALES_MARKETING' || me?.role === 'ADMIN_TRAINING' || me?.role === 'SUPER_ADMIN';

  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [materialId, setMaterialId] = useState('');
  const [mode, setMode] = useState<'prereq' | 'all'>('prereq');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<MaterialProspects | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [converted, setConverted] = useState<Record<string, string>>({});
  const [pPage, setPPage] = useState(1);
  const [aPage, setAPage] = useState(1);
  const [pSize, setPSize] = useRowsPerPage('prospects');
  const [aSize, setASize] = useRowsPerPage('prospects-attended');
  useResetPageOnSize(pSize, setPPage);
  useResetPageOnSize(aSize, setAPage);

  // muat daftar materi (dari coverage) & pilih materi dari URL bila ada
  useEffect(() => {
    api<Coverage>('/learning-path/coverage')
      .then((cov) => {
        setCoverage(cov);
        const all = cov.levels.flatMap((l) => l.materials);
        const fromUrl = new URLSearchParams(window.location.search).get('materialId');
        const pick = (fromUrl && all.find((m) => m.id === fromUrl)?.id) || all[0]?.id || '';
        setMaterialId(pick);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat cakupan'));
  }, []);

  const load = useCallback(async () => {
    if (!materialId) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ mode });
      if (search.trim()) qs.set('search', search.trim());
      setData(await api<MaterialProspects>(`/materials/${materialId}/prospects?${qs.toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat prospek');
    } finally {
      setLoading(false);
    }
  }, [materialId, mode, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPPage(1);
    setAPage(1);
  }, [data?.material.id, mode, search]);

  const flatMaterials = useMemo(() => coverage?.levels.flatMap((l) => l.materials.map((m) => ({ ...m, level: l.level }))) ?? [], [coverage]);

  async function jadikanLead(p: ProspectPerson) {
    if (!data) return;
    setBusyId(p.id);
    setError('');
    setMsg('');
    try {
      const created = await api<{ id: string }>('/leads', {
        method: 'POST',
        body: {
          name: p.name,
          phone: p.phone,
          email: p.email || undefined,
          company: p.company || undefined,
          source: 'CALL',
          interestBatchId: data.upcomingClass?.id,
        },
      });
      setConverted((c) => ({ ...c, [p.id]: created.id }));
      setMsg(`${p.name} ditambahkan ke Leads Pipeline (minat: ${data.upcomingClass?.batchName ?? data.material.title}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat lead');
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    if (!data) return;
    const head = 'nama,perusahaan,jabatan,telepon,email,level_dituntaskan';
    const body = data.prospects
      .map((p) =>
        [
          `"${p.name}"`,
          `"${(p.company ?? '').replace(/"/g, '""')}"`,
          `"${(p.position ?? '').replace(/"/g, '""')}"`,
          `"${p.phone}"`,
          `"${p.email ?? ''}"`,
          `"${p.attendedLevels.map((l) => `Lv${l}`).join(' ')}"`,
        ].join(','),
      )
      .join('\n');
    const blob = new Blob([`${head}\n${body}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prospek-${data.material.title.toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const current = flatMaterials.find((m) => m.id === materialId);

  return (
    <div>
      <PageHeader
        title="Prospek Kelas Berikutnya"
        desc="Cari alumni yang belum mengikuti materi tertentu sebagai target marketing kelas berikutnya. Mode prasyarat hanya menampilkan alumni yang sudah menuntaskan level sebelumnya."
      />

      <ErrorNote message={error} />
      {msg ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {msg} — <Link href="/leads" className="font-semibold underline">buka Kanban Leads</Link>
        </div>
      ) : null}

      <WidgetBoard
        pageKey="prospects"
        widgets={[
          {
            key: 'filter',
            label: 'Materi & Mode',
            node: (
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-slate-600">Materi / Level</span>
            <Select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="min-w-64">
              {coverage?.levels.map((l) => (
                <optgroup key={l.level} label={`Level ${l.level} — ${l.attended} sudah ikut · ${l.prospects} prospek`}>
                  {l.materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({m.attended} ikut / {m.prospects} prospek)
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-slate-600">Mode prospek</span>
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'prereq' | 'all')} className="min-w-52">
              <option value="prereq">Prasyarat (sudah lulus level sebelumnya)</option>
              <option value="all">Semua alumni yang belum ikut</option>
            </Select>
          </label>
          <label className="block flex-1 min-w-52">
            <span className="mb-1 block text-[13px] font-medium text-slate-600">Cari</span>
            <Input placeholder="Nama / perusahaan / telepon…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <Button variant="outline" onClick={exportCsv} disabled={!data || data.prospects.length === 0}>
            ⬇ Ekspor Prospek (CSV)
          </Button>
        </div>
      </Card>
            ),
          },
          {
            key: 'stats',
            label: 'Ringkasan',
            node: data ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Sudah Mengikuti" value={String(data.attendedCount)} tone="good" />
            <StatCard label="Prospek" value={String(data.prospectCount)} tone="accent" sub={data.mode === 'prereq' ? `Prasyarat: Lv ${data.prerequisiteLevel ?? '-'}` : 'Semua alumni'} />
            <StatCard label="Materi" value={current ? `Lv ${current.level}` : '—'} sub={data.material.title} />
            <StatCard
              label="Kelas Berikutnya"
              value={data.upcomingClass ? fmtDate(data.upcomingClass.startDate) : 'Belum ada'}
              sub={data.upcomingClass ? `${data.upcomingClass.batchName} · ${money(data.upcomingClass.price)}` : 'Buat kelas PLANNED dulu'}
            />
          </div>
            ) : (
              <Card className="p-4">
                <Empty>{loading ? 'Memuat data prospek…' : 'Tidak ada data.'}</Empty>
              </Card>
            ),
          },
          {
            key: 'prospects',
            label: 'Calon Prospek',
            node: data ? (
            <ProspectTable
              rows={data.prospects.slice((pPage - 1) * pSize, pPage * pSize)}
              title="Calon Prospek (belum mengikuti materi ini)"
              tone="accent"
              action={canLead}
              busyId={busyId}
              onAction={jadikanLead}
              page={pPage}
              total={data.prospects.length}
              onPage={setPPage}
              rowsPerPage={pSize}
              onRowsPerPage={setPSize}
            />
            ) : (
              <Card className="p-4">
                <Empty>Memuat…</Empty>
              </Card>
            ),
          },
          {
            key: 'attended',
            label: 'Sudah Mengikuti',
            node: data ? (
            <ProspectTable
              rows={data.attended.slice((aPage - 1) * aSize, aPage * aSize)}
              title="Alumni yang Sudah Mengikuti"
              tone="good"
              page={aPage}
              total={data.attended.length}
              onPage={setAPage}
              rowsPerPage={aSize}
              onRowsPerPage={setASize}
            />
            ) : (
              <Card className="p-4">
                <Empty>Memuat…</Empty>
              </Card>
            ),
          },
          {
            key: 'note',
            label: 'Catatan Konversi',
            node: (
              <div>
                {Object.keys(converted).length > 0 ? (
                  <p className="text-[12px] text-slate-400">
                    {Object.keys(converted).length} prospek sudah dijadikan lead. Status “sudah jadi lead” tidak menghilangkan baris ini agar Anda bisa menelusuri riwayatnya di{' '}
                    <Link href="/leads" className="text-[#E53935] underline">Leads Pipeline</Link>.
                  </p>
                ) : null}
              </div>
            ),
          },
        ]}
      />

      {!canLead ? (
        <p className="mt-4 text-[12px] text-slate-400">
          Anda dapat melihat data, tetapi tombol “Jadikan Lead” hanya tersedia untuk Sales/Marketing, Admin Training, dan Super Admin.
        </p>
      ) : null}
    </div>
  );
}
