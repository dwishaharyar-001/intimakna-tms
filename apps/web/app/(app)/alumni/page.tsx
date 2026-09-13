'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Badge, Card, Empty, Input, PageHeader, Pager, Select, thCls, tdCls, useResetPageOnSize, useRowsPerPage } from '@/components/ui';
import { WidgetBoard } from '@/components/widgets';
import {
  fmtDate,
  type AlumniRow,
  type BatchRow,
} from '@/lib/core';

export default function AlumniPage() {
  const [rows, setRows] = useState<AlumniRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [batchId, setBatchId] = useState('');
  const [pageSize, setPageSize] = useRowsPerPage('alumni');
  useResetPageOnSize(pageSize, setPage);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) qs.set('search', search);
      if (batchId) qs.set('batchId', batchId);
      const res = await api<{ data: AlumniRow[]; total: number }>(`/alumni?${qs.toString()}`);
      setRows(res.data);
      setTotal(res.total);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, batchId, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<BatchRow[]>('/batches').then(setBatches).catch(() => undefined);
  }, []);

  return (
    <div>
      <PageHeader
        title="Direktori Alumni"
        desc="Cari peserta & telusuri riwayat pelatihan untuk strategi cross-selling / up-selling."
      />

      <WidgetBoard
        pageKey="alumni"
        widgets={[
          {
            key: 'filter',
            label: 'Pencarian & Filter',
            node: (
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Cari nama / perusahaan / HP / email…"
            className="max-w-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select className="w-44! lg:w-56!" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Semua kelas</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batchName}{b.category ? ` · ${b.category}` : ''}
              </option>
            ))}
          </Select>
          <div className="ml-auto text-xs text-slate-400">{rows.length} alumni</div>
        </div>
      </Card>
            ),
          },
          {
            key: 'list',
            label: 'Direktori Alumni',
            node: (
      <Card>
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Memuat…</div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <Empty>Tidak ada alumni yang cocok.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={thCls}>Nama</th>
                  <th className={thCls}>Perusahaan / Jabatan</th>
                  <th className={thCls}>Kontak</th>
                  <th className={thCls}>Riwayat</th>
                  <th className={thCls}>Pelatihan Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className={tdCls}>
                      <Link
                        href={`/alumni/${a.id}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className={tdCls}>
                      <p className="text-slate-700">{a.company ?? '—'}</p>
                      <p className="text-xs text-slate-400">{a.position ?? ''}</p>
                    </td>
                    <td className={`${tdCls} text-slate-500`}>
                      {a.phone}
                      <p className="text-xs text-slate-400">{a.email ?? ''}</p>
                    </td>
                    <td className={tdCls}>
                      <Badge className="bg-indigo-50 text-indigo-600">{a.historyCount}×</Badge>
                    </td>
                    <td className={`${tdCls} text-slate-500`}>
                      {a.lastTraining ? (
                        <>
                          <p className="text-slate-700">{a.lastTraining.category ?? a.lastTraining.batchName}</p>
                          <p className="text-xs text-slate-400">
                            {a.lastTraining.batchName} · {fmtDate(a.lastTraining.endDate)}
                            {a.lastTraining.location ? ` · ${a.lastTraining.location}` : ''}
                          </p>
                        </>
                      ) : (
                        <span className="text-slate-300">Belum pernah ikut</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-100 px-4 py-3">
          <Pager page={page} total={total} limit={pageSize} rows={pageSize} onRowsChange={setPageSize} onChange={setPage} />
        </div>
      </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
