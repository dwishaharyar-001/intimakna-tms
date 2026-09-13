'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Pager,
  Select,
  thCls,
  tdCls,
} from '@/components/ui';
import {
  cn,
  fmtDate,
  money,
  BATCH_STATUS_BADGE,
  BATCH_STATUS_LABEL,
  DELIVERY_BADGE,
  DELIVERY_LABEL,
  type BatchRow,
  type BatchStatus,
  type DeliveryType,
  type MaterialRow,
  type ProgramRow,
} from '@/lib/core';
import { WidgetBoard } from '@/components/widgets';
import { useResetPageOnSize, useRowsPerPage } from '@/components/ui';

type Tab = 'batches' | 'programs';
const STATUSES: BatchStatus[] = ['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'];

export default function BatchesPage() {
  const { me } = useAuth();
  const isAdmin = me?.role === 'ADMIN_TRAINING';
  const seeFinance =
    me?.role === 'FINANCE' || me?.role === 'MANAGEMENT' || me?.role === 'ADMIN_TRAINING';

  const [tab, setTab] = useState<Tab>('batches');
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [progPage, setProgPage] = useState(1);
  const [pageSize, setPageSize] = useRowsPerPage('training-classes');
  const [progPageSize, setProgPageSize] = useRowsPerPage('training-programs');
  useResetPageOnSize(pageSize, setPage);
  useResetPageOnSize(progPageSize, setProgPage);
  const [progTotal, setProgTotal] = useState(0);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // create forms
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchForm, setBatchForm] = useState({
    batchName: '',
    materialId: '',
    startDate: '',
    endDate: '',
    location: '',
    status: 'PLANNED',
    deliveryType: 'REGULAR' as DeliveryType,
    clientName: '',
    pricePerPax: '',
    packagePrice: '',
  });
  const [showProgramForm, setShowProgramForm] = useState(false);
  const [progForm, setProgForm] = useState({ title: '', category: '', description: '', standardPrice: '' });
  const [saving, setSaving] = useState(false);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ data: BatchRow[]; total: number }>(`/batches?paged=1&page=${page}&limit=${pageSize}`);
      setBatches(r.data);
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat batch');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  const loadPrograms = useCallback(async () => {
    try {
      const r = await api<{ data: ProgramRow[]; total: number }>(`/programs?paged=1&page=${progPage}&limit=${progPageSize}`);
      setPrograms(r.data);
      setProgTotal(r.total);
      setMaterials(await api<MaterialRow[]>('/materials'));
    } catch {
      /* abaikan */
    }
  }, [progPage]);

  useEffect(() => {
    loadBatches();
    loadPrograms();
  }, [loadBatches, loadPrograms]);

  async function createBatch(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/batches', {
        method: 'POST',
        body: {
          batchName: batchForm.batchName,
          materialId: batchForm.materialId,
          startDate: new Date(batchForm.startDate).toISOString(),
          endDate: new Date(batchForm.endDate).toISOString(),
          location: batchForm.location || undefined,
          status: batchForm.status || undefined,
          deliveryType: batchForm.deliveryType,
          clientName: batchForm.clientName || undefined,
          pricePerPax: batchForm.pricePerPax ? Number(batchForm.pricePerPax) : undefined,
          packagePrice: batchForm.packagePrice ? Number(batchForm.packagePrice) : undefined,
        },
      });
      setBatchForm({
        batchName: '',
        materialId: '',
        startDate: '',
        endDate: '',
        location: '',
        status: 'PLANNED',
        deliveryType: 'REGULAR',
        clientName: '',
        pricePerPax: '',
        packagePrice: '',
      });
      setShowBatchForm(false);
      await loadBatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat batch');
    } finally {
      setSaving(false);
    }
  }

  async function createProgram(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/programs', {
        method: 'POST',
        body: {
          title: progForm.title,
          category: progForm.category,
          description: progForm.description || undefined,
          standardPrice: Number(progForm.standardPrice),
        },
      });
      setProgForm({ title: '', category: '', description: '', standardPrice: '' });
      setShowProgramForm(false);
      await loadPrograms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat program');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Pelatihan"
        desc="Master data program & jadwal kelas reguler, serta pendaftaran peserta."
      />

      <ErrorNote message={error} />

      <WidgetBoard
        pageKey="training"
        widgets={[
          {
            key: 'classes',
            label: 'Kelas Reguler',
            node: (
        <div className="space-y-4">
          <div className="flex justify-end">
            {isAdmin ? (
              <Button onClick={() => setShowBatchForm((v) => !v)}>
                {showBatchForm ? 'Tutup' : '+ Tambah Kelas'}
              </Button>
            ) : null}
          </div>

          {isAdmin && showBatchForm ? (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Tambah Kelas Reguler</p>
              <form onSubmit={createBatch} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Judul Materi *">
                  <Select
                    required
                    value={batchForm.materialId}
                    onChange={(e) => setBatchForm({ ...batchForm, materialId: e.target.value })}
                  >
                    <option value="">— Pilih Judul Materi —</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.levelNumber ? `Level ${m.levelNumber} · ` : ''}{m.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Nama Kelas *">
                  <Input
                    required
                    placeholder="cth: ELLM-B4 2026"
                    value={batchForm.batchName}
                    onChange={(e) => setBatchForm({ ...batchForm, batchName: e.target.value })}
                  />
                </Field>
                <Field label="Bentuk Pelaksanaan">
                  <Select
                    value={batchForm.deliveryType}
                    onChange={(e) => setBatchForm({ ...batchForm, deliveryType: e.target.value as DeliveryType })}
                  >
                    <option value="REGULAR">Kelas Reguler (per peserta)</option>
                    <option value="IN_HOUSE">In-House Korporat (paket)</option>
                  </Select>
                </Field>
                {batchForm.deliveryType === 'IN_HOUSE' ? (
                  <>
                    <Field label="Nama Korporat *">
                      <Input
                        required
                        placeholder="cth: PT Nusantara Jaya"
                        value={batchForm.clientName}
                        onChange={(e) => setBatchForm({ ...batchForm, clientName: e.target.value })}
                      />
                    </Field>
                    <Field label="Harga Paket (Rp) *" hint="Dibayar sekali oleh korporat.">
                      <Input
                        required
                        type="number"
                        min={0}
                        value={batchForm.packagePrice}
                        onChange={(e) => setBatchForm({ ...batchForm, packagePrice: e.target.value })}
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="Harga per Peserta (Rp) *" hint="Harga jual kelas per peserta.">
                    <Input
                      required
                      type="number"
                      min={0}
                      value={batchForm.pricePerPax}
                      onChange={(e) => setBatchForm({ ...batchForm, pricePerPax: e.target.value })}
                    />
                  </Field>
                )}
                <Field label="Status">
                  <Select value={batchForm.status} onChange={(e) => setBatchForm({ ...batchForm, status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {BATCH_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tanggal Mulai *">
                  <Input
                    required
                    type="date"
                    value={batchForm.startDate}
                    onChange={(e) => setBatchForm({ ...batchForm, startDate: e.target.value })}
                  />
                </Field>
                <Field label="Tanggal Selesai *">
                  <Input
                    required
                    type="date"
                    value={batchForm.endDate}
                    onChange={(e) => setBatchForm({ ...batchForm, endDate: e.target.value })}
                  />
                </Field>
                <Field label="Lokasi">
                  <Input
                    placeholder="Kota / venue"
                    value={batchForm.location}
                    onChange={(e) => setBatchForm({ ...batchForm, location: e.target.value })}
                  />
                </Field>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Button type="submit" disabled={saving || !batchForm.materialId}>
                    {saving ? 'Menyimpan…' : 'Simpan Kelas'}
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          <Card>
            {loading ? (
              <div className="p-6 text-sm text-slate-400">Memuat…</div>
            ) : batches.length === 0 ? (
              <div className="p-4">
                <Empty>Belum ada kelas.</Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={thCls}>Kelas</th>
                      <th className={thCls}>Jadwal</th>
                      <th className={thCls}>Lokasi</th>
                      <th className={thCls}>Bentuk</th>
                      <th className={thCls}>Status</th>
                      <th className={`${thCls} text-center`}>Peserta</th>
                      {seeFinance ? (
                        <>
                          <th className={`${thCls} text-right`}>Revenue</th>
                          <th className={`${thCls} text-right`}>Expense</th>
                          <th className={`${thCls} text-right`}>Net</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/60">
                        <td className={tdCls}>
                          <Link href={`/batches/${b.id}`} className="font-medium text-indigo-600 hover:underline">
                            {b.batchName}
                          </Link>
                          <p className="text-xs text-slate-400">
                            {b.material?.title ?? b.category ?? '—'}
                            {b.material?.levelNumber ? ` · Level ${b.material.levelNumber}` : ''} · batch “{b.batchName}”
                          </p>
                        </td>
                        <td className={`${tdCls} text-slate-500`}>
                          {fmtDate(b.startDate)} – {fmtDate(b.endDate)}
                        </td>
                        <td className={tdCls}>{b.location ?? '—'}</td>
                        <td className={tdCls}>
                          <Badge className={DELIVERY_BADGE[b.deliveryType ?? 'REGULAR']}>
                            {DELIVERY_LABEL[b.deliveryType ?? 'REGULAR']}
                          </Badge>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {(b.deliveryType ?? 'REGULAR') === 'IN_HOUSE'
                              ? `Paket ${money(b.packagePrice ?? 0)}`
                              : b.pricePerPax != null
                                ? `${money(b.pricePerPax)} /peserta`
                                : 'ikut program'}
                          </p>
                        </td>
                        <td className={tdCls}>
                          <Badge className={BATCH_STATUS_BADGE[b.status]}>{BATCH_STATUS_LABEL[b.status]}</Badge>
                          {typeof b.requirementsTotal === 'number' && b.requirementsTotal > 0 ? (
                            <Badge
                              className={
                                b.requirementsDone === b.requirementsTotal
                                  ? 'ml-1 bg-emerald-100 text-emerald-700'
                                  : 'ml-1 bg-amber-100 text-amber-700'
                              }
                              title="Progress checklist persiapan"
                            >
                              ☑ {b.requirementsDone}/{b.requirementsTotal}
                            </Badge>
                          ) : null}
                        </td>
                        <td className={`${tdCls} text-center`}>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            {b.participantCount}
                          </span>
                        </td>
                        {seeFinance ? (
                          <>
                            <td className={`${tdCls} text-right tabular-nums`}>{money(b.revenue ?? 0)}</td>
                            <td className={`${tdCls} text-right tabular-nums text-rose-600`}>{money(b.expense ?? 0)}</td>
                            <td
                              className={cn(
                                `${tdCls} text-right font-semibold tabular-nums`,
                                (b.net ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600',
                              )}
                            >
                              {money(b.net ?? 0)}
                            </td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="pt-1">
            <Pager page={page} total={total} limit={pageSize} rows={pageSize} onRowsChange={setPageSize} onChange={setPage} />
          </div>
        </div>
            ),
          },
          {
            key: 'programs',
            label: 'Program Pelatihan',
            node: (
        <div className="space-y-4">
          <div className="flex justify-end">
            {isAdmin ? (
              <Button onClick={() => setShowProgramForm((v) => !v)}>
                {showProgramForm ? 'Tutup' : '+ Program Baru'}
              </Button>
            ) : null}
          </div>

          {isAdmin && showProgramForm ? (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Buat Program Pelatihan</p>
              <form onSubmit={createProgram} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Judul *">
                  <Input required value={progForm.title} onChange={(e) => setProgForm({ ...progForm, title: e.target.value })} />
                </Field>
                <Field label="Kategori *">
                  <Input required placeholder="Leadership / Komunikasi / TOT…" value={progForm.category} onChange={(e) => setProgForm({ ...progForm, category: e.target.value })} />
                </Field>
                <Field label="Harga Standar (Rp) *">
                  <Input required type="number" min={0} value={progForm.standardPrice} onChange={(e) => setProgForm({ ...progForm, standardPrice: e.target.value })} />
                </Field>
                <Field label="Deskripsi">
                  <Input value={progForm.description} onChange={(e) => setProgForm({ ...progForm, description: e.target.value })} />
                </Field>
                <div className="sm:col-span-2 lg:col-span-4">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Menyimpan…' : 'Simpan Program'}
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          <Card>
            {programs.length === 0 ? (
              <div className="p-4">
                <Empty>Belum ada program.</Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={thCls}>Program</th>
                      <th className={thCls}>Kategori</th>
                      <th className={`${thCls} text-right`}>Harga Standar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programs.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/60">
                        <td className={tdCls}>
                          <p className="font-medium text-slate-800">{p.title}</p>
                          {p.description ? <p className="text-xs text-slate-400">{p.description}</p> : null}
                        </td>
                        <td className={tdCls}>
                          <Badge className="bg-slate-100 text-slate-600">{p.category}</Badge>
                        </td>
                        <td className={`${tdCls} text-right font-medium tabular-nums`}>{money(p.standardPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="pt-1">
            <Pager page={progPage} total={progTotal} limit={progPageSize} rows={progPageSize} onRowsChange={setProgPageSize} onChange={setProgPage} />
          </div>
        </div>
            ),
          },
        ]}
      />
    </div>
  );
}
