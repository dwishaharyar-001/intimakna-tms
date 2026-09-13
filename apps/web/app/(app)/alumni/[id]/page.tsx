'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  PageHeader,
  Select,
  thCls,
  tdCls,
} from '@/components/ui';
import {
  fmtDate,
  money,
  PAY_STATUS_BADGE,
  PAY_STATUS_LABEL,
  REG_STATUS_LABEL,
  STAGE_BADGE,
  LEAD_SOURCE_LABEL,
  type BatchRow,
  type PaymentStatus,
  type StageKind,
} from '@/lib/core';

interface HistoryRow {
  id: string;
  batchId: string;
  materialTitle?: string | null;
  materialLevel?: number | null;
  category?: string | null;
  batchName: string;
  startDate: string;
  endDate: string;
  location?: string | null;
  registrationStatus: string;
  feedbackScore?: number | null;
  certificateNo?: string | null;
}

interface RevenueRow {
  id: string;
  batchId: string;
  batchName: string;
  category?: string | null;
  materialTitle?: string | null;
  totalAmount: number;
  totalPaid: number;
  paymentStatus: PaymentStatus;
}

interface Detail {
  id: string;
  name: string;
  email?: string | null;
  phone: string;
  company?: string | null;
  position?: string | null;
  notes?: string | null;
  createdAt: string;
  histories: HistoryRow[];
  revenues: RevenueRow[];
  leads: Array<{
    id: string;
    source: string;
    createdAt: string;
    stage: { id: string; label: string; kind: StageKind } | null;
  }>;
}

