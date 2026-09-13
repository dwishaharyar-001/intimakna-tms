'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
  Input,
  PageHeader,
  Pager,
  Select,
  StatCard,
  thCls,
  tdCls,
  useResetPageOnSize,
  useRowsPerPage,
} from '@/components/ui';
import { WidgetBoard } from '@/components/widgets';
import {
  cn,
  fmtDate,
  money,
  BATCH_STATUS_BADGE,
  BATCH_STATUS_LABEL,
  DELIVERY_LABEL,
  EXPENSE_CATEGORY_LABEL,
  PAY_STATUS_BADGE,
  PAY_STATUS_LABEL,
  REG_STATUS_LABEL,
  type BatchRequirementRow,
  type BatchRequirements,
  type BatchStatus,
  type ExpenseCategory,
  type PaymentStatus,
} from '@/lib/core';

interface RevenueRow {
  id: string;
  participantId: string;
  participantName: string;
  company?: string | null;
  totalAmount: number;
  totalPaid: number;
  paymentStatus: PaymentStatus;
}

interface ParticipantRow {
  id: string;
  participant: { id: string; name: string; email?: string | null; phone: string; company?: string | null };
  registrationStatus: string;
  feedbackScore?: number | null;
  certificateNo?: string | null;
  revenue?: RevenueRow | null;
}

interface ExpenseRow {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description?: string | null;
  expenseDate: string;
}

interface BatchDetail {
  id: string;
  batchName: string;
  material?: { id: string; title: string; levelNumber: number | null; category?: string | null } | null;
  category?: string | null;
  description?: string | null;
  syllabus?: string | null;
  startDate: string;
  endDate: string;
  location?: string | null;
  status: BatchStatus;
  deliveryType?: 'REGULAR' | 'IN_HOUSE';
  clientName?: string | null;
  pricePerPax?: number | null;
  packagePrice?: number | null;
  packagePaid?: number;
  packagePaymentStatus?: PaymentStatus;
  participants: ParticipantRow[];
  totals?: { revenue: number; paidTotal: number; expense: number; net: number };
  expenses?: ExpenseRow[];
}

const PAY_STATUSES: PaymentStatus[] = ['UNPAID', 'PARTIAL', 'PAID'];
const EXPENSE_CATEGORIES: ExpenseCategory[] = ['VENUE', 'TRAINER_FEE', 'MODUL_ATK', 'CATERING', 'OTHER'];

