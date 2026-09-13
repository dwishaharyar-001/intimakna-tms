'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
} from '@/components/ui';
import {
  cn,
  fmtDate,
  LEAD_SOURCE_LABEL,
  STAGE_BADGE,
  STAGE_DOT,
  ACTIVITY_ICON,
  ACTIVITY_OUTCOME_LABEL,
  ACTIVITY_TYPE_LABEL,
  type ActivityOutcome,
  type ActivityType,
  type BatchRow,
  type LeadRow,
  type LeadSource,
  type ProgramRow,
  type StageRow,
  type UserRow,
} from '@/lib/core';
import { useRowsPerPage } from '@/components/ui';
import { WidgetBoard } from '@/components/widgets';

const SOURCES: LeadSource[] = ['WHATSAPP', 'CALL', 'ALUMNI_REFERRAL', 'POST_TRAINING'];
const EMPTY_FORM = {
  source: 'WHATSAPP',
  name: '',
  company: '',
  phone: '',
  email: '',
  assignedToId: '',
  interestProgramId: '',
  interestBatchId: '',
};

export default function LeadsPage() {
  const { me } = useAuth();
  const isSales = me?.role === 'SALES_MARKETING';

  const [stages, setStages] = useState<StageRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [salesUsers, setSalesUsers] = useState<UserRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // filter
  const [search, setSearch] = useState('');
  const [fSource, setFSource] = useState('');

  // create
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // drag & drop
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [colPages, setColPages] = useState<Record<string, number>>({});
  const [kanbanSize, setKanbanSize] = useRowsPerPage('leads-kanban');

  // modal wajib-catatan saat pindah kolom
  const [stageModal, setStageModal] = useState<{
    leadId: string;
    leadName: string;
    toStage: StageRow;
    type: ActivityType;
    summary: string;
    outcome: ActivityOutcome | '';
  } | null>(null);
  const [savingStage, setSavingStage] = useState(false);
  const endOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);

  // enroll per kartu
  const [enrollFor, setEnrollFor] = useState<{ leadId: string; batchId: string } | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, l] = await Promise.all([
        api<StageRow[]>('/lead-stages'),
        api<{ data: LeadRow[] }>('/leads?limit=500'),
      ]);
      setStages(s);
      setLeads(l.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat leads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<UserRow[]>('/users')
      .then((us) => setSalesUsers(us.filter((u) => u.role === 'SALES_MARKETING' && u.isActive)))
      .catch(() => undefined);
    api<BatchRow[]>('/batches')
      .then((bs) => setBatches(bs.filter((b) => b.status === 'PLANNED' || b.status === 'ONGOING')))
      .catch(() => undefined);
    api<ProgramRow[]>('/programs').then(setPrograms).catch(() => undefined);
  }, []);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, assignedToId: isSales && me ? me.id : '' });
    setShowCreate(true);
  };

  const visibleLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (fSource && l.source !== fSource) return false;
      if (!q) return true;
      return [l.name, l.company ?? '', l.phone, l.email ?? ''].some((t) =>
        t.toLowerCase().includes(q),
      );
    });
  }, [leads, search, fSource]);

  const columns = useMemo(() => {
    const map = new Map(stages.map((s) => [s.id, [] as LeadRow[]]));
    for (const l of visibleLeads) {
      const bucket = map.get(l.stage?.id ?? '');
      if (bucket) bucket.push(l);
    }
    return stages.map((s) => ({ stage: s, items: map.get(s.id) ?? [] }));
  }, [stages, visibleLeads]);

  async function submitStageChange(e: FormEvent) {
    e.preventDefault();
    if (!stageModal) return;
    setSavingStage(true);
    setError('');
    try {
      await api(`/leads/${stageModal.leadId}`, {
        method: 'PATCH',
        body: {
          stageId: stageModal.toStage.id,
          activity: {
            type: stageModal.type,
            summary: stageModal.summary,
            outcome: stageModal.outcome || undefined,
          },
        },
      });
      setMsg(`Lead "${stageModal.leadName}" dipindah ke "${stageModal.toStage.label}" (catatan aktivitas tersimpan).`);
      setStageModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memindahkan lead');
    } finally {
      setSavingStage(false);
    }
  }

  function onDrop(e: DragEvent, stage: StageRow) {
    e.preventDefault();
    setOverStage(null);
    if (!dragId) return;
    const lead = leads.find((l) => l.id === dragId);
    setDragId(null);
    if (!lead || lead.stage?.id === stage.id) return;
    // Aturan: pindah status wajib disertai catatan aktivitas
    setStageModal({
      leadId: lead.id,
      leadName: lead.name,
      toStage: stage,
      type: 'CALL',
      summary: '',
      outcome: '',
    });
  }

  async function createLead(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const res = await api<LeadRow>('/leads', {
        method: 'POST',
        body: {
          ...form,
          assignedToId: form.assignedToId || undefined,
          interestProgramId: form.interestProgramId || undefined,
          interestBatchId: form.interestBatchId || undefined,
        },
      });
      setMsg(`Lead "${res.name}" masuk ke kolom "${res.stage?.label ?? 'Baru'}".`);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  async function assignLead(leadId: string, value: string) {
    setError('');
    try {
      await api(`/leads/${leadId}`, { method: 'PATCH', body: { assignedToId: value || null } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah penugasan');
    }
  }

  async function doEnroll(leadId: string) {
    if (!enrollFor?.batchId) return;
    setEnrolling(true);
    setError('');
    setMsg('');
    try {
      const res = await api<{ participantId: string }>(`/leads/${leadId}/enroll`, {
        method: 'POST',
        body: { batchId: enrollFor.batchId },
      });
      setMsg(`Lead didaftarkan ke kelas (peserta ${res.participantId.slice(0, 8)}…). Tagihan dibuat otomatis.`);
      setEnrollFor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mendaftarkan');
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Leads Pipeline"
        desc="Seret kartu antar kolom untuk mengubah status. Susunan kolom diatur Super Admin di menu Konfigurasi."
        actions={
          <Button onClick={showCreate ? () => setShowCreate(false) : openCreate}>
            {showCreate ? 'Tutup Form' : '+ Lead Baru'}
          </Button>
        }
      />

      <WidgetBoard
        pageKey="leads"
        widgets={[
          {
            key: 'newLead',
            label: 'Form Lead Baru',
            node: (
        <>
      {showCreate ? (
        <Card className="mb-4 p-5">
          <form onSubmit={createLead} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Sumber">
              <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_SOURCE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nama *">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="No. HP / WA *">
              <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Perusahaan">
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field
              label="Ditugaskan ke"
              hint={isSales ? 'Default: akun sales yang sedang login.' : 'Menampilkan semua akun sales terdaftar.'}
            >
              <Select
                value={form.assignedToId}
                onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
              >
                <option value="">— Pilih sales —</option>
                {salesUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.id === me?.id ? '(saya)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Program Diminati (opsional)" hint="Program custom (berdiri sendiri).">
              <Select
                value={form.interestProgramId}
                onChange={(e) => setForm({ ...form, interestProgramId: e.target.value })}
              >
                <option value="">— Tanpa program —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kelas Reguler Spesifik (opsional)" hint="Menu training default — kosongkan bila masih umum.">
              <Select
                value={form.interestBatchId}
                onChange={(e) => setForm({ ...form, interestBatchId: e.target.value })}
              >
                <option value="">— Tanpa kelas —</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchName}{b.category ? ` · ${b.category}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Menyimpan…' : 'Simpan Lead'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                Batal
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
        </>
            ),
          },
          {
            key: 'pipeline',
            label: 'Kanban Pipeline',
            canHide: false,
            node: (
        <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          className="w-44!"
          value={String(kanbanSize)}
          onChange={(e) => {
            setKanbanSize(Number(e.target.value));
            setColPages({});
          }}
          title="Jumlah kartu per kolom — atur sendiri"
        >
          {[5, 10, 25, 50, 100, 250].map((n) => (
            <option key={n} value={n}>
              {n} kartu/kolom
            </option>
          ))}
        </Select>
        <Input
          placeholder="Cari nama / perusahaan / HP / email…"
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select className="w-44!" value={fSource} onChange={(e) => setFSource(e.target.value)}>
          <option value="">Sumber</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABEL[s]}
            </option>
          ))}
        </Select>
        <div className="ml-auto text-xs text-slate-400">
          {visibleLeads.length} lead · {stages.length} kolom
        </div>
      </div>

      <ErrorNote message={error} />
      {msg ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {msg}
        </div>
      ) : null}

      {/* Kanban */}
      {loading ? (
        <p className="py-8 text-sm text-slate-400">Memuat kanban…</p>
      ) : stages.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          Pipeline belum punya kolom. Minta <b>Super Admin</b> membuat tahap status di menu Konfigurasi.
        </Card>
      ) : (
        <div className="-mx-2 overflow-x-auto px-2 pb-4">
          <div className="flex min-w-max items-start gap-3">
            {columns.map(({ stage, items }) => (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(stage.id);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                onDrop={(e) => onDrop(e, stage)}
                className={cn(
                  'w-[248px] shrink-0 rounded-[20px] border bg-slate-100/70 p-2.5 transition sm:w-[272px]',
                  overStage === stage.id ? 'border-[#E53935] bg-[#FDECEA]/60' : 'border-transparent',
                )}
              >
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_DOT[stage.kind] }} />
                  <p className="text-sm font-bold text-slate-800">{stage.label}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 shadow-sm">
                    {items.length}
                  </span>
                  {items.length > 10 ? (
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        disabled={(colPages[stage.id] ?? 1) <= 1}
                        onClick={() => setColPages((p) => ({ ...p, [stage.id]: (p[stage.id] ?? 1) - 1 }))}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:opacity-30"
                      >
                        ‹
                      </button>
                      <span className="text-[10px] text-slate-400">
                        {colPages[stage.id] ?? 1}/{Math.max(1, Math.ceil(items.length / kanbanSize))}
                      </span>
                      <button
                        disabled={(colPages[stage.id] ?? 1) >= Math.ceil(items.length / kanbanSize)}
                        onClick={() => setColPages((p) => ({ ...p, [stage.id]: (p[stage.id] ?? 1) + 1 }))}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:opacity-30"
                      >
                        ›
                      </button>
                    </span>
                  ) : stage.kind === 'WON' ? (
                    <span className="ml-auto text-xs" title="Terminal: menang">
                      🏆
                    </span>
                  ) : stage.kind === 'LOST' ? (
                    <span className="ml-auto text-xs" title="Terminal: gagal">
                      ⛔
                    </span>
                  ) : null}
                </div>

                <div className="min-h-[60px] space-y-2 pt-1">
                  {items.slice(((colPages[stage.id] ?? 1) - 1) * kanbanSize, (colPages[stage.id] ?? 1) * kanbanSize).map((l) => (
                    <Card
                      key={l.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', l.id);
                        setDragId(l.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverStage(null);
                      }}
                      className={cn(
                        'cursor-grab p-3 transition active:cursor-grabbing',
                        dragId === l.id ? 'rotate-2 opacity-50' : 'hover:shadow-md',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white',
                          )}
                          style={{ background: STAGE_DOT[l.stage?.kind ?? 'OPEN'] }}
                        >
                          {l.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/leads/${l.id}`}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="block truncate text-[13px] leading-tight font-bold text-slate-900 hover:text-[#E53935] hover:underline"
                          >
                            {l.name}
                          </Link>
                          <p className="truncate text-[11px] text-slate-400">
                            {l.company ? `${l.company} · ` : ''}
                            {l.phone}
                          </p>
                        </div>
                        <span className="cursor-grab text-slate-300" title="Seret untuk pindah kolom">
                          ⠿
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Badge className="bg-slate-100 text-slate-500">
                          {LEAD_SOURCE_LABEL[l.source]}
                        </Badge>
                        {(() => {
                          const acts = l.activities ?? [];
                          const planned = acts.find((a) => a.status === 'PLANNED');
                          const due = !!planned?.scheduledAt && new Date(planned.scheduledAt).getTime() <= endOfToday;
                          return (
                            <>
                              <Badge className="bg-slate-100 text-slate-600" title="Jumlah aktivitas follow-up">
                                📋 {l._count?.activities ?? acts.length}
                              </Badge>
                              {planned ? (
                                <Badge
                                  className={due ? 'bg-[#FDECEA] text-[#E53935]' : 'bg-amber-100 text-amber-700'}
                                  title={`Follow-up berikutnya: ${ACTIVITY_TYPE_LABEL[planned.type]}${
                                    planned.scheduledAt ? ` — ${fmtDate(planned.scheduledAt)}` : ''
                                  }`}
                                >
                                  {due ? '⏰ ' : '🗓 '}
                                  {ACTIVITY_TYPE_LABEL[planned.type]}
                                  {planned.scheduledAt ? ` · ${fmtDate(planned.scheduledAt)}` : ''}
                                </Badge>
                              ) : null}
                            </>
                          );
                        })()}
                        {l.participant ? (
                          <Badge className="bg-emerald-100 text-emerald-700">peserta ✓</Badge>
                        ) : null}
                        {l.interestBatch || l.interestProgram ? (
                          <Badge className="bg-[#F3E8FF] text-[#7E57C2]">
                            🎯 {l.interestBatch?.batchName ?? l.interestProgram?.title}
                          </Badge>
                        ) : null}
                        <span className="ml-auto text-[10px] text-slate-300">{fmtDate(l.createdAt)}</span>
                      </div>

                      <div className="mt-2.5 flex items-center gap-1.5 border-t border-slate-100 pt-2">
                        <Select
                          title="Ditugaskan ke"
                          className="h-7 rounded-full px-2 py-0 text-[11px] shadow-none"
                          value={l.assignedTo?.id ?? ''}
                          onChange={(e) => assignLead(l.id, e.target.value)}
                        >
                          <option value="">Sales: —</option>
                          {salesUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto px-2 py-1 text-[11px]"
                          onClick={() =>
                            setEnrollFor(enrollFor?.leadId === l.id ? null : { leadId: l.id, batchId: '' })
                          }
                        >
                          {enrollFor?.leadId === l.id ? 'Batal' : '⇄ Kelas'}
                        </Button>
                      </div>

                      {enrollFor?.leadId === l.id ? (
                        <div className="mt-2 flex items-center gap-1.5">
                          <Select
                            className="h-7 rounded-full px-2 py-0 text-[11px] shadow-none"
                            value={enrollFor.batchId}
                            onChange={(e) => setEnrollFor({ ...enrollFor, batchId: e.target.value })}
                          >
                            <option value="">— Pilih kelas —</option>
                            {batches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.batchName}{b.category ? ` · ${b.category}` : ''}
                              </option>
                            ))}
                          </Select>
                          <Button
                            size="sm"
                            className="px-2 py-1 text-[11px]"
                            disabled={!enrollFor.batchId || enrolling}
                            onClick={() => doEnroll(l.id)}
                          >
                            Daftar
                          </Button>
                        </div>
                      ) : null}
                    </Card>
                  ))}
                  {items.length === 0 ? (
                    <div
                      title="Seret lead ke sini"
                      className="rounded-2xl border border-dashed border-slate-300 px-3 py-5 text-center text-[11px] text-slate-400"
                    >
                      Kosong
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      </>
            ),
          },
          {
            key: 'notes',
            label: 'Catatan',
            node: (
        <>
      <p className="mt-2 text-center text-[11px] text-slate-400 lg:hidden">
        ↔ Geser ke samping untuk melihat kolom status lainnya
      </p>
        </>
            ),
          },
        ]}
      />

      {/* Modal wajib-catatan saat pindah kolom */}
      {stageModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Card className="w-full max-w-md p-5">
            <p className="text-[13px] text-slate-500">Pindahkan lead</p>
            <p className="text-base font-bold text-slate-900">{stageModal.leadName}</p>
            <p className="mt-0.5 text-[13px] text-slate-500">
              ke kolom <b className="text-[#E53935]">{stageModal.toStage.label}</b>
            </p>
            <form onSubmit={submitStageChange} className="mt-4 space-y-3">
              <Field label="Jenis follow-up *">
                <Select
                  value={stageModal.type}
                  onChange={(e) => setStageModal({ ...stageModal, type: e.target.value as ActivityType })}
                >
                  {(Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[]).map((t) => (
                    <option key={t} value={t}>
                      {ACTIVITY_ICON[t]} {ACTIVITY_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Catatan aktivitas *" hint="Wajib — perubahan status lead harus punya jejak follow-up.">
                <Input
                  required
                  minLength={3}
                  placeholder="cth: telepon, minta jadwal presentasi"
                  value={stageModal.summary}
                  onChange={(e) => setStageModal({ ...stageModal, summary: e.target.value })}
                />
              </Field>
              <Field label="Hasil (opsional)">
                <Select
                  value={stageModal.outcome}
                  onChange={(e) => setStageModal({ ...stageModal, outcome: e.target.value as ActivityOutcome | '' })}
                >
                  <option value="">— Tanpa hasil —</option>
                  {(Object.keys(ACTIVITY_OUTCOME_LABEL) as ActivityOutcome[]).map((o) => (
                    <option key={o} value={o}>
                      {ACTIVITY_OUTCOME_LABEL[o]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setStageModal(null)}>
                  Batal
                </Button>
                <Button type="submit" disabled={savingStage || stageModal.summary.trim().length < 3}>
                  {savingStage ? 'Menyimpan…' : 'Simpan & Pindahkan'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
      <p className="mt-2 text-center text-[11px] text-slate-400">
        💡 Lead menjadi <b>peserta</b> saat biaya training dibayar lunas (Finance) — status otomatis berpindah ke
        kolom <b>Menang</b>.
      </p>
    </div>
  );
}
