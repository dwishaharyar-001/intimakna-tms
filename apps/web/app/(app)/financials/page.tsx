'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Badge, Card, Empty, PageHeader, Pager, Select, StatCard, thCls, tdCls, useResetPageOnSize, useRowsPerPage } from '@/components/ui';
import { WidgetBoard } from '@/components/widgets';
import {
  fmtDate,
  money,
  PAY_STATUS_BADGE,
  PAY_STATUS_LABEL,
  type FinancialRow,
  type PaymentStatus,
} from '@/lib/core';

interface RevRow {
  id: string;
  batchId: string;
  batchName: string;
  category?: string | null;
  participantId: string;
  participantName: string;
  company?: string | null;
  totalAmount: number;
  totalPaid: number;
  paymentStatus: PaymentStatus;
}

interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export default function FinancialsPage() {
  const [overview, setOverview] = useState<FinancialRow[] | null>(null);
  const [revenues, setRevenues] = useState<RevRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [payFilter, setPayFilter] = useState('');
  const [pageSize, setPageSize] = useRowsPerPage('financials-revenues');
  useResetPageOnSize(pageSize, setPage);
  const [profPage, setProfPage] = useState(1);
  const [profSize, setProfSize] = useRowsPerPage('financials-profitability');
  useResetPageOnSize(profSize, setProfPage);

  useEffect(() => {
    api<FinancialRow[]>('/financials/overview').then(setOverview).catch(() => setOverview([]));
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ paged: '1', page: String(page), limit: String(pageSize) });
    if (payFilter) qs.set('paymentStatus', payFilter);
    api<Paged<RevRow>>(`/financials/revenues?${qs.toString()}`)
      .then((r) => {
        setRevenues(r.data);
        setTotal(r.total);
      })
      .catch(() => {
        setRevenues([]);
        setTotal(0);
      });
  }, [payFilter, page, pageSize]);

  const rows = overview ?? [];
  const sums = rows.reduce(
    (a, r) => ({ rev: a.rev + r.revenue, paid: a.paid + r.paidTotal, exp: a.exp + r.expense, net: a.net + r.net }),
    { rev: 0, paid: 0, exp: 0, net: 0 },
  );
  const outstanding = (rows ?? []).reduce((a, r) => a + Math.max(r.revenue - r.paidTotal, 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Keuangan"
        desc="Visibilitas cost & profit per kelas, serta status pembayaran peserta."
      />

      <WidgetBoard
        pageKey="financials"
        widgets={[
          {
            key: 'summary',
            label: 'Ringkasan & Profitabilitas',
            canHide: false,
            node: (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatCard label="Total Revenue" value={money(sums.rev)} tone="accent" />
                  <StatCard label="Terkumpul" value={money(sums.paid)} tone="good" />
                  <StatCard label="Piutang Terbuka" value={money(outstanding)} tone="bad" />
                  <StatCard label="Net Profit" value={money(sums.net)} tone={sums.net >= 0 ? 'good' : 'bad'} />
                </div>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <span className="text-sm font-semibold text-slate-800">Profitabilitas per Kelas</span>
                    <span className="text-[11px] text-slate-400">{rows.length} kelas</span>
                  </div>
                  {rows.length === 0 ? (
                    <div className="p-4">
                      <Empty>Belum ada data kelas.</Empty>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className={thCls}>Kelas</th>
                            <th className={`${thCls} text-right`}>Revenue</th>
                            <th className={`${thCls} text-right`}>Paid</th>
                            <th className={`${thCls} text-right`}>Expense</th>
                            <th className={`${thCls} text-right`}>Net</th>
                            <th className={`${thCls} text-right`}>Margin</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows
                            .slice((profPage - 1) * profSize, profPage * profSize)
                            .map((r) => (
                            <tr key={r.batchId} className="hover:bg-slate-50/60">
                              <td className={tdCls}>
                                <Link href={`/batches/${r.batchId}`} className="font-medium text-indigo-600 hover:underline">
                                  {r.batchName}
                                </Link>
                                <p className="text-xs text-slate-400">{r.category ?? '—'}</p>
                              </td>
                              <td className={`${tdCls} text-right tabular-nums`}>{money(r.revenue)}</td>
                              <td className={`${tdCls} text-right tabular-nums text-emerald-600`}>{money(r.paidTotal)}</td>
                              <td className={`${tdCls} text-right tabular-nums text-rose-600`}>{money(r.expense)}</td>
                              <td className={`${tdCls} text-right font-semibold tabular-nums ${r.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {money(r.net)}
                              </td>
                              <td className={`${tdCls} text-right tabular-nums text-slate-500`}>{(r.margin * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {rows.length > 0 ? (
                    <div className="border-t border-slate-100 px-4 py-2.5">
                      <Pager
                        page={profPage}
                        total={rows.length}
                        limit={profSize}
                        rows={profSize}
                        onRowsChange={setProfSize}
                        onChange={setProfPage}
                        compact
                      />
                      <p className="mt-2 text-[11px] text-slate-400">
                        Atur sendiri berapa kelas yang tampil per halaman (per akun).
                      </p>
                    </div>
                  ) : null}
                </Card>
              </div>
            ),
          },
          {
            key: 'revenues',
            label: 'Tagihan & Pembayaran Peserta',
            node: (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Tagihan & Pembayaran Peserta</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Filter status:</span>
                    <Select
                      className="w-36! py-1.5 text-[11px] lg:w-44! lg:text-xs"
                      value={payFilter}
                      onChange={(e) => {
                        setPayFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">Semua</option>
                      <option value="UNPAID">Belum Bayar</option>
                      <option value="PARTIAL">Sebagian</option>
                      <option value="PAID">Lunas</option>
                    </Select>
                  </div>
                </div>
                {revenues.length === 0 ? (
                  <div className="p-4">
                    <Empty>Tidak ada tagihan.</Empty>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className={thCls}>Kelas</th>
                          <th className={thCls}>Peserta</th>
                          <th className={`${thCls} text-right`}>Tagihan</th>
                          <th className={`${thCls} text-right`}>Terbayar</th>
                          <th className={`${thCls} text-right`}>Sisa</th>
                          <th className={thCls}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenues.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/60">
                            <td className={tdCls}>
                              <Link href={`/batches/${r.batchId}`} className="text-slate-700 hover:text-indigo-600 hover:underline">
                                {r.batchName}
                              </Link>
                              <p className="text-xs text-slate-400">{r.category ?? '—'}</p>
                            </td>
                            <td className={tdCls}>
                              <p className="text-slate-700">{r.participantName}</p>
                              <p className="text-xs text-slate-400">{r.company ?? ''}</p>
                            </td>
                            <td className={`${tdCls} text-right tabular-nums`}>{money(r.totalAmount)}</td>
                            <td className={`${tdCls} text-right tabular-nums text-emerald-600`}>{money(r.totalPaid)}</td>
                            <td className={`${tdCls} text-right tabular-nums text-slate-500`}>
                              {money(Math.max(r.totalAmount - r.totalPaid, 0))}
                            </td>
                            <td className={tdCls}>
                              <Badge className={PAY_STATUS_BADGE[r.paymentStatus]}>{PAY_STATUS_LABEL[r.paymentStatus]}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="border-t border-slate-100 px-4 py-3">
                  <Pager page={page} total={total} limit={pageSize} rows={pageSize} onRowsChange={setPageSize} onChange={setPage} />
                  <p className="mt-2 text-[11px] text-slate-400">
                    Perbarui pembayaran dari halaman detail kelas ({fmtDate(new Date().toISOString())}).
                  </p>
                </div>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
