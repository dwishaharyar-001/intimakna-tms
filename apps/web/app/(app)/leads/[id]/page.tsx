'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
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
  useResetPageOnSize,
  useRowsPerPage,
} from '@/components/ui';
import {
  fmtDate,
  LEAD_SOURCE_LABEL,
  STAGE_BADGE,
  ACTIVITY_ICON,
  ACTIVITY_OUTCOME_LABEL,
  ACTIVITY_STATUS_BADGE,
  ACTIVITY_STATUS_LABEL,
  ACTIVITY_TYPE_LABEL,
  type ActivityOutcome,
  type ActivityType,
  type LeadActivityRow,
  type StageRow,
} from '@/lib/core';

interface LeadDetail {
  id: string;
  name: string;
  company?: string | null;
  phone: string;
  email?: string | null;
  source: string;
  createdAt: string;
  stage?: { id: string; label: string; kind: string } | null;
  assignedTo?: { id: string; name: string } | null;
  participant?: { id: string; name: string } | null;
  interestProgram?: { id: string; title: string } | null;
  interestBatch?: { id: string; batchName: string } | null;
  activities: LeadActivityRow[];
  _count?: { activities: number };
}

const EMPTY_ACT = {
  type: 'CALL' as ActivityType,
  status: 'DONE' as 'DONE' | 'PLANNED',
  summary: '',
  outcome: '' as ActivityOutcome | '',
  scheduledAt: '',
  nextActionAt: '',
};

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { me } = useAuth();
  const canWrite =
    me?.role === 'SALES_MARKETING' || me?.role === 'ADMIN_TRAINING' || me?.role === 'SUPER_ADMIN';

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [actForm, setActForm] = useState(EMPTY_ACT);
  const [savingAct, setSavingAct] = useState(false);

  const [stageForm, setStageForm] = useState({
    stageId: '',
    type: 'CALL' as ActivityType,
    summary: '',
    outcome: '' as ActivityOutcome | '',
  });
  const [savingStage, setSavingStage] = useState(false);
  const [tlPage, setTlPage] = useState(1);
  const [tlSize, setTlSize] = useRowsPerPage('lead-activity');
  useResetPageOnSize(tlSize, setTlPage);
  const summaryRef = useRef<HTMLInputElement | null>(null);

  function openActivityForm() {
    const el = document.getElementById('panel-aktivitas');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => summaryRef.current?.focus(), 350);
  }

  const load = useCallback(async () => {
    try {
      const d = await api<LeadDetail>(`/leads/${id}`);
      setLead(d);
      setStageForm((f) => ({ ...f, stageId: f.stageId || d.stage?.id || '' }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat lead');
    }
  }, [id]);

  useEffect(() => {
    load();
    api<StageRow[]>('/lead-stages').then(setStages).catch(() => undefined);
  }, [load]);

  async function submitActivity(e: FormEvent) {
    e.preventDefault();
    setSavingAct(true);
    setError('');
    setMsg('');
    try {
      await api(`/leads/${id}/activities`, {
        method: 'POST',
        body: {
          type: actForm.type,
          status: actForm.status,
          summary: actForm.summary,
          outcome: actForm.outcome || undefined,
          scheduledAt: actForm.scheduledAt ? new Date(actForm.scheduledAt).toISOString() : undefined,
          nextActionAt: actForm.nextActionAt ? new Date(actForm.nextActionAt).toISOString() : undefined,
        },
      });
      setMsg(actForm.status === 'PLANNED' ? 'Follow-up dijadwalkan.' : 'Aktivitas tercatat.');
      setActForm(EMPTY_ACT);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan aktivitas');
    } finally {
      setSavingAct(false);
    }
  }

  async function markDone(activityId: string) {
    setError('');
    try {
      await api(`/activities/${activityId}`, { method: 'PATCH', body: { status: 'DONE' } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui aktivitas');
    }
  }

  async function submitStage(e: FormEvent) {
    e.preventDefault();
    if (!lead) return;
    setSavingStage(true);
    setError('');
    setMsg('');
    try {
      await api(`/leads/${id}`, {
        method: 'PATCH',
        body: {
          stageId: stageForm.stageId,
          activity: {
            type: stageForm.type,
            summary: stageForm.summary,
            outcome: stageForm.outcome || undefined,
          },
        },
      });
      setMsg('Status lead diperbarui & catatan aktivitas tersimpan.');
      setStageForm((f) => ({ ...f, summary: '', outcome: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status');
    } finally {
      setSavingStage(false);
    }
  }

  if (error && !lead) {
    return (
      <div>
        <PageHeader title="Detail Lead" />
        <ErrorNote message={error} />
      </div>
    );
  }
  if (!lead) return <p className="p-6 text-sm text-slate-400">Memuat…</p>;

  const acts = lead.activities ?? [];
  const planned = acts
    .filter((a) => a.status === 'PLANNED')
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
  const last = acts.find((a) => a.status === 'DONE');

  return (
    <div>
      <PageHeader
        title={lead.name}
        desc={
          <>
            {lead.company ? `${lead.company} · ` : ''}
            {lead.phone}
            {lead.email ? ` · ${lead.email}` : ''} · via {LEAD_SOURCE_LABEL[lead.source as keyof typeof LEAD_SOURCE_LABEL] ?? lead.source}
          </>
        }
        actions={
          <Link
            href="/leads"
            className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            ← Kembali ke Kanban
          </Link>
        }
      />

      <ErrorNote message={error} />
      {msg ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {msg}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Aktivitas" value={String(lead._count?.activities ?? acts.length)} tone="accent" />
        <StatCard
          label="Follow-up Berikutnya"
          value={planned[0] ? (planned[0].scheduledAt ? fmtDate(planned[0].scheduledAt) : '—') : 'Tidak ada'}
          sub={planned[0] ? ACTIVITY_TYPE_LABEL[planned[0].type] : undefined}
        />
        <StatCard label="Aktivitas Terakhir" value={last ? ACTIVITY_TYPE_LABEL[last.type] : '—'} sub={last?.doneAt ? fmtDate(last.doneAt) : undefined} />
        <StatCard label="Status Pipeline" value={lead.stage?.label ?? '—'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Timeline */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 lg:px-5">
            <span className="text-sm font-semibold text-slate-800">Riwayat Aktivitas ({acts.length})</span>
            {canWrite ? (
              <Button size="sm" onClick={openActivityForm}>
                + Tambah Aktivitas
              </Button>
            ) : null}
          </div>
          {acts.length === 0 ? (
            <div className="p-4">
              <Empty>Belum ada aktivitas. Catat follow-up pertama di panel sebelah.</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {acts.slice((tlPage - 1) * tlSize, tlPage * tlSize).map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-3 lg:px-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base">
                    {ACTIVITY_ICON[a.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[13px] font-bold text-slate-900">{ACTIVITY_TYPE_LABEL[a.type]}</p>
                      <Badge className={ACTIVITY_STATUS_BADGE[a.status]}>{ACTIVITY_STATUS_LABEL[a.status]}</Badge>
                      {a.outcome ? <Badge className="bg-slate-100 text-slate-600">{ACTIVITY_OUTCOME_LABEL[a.outcome]}</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[13px] text-slate-600">{a.summary}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {a.status === 'PLANNED'
                        ? `Dijadwalkan: ${a.scheduledAt ? fmtDate(a.scheduledAt) : '—'}`
                        : a.doneAt
                          ? `Selesai: ${fmtDate(a.doneAt)}`
                          : `Dibuat: ${fmtDate(a.createdAt)}`}
                      {a.createdBy ? ` · oleh ${a.createdBy.name}` : ''}
                      {a.nextActionAt ? ` · tindak lanjut: ${fmtDate(a.nextActionAt)}` : ''}
                    </p>
                  </div>
                  {canWrite && a.status === 'PLANNED' ? (
                    <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5 py-1 text-[11px]" onClick={() => markDone(a.id)}>
                      Tandai Selesai
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {acts.length > 0 ? (
            <div className="border-t border-slate-100 px-4 py-2.5 lg:px-5">
              <Pager page={tlPage} total={acts.length} limit={tlSize} rows={tlSize} onRowsChange={setTlSize} onChange={setTlPage} compact />
            </div>
          ) : null}
        </Card>

        {/* Panel kanan */}
        <div className="space-y-5">
          <Card className="p-4">
            <p className="mb-2 text-sm font-bold text-slate-900">Ringkasan Lead</p>
            <div className="space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Pipeline</span>
                <span className="text-right font-medium text-slate-700">{lead.stage?.label ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Ditugaskan</span>
                <span className="text-right font-medium text-slate-700">{lead.assignedTo?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Minat program</span>
                <span className="text-right font-medium text-slate-700">{lead.interestProgram?.title ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Minat kelas</span>
                <span className="text-right font-medium text-slate-700">{lead.interestBatch?.batchName ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Peserta</span>
                <span className="text-right font-medium text-slate-700">
                  {lead.participant ? `${lead.participant.name} ✓` : 'belum'}
                </span>
              </div>
            </div>
          </Card>

          {canWrite ? (
            <>
              <Card className="p-4" id="panel-aktivitas">
                <p className="mb-2 text-sm font-bold text-slate-900">+ Catat Aktivitas</p>
                <form onSubmit={submitActivity} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Jenis">
                      <Select className="py-1.5 text-[13px]" value={actForm.type} onChange={(e) => setActForm({ ...actForm, type: e.target.value as ActivityType })}>
                        {(Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[]).map((t) => (
                          <option key={t} value={t}>
                            {ACTIVITY_ICON[t]} {ACTIVITY_TYPE_LABEL[t]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Status">
                      <Select className="py-1.5 text-[13px]" value={actForm.status} onChange={(e) => setActForm({ ...actForm, status: e.target.value as 'DONE' | 'PLANNED' })}>
                        <option value="DONE">Selesai (sudah dilakukan)</option>
                        <option value="PLANNED">Direncanakan (akan dilakukan)</option>
                      </Select>
                    </Field>
                  </div>
                  <Field label="Ringkasan *">
                    <Input
                      ref={summaryRef}
                      required
                      minLength={3}
                      placeholder="cth: kirim penawaran via WA"
                      value={actForm.summary}
                      onChange={(e) => setActForm({ ...actForm, summary: e.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Hasil (opsional)">
                      <Select className="py-1.5 text-[13px]" value={actForm.outcome} onChange={(e) => setActForm({ ...actForm, outcome: e.target.value as ActivityOutcome | '' })}>
                        <option value="">— Tanpa hasil —</option>
                        {(Object.keys(ACTIVITY_OUTCOME_LABEL) as ActivityOutcome[]).map((o) => (
                          <option key={o} value={o}>
                            {ACTIVITY_OUTCOME_LABEL[o]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {actForm.status === 'PLANNED' ? (
                      <Field label="Jadwal *">
                        <Input required type="datetime-local" value={actForm.scheduledAt} onChange={(e) => setActForm({ ...actForm, scheduledAt: e.target.value })} />
                      </Field>
                    ) : (
                      <Field label="Tindak lanjut (opsional)">
                        <Input type="datetime-local" value={actForm.nextActionAt} onChange={(e) => setActForm({ ...actForm, nextActionAt: e.target.value })} />
                      </Field>
                    )}
                  </div>
                  <Button type="submit" disabled={savingAct || actForm.summary.trim().length < 3} className="w-full">
                    {savingAct ? 'Menyimpan…' : 'Simpan Aktivitas'}
                  </Button>
                  <p className="text-[11px] text-slate-400">Catatan aktivitas <b>tidak mengubah status lead</b>.</p>
                </form>
              </Card>

              <Card className="p-4">
                <p className="mb-2 text-sm font-bold text-slate-900">Ubah Status Lead</p>
                <form onSubmit={submitStage} className="space-y-3">
                  <Field label="Kolom status">
                    <Select className="py-1.5 text-[13px]" value={stageForm.stageId} onChange={(e) => setStageForm({ ...stageForm, stageId: e.target.value })}>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Jenis follow-up *">
                      <Select className="py-1.5 text-[13px]" value={stageForm.type} onChange={(e) => setStageForm({ ...stageForm, type: e.target.value as ActivityType })}>
                        {(Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[]).map((t) => (
                          <option key={t} value={t}>
                            {ACTIVITY_TYPE_LABEL[t]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Hasil (opsional)">
                      <Select className="py-1.5 text-[13px]" value={stageForm.outcome} onChange={(e) => setStageForm({ ...stageForm, outcome: e.target.value as ActivityOutcome | '' })}>
                        <option value="">— Tanpa hasil —</option>
                        {(Object.keys(ACTIVITY_OUTCOME_LABEL) as ActivityOutcome[]).map((o) => (
                          <option key={o} value={o}>
                            {ACTIVITY_OUTCOME_LABEL[o]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Catatan aktivitas *" hint="Wajib — setiap perubahan status harus punya jejak follow-up.">
                    <Input required minLength={3} placeholder="cth: presentasi berjalan, siap penawaran" value={stageForm.summary} onChange={(e) => setStageForm({ ...stageForm, summary: e.target.value })} />
                  </Field>
                  <Button type="submit" disabled={savingStage || stageForm.summary.trim().length < 3 || !stageForm.stageId} className="w-full">
                    {savingStage ? 'Menyimpan…' : 'Simpan & Ubah Status'}
                  </Button>
                </form>
              </Card>
            </>
          ) : (
            <Card className="p-4">
              <p className="text-[13px] text-slate-500">
                Anda hanya dapat melihat aktivitas. Pencatatan aktivitas & perubahan status tersedia untuk{' '}
                <b>Sales/Marketing</b>, <b>Admin Training</b>, dan <b>Super Admin</b>.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