export default function AlumniDetailPage() {
  const params = useParams<{ id: string }>();
  const { me } = useAuth();
  const id = params.id;
  const canEnroll = me?.role === 'SALES_MARKETING' || me?.role === 'ADMIN_TRAINING';

  const [detail, setDetail] = useState<Detail | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [error, setError] = useState('');
  const [batchId, setBatchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState('');

  useEffect(() => {
    api<Detail>(`/alumni/${id}`).then(setDetail).catch((e) => setError(e.message));
    api<BatchRow[]>('/batches')
      .then((bs) => setBatches(bs.filter((b) => b.status === 'PLANNED' || b.status === 'ONGOING')))
      .catch(() => undefined);
  }, [id]);

  if (error) {
    return (
      <div>
        <PageHeader title="Alumni" />
        <ErrorNote message={error} />
      </div>
    );
  }
  if (!detail) return <p className="p-6 text-sm text-slate-400">Memuat…</p>;

  async function enroll() {
    if (!detail || !batchId) return;
    const alumniId = detail.id;
    setBusy(true);
    setOkMsg('');
    setError('');
    try {
      await api(`/alumni/${alumniId}/enroll`, { method: 'POST', body: { batchId } });
      setOkMsg('Berhasil didaftarkan ke kelas; tagihan dibuat otomatis.');
      setBatchId('');
      const fresh = await api<Detail>(`/alumni/${alumniId}`);
      setDetail(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mendaftarkan');
    } finally {
      setBusy(false);
    }
  }

  const totalTagihan = detail.revenues.reduce((a, r) => a + r.totalAmount, 0);
  const totalTerkumpul = detail.revenues.reduce((a, r) => a + r.totalPaid, 0);

  return (
    <div>
      <PageHeader
        title={detail.name}
        desc={`Alumni sejak ${fmtDate(detail.createdAt)}`}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Profil */}
        <Card className="h-fit p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">
              {detail.name.slice(0, 1)}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{detail.company ?? 'Individu'}</p>
              <p className="text-sm text-slate-400">{detail.position ?? '—'}</p>
            </div>
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Telepon</dt>
              <dd className="text-slate-700">{detail.phone}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Email</dt>
              <dd className="text-slate-700">{detail.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Total tagihan</dt>
              <dd className="tabular-nums text-slate-700">{money(totalTagihan)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Terkumpul</dt>
              <dd className="font-medium text-emerald-600 tabular-nums">{money(totalTerkumpul)}</dd>
            </div>
          </dl>
          {detail.notes ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {detail.notes}
            </p>
          ) : null}
        </Card>

        {/* Riwayat + enroll */}
        <div className="space-y-5 lg:col-span-2">
          {canEnroll ? (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Daftarkan ke Batch Baru</p>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Kelas" className="min-w-64 flex-1">
                  <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                    <option value="">— Pilih kelas (Direncanakan / Berjalan) —</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchName}{b.material?.title ? ` · ${b.material.title}` : b.category ? ` · ${b.category}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button disabled={!batchId || busy} onClick={enroll}>
                  {busy ? 'Mendaftarkan…' : 'Daftarkan & Buat Tagihan'}
                </Button>
              </div>
              <div className="mt-2">
                <ErrorNote message={error} />
                {okMsg ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {okMsg}
                  </p>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card>
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
              Riwayat Pelatihan ({detail.histories.length})
            </div>
            {detail.histories.length === 0 ? (
              <div className="p-4">
                <Empty>Belum ada riwayat pelatihan.</Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={thCls}>Program</th>
                      <th className={thCls}>Batch</th>
                      <th className={thCls}>Tanggal</th>
                      <th className={thCls}>Lokasi</th>
                      <th className={thCls}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.histories.map((h) => (
                      <tr key={h.id}>
                        <td className={tdCls}>
                          <p className="font-medium text-slate-800">
                            {h.materialTitle ?? h.category ?? h.batchName}
                            {h.materialLevel ? ` · Level ${h.materialLevel}` : ''}
                          </p>
                          {h.certificateNo ? (
                            <p className="text-xs text-slate-400">Sertifikat: {h.certificateNo}</p>
                          ) : null}
                        </td>
                        <td className={tdCls}>{h.batchName}</td>
                        <td className={`${tdCls} text-slate-500`}>
                          {fmtDate(h.startDate)} – {fmtDate(h.endDate)}
                        </td>
                        <td className={tdCls}>{h.location ?? '—'}</td>
                        <td className={tdCls}>
                          <Badge>{REG_STATUS_LABEL[h.registrationStatus as keyof typeof REG_STATUS_LABEL] ?? h.registrationStatus}</Badge>
                          {h.feedbackScore != null ? (
                            <span className="ml-1 text-xs text-amber-500">★ {h.feedbackScore}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
              Tagihan & Pembayaran
            </div>
            {detail.revenues.length === 0 ? (
              <div className="p-4">
                <Empty>Belum ada tagihan.</Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={thCls}>Batch</th>
                      <th className={`${thCls} text-right`}>Tagihan</th>
                      <th className={`${thCls} text-right`}>Terbayar</th>
                      <th className={thCls}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.revenues.map((r) => (
                      <tr key={r.id}>
                        <td className={tdCls}>
                          <p className="text-slate-800">{r.batchName}</p>
                          <p className="text-xs text-slate-400">{r.materialTitle ?? r.category ?? '—'}</p>
                        </td>
                        <td className={`${tdCls} text-right tabular-nums`}>{money(r.totalAmount)}</td>
                        <td className={`${tdCls} text-right tabular-nums text-emerald-600`}>
                          {money(r.totalPaid)}
                        </td>
                        <td className={tdCls}>
                          <Badge className={PAY_STATUS_BADGE[r.paymentStatus]}>
                            {PAY_STATUS_LABEL[r.paymentStatus]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
              Lead Terkait
            </div>
            {detail.leads.length === 0 ? (
              <div className="p-4">
                <Empty>Tidak ada lead tertaut.</Empty>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {detail.leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate-500">{LEAD_SOURCE_LABEL[l.source as keyof typeof LEAD_SOURCE_LABEL] ?? l.source}</span>
                    <Badge className={STAGE_BADGE[l.stage?.kind ?? 'OPEN']}>
                      {l.stage?.label ?? '—'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