export default function BatchDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { me } = useAuth();
  const isFinance = me?.role === 'FINANCE';
  const seeFinance = isFinance || me?.role === 'MANAGEMENT' || me?.role === 'ADMIN_TRAINING';

  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [partPage, setPartPage] = useState(1);
  const [partSize, setPartSize] = useRowsPerPage('batch-participants');
  useResetPageOnSize(partSize, setPartPage);
  const [error, setError] = useState('');
  const [expenseForm, setExpenseForm] = useState({
    category: 'VENUE',
    amount: '',
    description: '',
    expenseDate: '',
  });
  const [savingExpense, setSavingExpense] = useState(false);

  // editor pembayaran: revId -> draft
  const [payDrafts, setPayDrafts] = useState<Record<string, { totalPaid: string; paymentStatus: PaymentStatus }>>({});
  const [savingRevId, setSavingRevId] = useState<string | null>(null);

  // pembayaran paket (in-house)
  const [pkgPaid, setPkgPaid] = useState('');
  const [pkgStatus, setPkgStatus] = useState<PaymentStatus>('UNPAID');
  const [savingPkg, setSavingPkg] = useState(false);

  // checklist persiapan
  const canReq =
    me?.role === 'ADMIN_TRAINING' || me?.role === 'TRAINING_SUPPORT' || me?.role === 'SUPER_ADMIN';
  const canDelReq = me?.role === 'ADMIN_TRAINING' || me?.role === 'SUPER_ADMIN';
  const [reqs, setReqs] = useState<BatchRequirements | null>(null);
  const [reqDraft, setReqDraft] = useState({ title: '', note: '' });
  const [addingReq, setAddingReq] = useState(false);
  const [togglingReq, setTogglingReq] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        api<BatchDetail>(`/batches/${id}`),
        api<BatchRequirements>(`/batches/${id}/requirements`),
      ]);
      setDetail(d);
      setReqs(r);
      setPkgPaid(String(d.packagePaid ?? 0));
      setPkgStatus(d.packagePaymentStatus ?? 'UNPAID');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat batch');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !detail) {
    return (
      <div>
        <PageHeader title="Batch" />
        <ErrorNote message={error} />
      </div>
    );
  }
  if (!detail) return <p className="p-6 text-sm text-slate-400">Memuat…</p>;

  const batchId = detail.id;
  const isInHouse = detail.deliveryType === 'IN_HOUSE';

  async function toggleReq(item: BatchRequirementRow) {
    setTogglingReq(item.id);
    setError('');
    try {
      await api(`/requirements/${item.id}`, { method: 'PATCH', body: { isDone: !item.isDone } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memperbarui checklist');
    } finally {
      setTogglingReq(null);
    }
  }

  async function addRequirement(e: FormEvent) {
    e.preventDefault();
    if (!reqDraft.title.trim()) return;
    setAddingReq(true);
    setError('');
    try {
      await api(`/batches/${id}/requirements`, {
        method: 'POST',
        body: { title: reqDraft.title.trim(), note: reqDraft.note.trim() || undefined },
      });
      setReqDraft({ title: '', note: '' });
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal menambah item');
    } finally {
      setAddingReq(false);
    }
  }

  async function removeRequirement(item: BatchRequirementRow) {
    if (!window.confirm(`Hapus item "${item.title}"?`)) return;
    setError('');
    try {
      await api(`/requirements/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus item');
    }
  }

  async function savePackage() {
    setSavingPkg(true);
    setError('');
    try {
      await api(`/financials/batches/${batchId}/package`, {
        method: 'PATCH',
        body: { packagePaid: Number(pkgPaid || 0), packagePaymentStatus: pkgStatus },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan pembayaran paket');
    } finally {
      setSavingPkg(false);
    }
  }

  const totals = detail.totals;

  async function addExpense(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const batchId = detail.id;
    setSavingExpense(true);
    setError('');
    try {
      await api('/financials/expenses', {
        method: 'POST',
        body: {
          batchId,
          category: expenseForm.category,
          amount: Number(expenseForm.amount),
          description: expenseForm.description || undefined,
          expenseDate: expenseForm.expenseDate || undefined,
        },
      });
      setExpenseForm({ category: 'VENUE', amount: '', description: '', expenseDate: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengeluaran');
    } finally {
      setSavingExpense(false);
    }
  }

  async function savePayment(revId: string) {
    const draft = payDrafts[revId];
    if (!draft) return;
    setSavingRevId(revId);
    setError('');
    try {
      const res = await api<{ convertedLeadId: string | null }>(`/financials/revenues/${revId}`, {
        method: 'PATCH',
        body: {
          totalPaid: Number(draft.totalPaid),
          paymentStatus: draft.paymentStatus,
        },
      });
      if (res.convertedLeadId) {
        alert('Pembayaran lunas — lead terkait otomatis dikonversi menjadi CLOSED_WON (peserta).');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui pembayaran');
    } finally {
      setSavingRevId(null);
    }
  }

  const revDraft = (r: RevenueRow) => {
    const d = payDrafts[r.id];
    return d ?? { totalPaid: String(r.totalPaid), paymentStatus: r.paymentStatus };
  };

  return (
    <div>
      <PageHeader
        title={detail.batchName}
        desc={
          <>
            {detail.material?.title ?? detail.category ?? detail.batchName}
            {detail.material?.levelNumber ? ` · Level ${detail.material.levelNumber}` : ''} · batch “{detail.batchName}” ·{' '}
            {fmtDate(detail.startDate)} – {fmtDate(detail.endDate)}
            {detail.location ? ` · ${detail.location}` : ''}
            {' · '}
            <b>{DELIVERY_LABEL[detail.deliveryType ?? 'REGULAR']}</b>
            {isInHouse && detail.clientName ? ` · ${detail.clientName}` : ''}
          </>
        }
        actions={
          <Badge className={BATCH_STATUS_BADGE[detail.status]}>{BATCH_STATUS_LABEL[detail.status]}</Badge>
        }
      />

      <ErrorNote message={error} />

      <WidgetBoard
        pageKey="batch-detail"
        widgets={[
          ...(seeFinance && totals
            ? [
                {
                  key: 'summary',
                  label: 'Ringkasan Kelas',
                  node: (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={isInHouse ? 'Nilai Paket' : 'Revenue Kelas'} value={money(totals.revenue)} tone="accent" />
          <StatCard label={isInHouse ? 'Terbayar (Paket)' : 'Terkumpul'} value={money(totals.paidTotal)} tone="good" />
          <StatCard label="Expense" value={money(totals.expense)} tone="bad" />
          <StatCard
            label="Net Profit"
            value={money(totals.net)}
            tone={totals.net >= 0 ? 'good' : 'bad'}
            sub={`Margin ${totals.revenue ? ((totals.net / totals.revenue) * 100).toFixed(1) : 0}%`}
          />
        </div>
                  ),
                },
              ]
            : []),
          {
            key: 'ops',
            label: 'Peserta & Checklist',
            node: (
        <div className="space-y-5">
        <Card>
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
            Peserta ({detail.participants.length})
          </div>
          {detail.participants.length === 0 ? (
            <div className="p-4">
              <Empty>Belum ada peserta terdaftar.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thCls}>Peserta</th>
                    <th className={thCls}>Registrasi</th>
                    {seeFinance && !isInHouse ? <th className={thCls}>Pembayaran</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {detail.participants
                    .slice((partPage - 1) * partSize, partPage * partSize)
                    .map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className={tdCls}>
                        <p className="font-medium text-slate-800">{p.participant.name}</p>
                        <p className="text-xs text-slate-400">
                          {p.participant.company ?? ''} {p.participant.company ? ' · ' : ''}
                          {p.participant.phone}
                        </p>
                      </td>
                      <td className={tdCls}>
                        <Badge>
                          {REG_STATUS_LABEL[p.registrationStatus as keyof typeof REG_STATUS_LABEL] ?? p.registrationStatus}
                        </Badge>
                        {p.certificateNo ? (
                          <p className="mt-1 text-xs text-slate-400">Sertifikat: {p.certificateNo}</p>
                        ) : null}
                      </td>
                      {seeFinance && !isInHouse ? (
                        <td className={tdCls}>
                          {p.revenue ? (
                            isFinance ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    type="number"
                                    min={0}
                                    className="w-24! py-1 text-[11px] lg:w-28! lg:text-xs"
                                    value={revDraft(p.revenue).totalPaid}
                                    onChange={(e) =>
                                      setPayDrafts((prev) => ({
                                        ...prev,
                                        [p.revenue!.id]: { ...revDraft(p.revenue!), totalPaid: e.target.value },
                                      }))
                                    }
                                  />
                                  <span className="text-xs text-slate-400">/ {money(p.revenue.totalAmount)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Select
                                    className="w-28! py-1 text-[11px] lg:w-32! lg:text-xs"
                                    value={revDraft(p.revenue).paymentStatus}
                                    onChange={(e) =>
                                      setPayDrafts((prev) => ({
                                        ...prev,
                                        [p.revenue!.id]: {
                                          ...revDraft(p.revenue!),
                                          paymentStatus: e.target.value as PaymentStatus,
                                        },
                                      }))
                                    }
                                  >
                                    {PAY_STATUSES.map((s) => (
                                      <option key={s} value={s}>
                                        {PAY_STATUS_LABEL[s]}
                                      </option>
                                    ))}
                                  </Select>
                                  <Button
                                    size="sm"
                                    disabled={savingRevId === p.revenue.id}
                                    onClick={() => savePayment(p.revenue!.id)}
                                  >
                                    {savingRevId === p.revenue.id ? '…' : 'Simpan'}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <Badge className={PAY_STATUS_BADGE[p.revenue.paymentStatus]}>
                                  {PAY_STATUS_LABEL[p.revenue.paymentStatus]}
                                </Badge>
                                <p className="text-xs text-slate-400 tabular-nums">
                                  {money(p.revenue.totalPaid)} / {money(p.revenue.totalAmount)}
                                </p>
                              </div>
                            )
                          ) : (
                            <span className="text-xs text-slate-300">Tanpa tagihan</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {detail.participants.length > 0 ? (
            <div className="border-t border-slate-100 px-4 py-2.5 lg:px-5">
              <Pager page={partPage} total={detail.participants.length} limit={partSize} rows={partSize} onRowsChange={setPartSize} onChange={setPartPage} compact />
            </div>
          ) : null}
        </Card>

        {/* Checklist Persiapan */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 lg:px-5">
            <span className="text-sm font-semibold text-slate-800">Checklist Persiapan</span>
            {reqs ? (
              <span className="flex items-center gap-2">
                <Badge
                  className={
                    reqs.summary.done === reqs.summary.total && reqs.summary.total > 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }
                >
                  {reqs.summary.done}/{reqs.summary.total} selesai
                </Badge>
                {reqs.summary.total > 0 && reqs.summary.done < reqs.summary.total ? (
                  <span className="text-[11px] text-amber-600">persiapan belum lengkap</span>
                ) : null}
              </span>
            ) : null}
          </div>

          {reqs ? (
            <div className="p-4 lg:p-5">
              {reqs.summary.total > 0 ? (
                <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={
                      reqs.summary.done === reqs.summary.total ? 'h-full bg-emerald-500' : 'h-full bg-amber-400'
                    }
                    style={{ width: `${Math.round((reqs.summary.done / reqs.summary.total) * 100)}%` }}
                  />
                </div>
              ) : null}

              {[
                { key: 'DEFAULT', label: 'Default', items: reqs.defaultItems },
                { key: 'CUSTOM', label: 'Custom', items: reqs.customItems },
              ].map((g) => (
                <div key={g.key} className="mb-4 last:mb-0">
                  <p className="mb-1.5 flex items-center gap-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                    <span>{g.label}</span>
                    <span className="text-slate-300">
                      {g.items.filter((x) => x.isDone).length}/{g.items.length}
                    </span>
                  </p>
                  {g.items.length === 0 ? (
                    <p className="text-[12px] text-slate-400">Belum ada item {g.label.toLowerCase()}.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {g.items.map((item) => (
                        <li key={item.id} className="flex items-start gap-2.5 rounded-xl border border-slate-100 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={item.isDone}
                            disabled={!canReq || togglingReq === item.id}
                            onChange={() => toggleReq(item)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-[13px] font-medium', item.isDone ? 'text-slate-400 line-through' : 'text-slate-800')}>
                              {item.title}
                            </p>
                            {item.note ? <p className="text-[11px] text-slate-400">{item.note}</p> : null}
                            {item.isDone && item.doneBy ? (
                              <p className="text-[10px] text-emerald-600">
                                ✓ {item.doneBy.name}
                                {item.doneAt ? ` · ${fmtDate(item.doneAt)}` : ''}
                              </p>
                            ) : null}
                          </div>
                          {canDelReq ? (
                            <button
                              title="Hapus item"
                              onClick={() => removeRequirement(item)}
                              className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
                            >
                              ✕
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {canReq ? (
                <form onSubmit={addRequirement} className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-slate-50 p-3">
                  <Field label="Tambah item (bisa saat kelas berjalan)" className="w-full sm:w-64">
                    <Input
                      className="py-1.5 text-[13px]"
                      placeholder="cth: Spanduk Backdrop"
                      value={reqDraft.title}
                      onChange={(e) => setReqDraft({ ...reqDraft, title: e.target.value })}
                    />
                  </Field>
                  <Field label="Catatan (opsional)" className="w-full flex-1 sm:w-auto">
                    <Input
                      className="py-1.5 text-[13px]"
                      placeholder="cth: ukuran 3x2 m"
                      value={reqDraft.note}
                      onChange={(e) => setReqDraft({ ...reqDraft, note: e.target.value })}
                    />
                  </Field>
                  <Button type="submit" size="sm" disabled={addingReq || reqDraft.title.trim().length < 2}>
                    {addingReq ? 'Menyimpan…' : '+ Tambah (Custom)'}
                  </Button>
                </form>
              ) : null}
            </div>
          ) : (
            <div className="p-4">
              <Empty>Memuat checklist…</Empty>
            </div>
          )}
        </Card>
        </div>
            ),
          },
          {
            key: 'finance',
            label: 'Keuangan Kelas',
            node: (
        <div className="space-y-5">
          {isInHouse && seeFinance ? (
            <Card>
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
                Pembayaran Paket (In-House)
              </div>
              <div className="space-y-2 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Nilai paket</span>
                  <b className="tabular-nums">{money(detail.packagePrice ?? 0)}</b>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Terbayar</span>
                  <b className="tabular-nums text-emerald-600">{money(detail.packagePaid ?? 0)}</b>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Status</span>
                  <Badge className={PAY_STATUS_BADGE[detail.packagePaymentStatus ?? 'UNPAID']}>
                    {PAY_STATUS_LABEL[detail.packagePaymentStatus ?? 'UNPAID']}
                  </Badge>
                </div>

                {isFinance ? (
                  <div className="mt-2 space-y-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        className="w-28! py-1.5 text-[11px] lg:w-32! lg:text-xs"
                        value={pkgPaid}
                        onChange={(e) => setPkgPaid(e.target.value)}
                      />
                      <Select
                        className="w-32! py-1.5 text-[11px] lg:w-36! lg:text-xs"
                        value={pkgStatus}
                        onChange={(e) => setPkgStatus(e.target.value as PaymentStatus)}
                      >
                        {PAY_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {PAY_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </Select>
                      <Button size="sm" disabled={savingPkg} onClick={savePackage}>
                        {savingPkg ? '…' : 'Simpan'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Kelas in-house ditagih sebagai <b>harga paket</b> (bukan per peserta). Tandai “Lunas” untuk
                      menutup seluruh nilai paket.
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {seeFinance ? (
            <Card>
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
                Pengeluaran ({detail.expenses?.length ?? 0})
              </div>
              {detail.expenses && detail.expenses.length > 0 ? (
                <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                  {detail.expenses.map((ex) => (
                    <li key={ex.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div>
                        <p className="text-slate-700">
                          {EXPENSE_CATEGORY_LABEL[ex.category]}{' '}
                          <span className="text-xs font-normal text-slate-400">{fmtDate(ex.expenseDate)}</span>
                        </p>
                        {ex.description ? <p className="text-xs text-slate-400">{ex.description}</p> : null}
                      </div>
                      <p className="font-medium text-rose-600 tabular-nums">−{money(ex.amount)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4">
                  <Empty>Belum ada pengeluaran.</Empty>
                </div>
              )}

              {isFinance ? (
                <form onSubmit={addExpense} className="space-y-3 border-t border-slate-100 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Catat Pengeluaran</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Kategori">
                      <Select
                        className="py-1.5 text-xs"
                        value={expenseForm.category}
                        onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                      >
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {EXPENSE_CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Jumlah (Rp)">
                      <Input
                        required
                        type="number"
                        min={0}
                        className="py-1.5 text-xs"
                        value={expenseForm.amount}
                        onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="Deskripsi / Tanggal">
                    <div className="flex gap-2">
                      <Input
                        placeholder="cth: sewa venue"
                        className="py-1.5 text-xs"
                        value={expenseForm.description}
                        onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                      />
                      <Input
                        type="date"
                        className="w-32! py-1.5 text-[11px] lg:w-36! lg:text-xs"
                        value={expenseForm.expenseDate}
                        onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                      />
                    </div>
                  </Field>
                  <Button type="submit" size="sm" disabled={savingExpense} className="w-full">
                    {savingExpense ? 'Menyimpan…' : '+ Tambah Pengeluaran'}
                  </Button>
                </form>
              ) : null}
            </Card>
          ) : (
            <Card className="p-4">
              <p className="text-sm text-slate-500">
                Ringkasan finansial kelas hanya tersedia untuk peran Management, Finance, dan Admin Training.
              </p>
            </Card>
          )}
        </div>
            ),
          },
        ]}
      />
    </div>
  );
}
