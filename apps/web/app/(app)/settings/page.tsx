'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Badge, Card, Empty, ErrorNote, Field, Input, PageHeader, Pager, Select, thCls, tdCls, useResetPageOnSize, useRowsPerPage } from '@/components/ui';
import { WidgetBoard } from '@/components/widgets';
import { GeneralSettingsManager } from '@/components/general-settings';
import { useSettings } from '@/lib/settings';
import {
  cn,
  fmtDate,
  money,
  BATCH_STATUS_BADGE,
  BATCH_STATUS_LABEL,
  DELIVERY_BADGE,
  DELIVERY_LABEL,
  ROLE_LABEL,
  STAGE_DOT,
  type BatchRow,
  type BatchStatus,
  type Coverage,
  type DeliveryType,
  type LeadStageKind,
  type MaterialRow,
  type ProgramRow,
  type RequirementTemplateRow,
  type StageRow,
} from '@/lib/core';

const KINDS: LeadStageKind[] = ['OPEN', 'WON', 'LOST'];
const KIND_LABEL: Record<LeadStageKind, string> = {
  OPEN: 'Berjalan (OPEN)',
  WON: 'Menang (WON)',
  LOST: 'Gagal (LOST)',
};

const AREAS = [
  { icon: '₨', title: 'Aturan Keuangan', desc: 'Model revenue korporat/paket, jatuh tempo, kategori.' },
];

function PipelineManager() {
  const [rows, setRows] = useState<StageRow[] | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState<LeadStageKind>('OPEN');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await api<StageRow[]>('/lead-stages/admin/all');
      setRows(all);
      setLabels(Object.fromEntries(all.map((s) => [s.id, s.label])));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat tahapan');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = (rows ?? []).filter((r) => r.isActive).sort((a, b) => a.orderIndex - b.orderIndex);
  const inactive = (rows ?? []).filter((r) => !r.isActive);

  async function reorder(ids: string[]) {
    setBusy(true);
    setError('');
    try {
      await api('/lead-stages/admin/reorder', { method: 'POST', body: { ids } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyusun ulang');
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...active];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    void reorder(next.map((r) => r.id));
  }

  async function patchStage(id: string, data: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/lead-stages/admin/${id}`, { method: 'PATCH', body: data });
      setMsg(okMsg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  async function addStage(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/lead-stages/admin', { method: 'POST', body: { label: newLabel, kind: newKind } });
      setMsg(`Tahap "${newLabel}" ditambahkan ke ujung kanan kanban.`);
      setNewLabel('');
      setNewKind('OPEN');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah tahap');
    } finally {
      setBusy(false);
    }
  }

  async function removeStage(id: string, label: string) {
    if (!window.confirm(`Hapus tahap "${label}"? Lead di tahap ini harus kosong.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/lead-stages/admin/${id}`, { method: 'DELETE' });
      setMsg(`Tahap "${label}" dihapus.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-fit max-w-full p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Pipeline Leads — Kolom Status</h2>
          <p className="mt-0.5 max-w-md text-xs text-slate-400">
            Atur jumlah, urutan, nama & sifat kolom. Perubahan langsung tampil di halaman Leads Pipeline (Kanban).
            Urutan teratas = status default lead baru.
          </p>
        </div>
        <div className="flex max-w-xs flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_DOT.OPEN }} /> Berjalan
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_DOT.WON }} /> Menang (terminal)
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_DOT.LOST }} /> Gagal (terminal)
        </div>
      </div>

      <ErrorNote message={error} />
      {msg ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {msg}
        </div>
      ) : null}

      {rows === null ? (
        <p className="mt-4 text-sm text-slate-400">Memuat…</p>
      ) : (
        <div className="mt-4 space-y-2">
          {active.map((s, i) => {
            const draft = labels[s.id] ?? s.label;
            const dirty = draft.trim() !== s.label;
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 p-2.5 shadow-[0_1px_6px_rgba(0,0,0,0.03)]"
              >
                <span className="w-6 text-center text-xs font-extrabold text-slate-300">#{i + 1}</span>
                <button
                  title="Naikkan urutan"
                  disabled={i === 0 || busy}
                  onClick={() => move(i, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 transition hover:bg-slate-200 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  title="Turunkan urutan"
                  disabled={i === active.length - 1 || busy}
                  onClick={() => move(i, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 transition hover:bg-slate-200 disabled:opacity-30"
                >
                  ↓
                </button>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_DOT[s.kind] }} />
                <Input
                  className="h-8 w-32! rounded-full px-3 py-1 text-[13px] shadow-none lg:w-40! lg:text-sm"
                  value={draft}
                  onChange={(e) => setLabels({ ...labels, [s.id]: e.target.value })}
                />
                <Select
                  className="h-8 w-28! rounded-full px-2 py-1 text-[11px] shadow-none lg:w-36! lg:text-xs"
                  value={s.kind}
                  disabled={busy}
                  onChange={(e) =>
                    patchStage(s.id, { kind: e.target.value }, `Sifat tahap "${s.label}" diperbarui.`)
                  }
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
                <BadgeCount count={s.leadCount ?? 0} />
                {dirty ? (
                  <Button
                    size="sm"
                    disabled={busy || !draft.trim()}
                    onClick={() => patchStage(s.id, { label: draft.trim() }, `Nama tahap diubah menjadi "${draft.trim()}".`)}
                  >
                    Simpan Nama
                  </Button>
                ) : null}
                <button
                  title={(s.leadCount ?? 0) > 0 ? 'Pindahkan lead-nya dulu sebelum menghapus' : 'Hapus tahap'}
                  disabled={busy || (s.leadCount ?? 0) > 0}
                  onClick={() => removeStage(s.id, s.label)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs transition disabled:opacity-25',
                    (s.leadCount ?? 0) > 0 ? 'text-slate-300' : 'bg-[#FDECEA] text-[#E53935] hover:bg-[#FBDDD9]',
                  )}
                >
                  ✕
                </button>
              </div>
            );
          })}

          {inactive.length > 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-400 uppercase">Tahap nonaktif</p>
              {inactive.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-1 text-sm text-slate-400">
                  <span className="text-xs">{s.label}</span>
                  <span className="text-[10px] text-slate-300">({s.leadCount ?? 0} lead)</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto px-2 py-0.5 text-[11px]"
                    disabled={busy}
                    onClick={() => patchStage(s.id, { isActive: true }, `Tahap "${s.label}" diaktifkan kembali.`)}
                  >
                    Aktifkan
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {/* Tambah tahap */}
          <form onSubmit={addStage} className="flex flex-wrap items-end gap-2 rounded-2xl bg-slate-50 p-3">
            <Field label="Tambah kolom baru" className="w-full sm:w-60">
              <Input
                required
                placeholder="Nama status, cth: Negosiasi"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </Field>
            <Field label="Sifat" className="w-full sm:w-44">
              <Select value={newKind} onChange={(e) => setNewKind(e.target.value as LeadStageKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={busy || !newLabel.trim()}>
              + Tambah
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}

function BadgeCount({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-[#FDECEA] px-2 py-0.5 text-[11px] font-bold text-[#E53935]">
      {count} lead
    </span>
  );
}

const TXT =
  'w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 lg:px-3.5 lg:text-sm';

const EMPTY_PROG = { title: '', category: '', description: '', syllabus: '', standardPrice: '', inHousePrice: '' };

const BATCH_STATUSES: BatchStatus[] = ['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'];

/** Pengelola Kelas Reguler (sebelumnya disebut "Batch"): tambah, ubah, hapus. */
/** Pengelola Checklist Default (template persiapan kelas). Nilainya bisa diubah bebas. */
function ChecklistTemplateManager() {
  const [rows, setRows] = useState<RequirementTemplateRow[] | null>(null);
  const [tplPage, setTplPage] = useState(1);
  const [tplSize, setTplSize] = useRowsPerPage('settings-templates');
  useResetPageOnSize(tplSize, setTplPage);
  const [drafts, setDrafts] = useState<Record<string, { title: string; note: string }>>({});
  const [form, setForm] = useState({ title: '', note: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api<RequirementTemplateRow[]>('/requirement-templates?includeInactive=true');
      setRows(list.sort((a, b) => a.orderIndex - b.orderIndex));
      setDrafts(Object.fromEntries(list.map((r) => [r.id, { title: r.title, note: r.note ?? '' }])));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat checklist default');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, data: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/requirement-templates/${id}`, { method: 'PATCH', body: data });
      setMsg(okMsg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  async function move(r: RequirementTemplateRow, dir: -1 | 1) {
    const list = [...(rows ?? [])];
    const idx = list.findIndex((x) => x.id === r.id);
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const other = list[j];
    setBusy(true);
    try {
      await api(`/requirement-templates/${r.id}`, { method: 'PATCH', body: { orderIndex: other.orderIndex } });
      await api(`/requirement-templates/${other.id}`, { method: 'PATCH', body: { orderIndex: r.orderIndex } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyusun urutan');
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/requirement-templates', { method: 'POST', body: { title: form.title.trim(), note: form.note.trim() || undefined } });
      setMsg(`Item default "${form.title.trim()}" ditambahkan.`);
      setForm({ title: '', note: '' });
      setShowAdd(false);
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal menambah item');
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: RequirementTemplateRow) {
    if (!window.confirm(`Hapus item default "${r.title}"? (kelas lama tidak terpengaruh)`)) return;
    setBusy(true);
    try {
      await api(`/requirement-templates/${r.id}`, { method: 'DELETE' });
      setMsg(`Item default "${r.title}" dihapus.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus item');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-4xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Checklist Default (Persiapan Kelas)</h2>
          <p className="mt-0.5 max-w-lg text-xs text-slate-400">
            Item standar yang <b>otomatis disalin ke setiap kelas baru</b>. Nilai item (nama & catatan) bisa diubah,
            diurutkan, dinonaktifkan, atau ditambah/hapus dari sini.
          </p>
        </div>
        <Button onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Tutup Form' : '+ Item Default'}</Button>
      </div>

      <ErrorNote message={error} />
      {msg ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</div>
      ) : null}

      {showAdd ? (
        <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl bg-slate-50 p-3">
          <Field label="Nama item *" className="w-full sm:w-64">
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Catatan (opsional)" className="w-full flex-1 sm:w-auto">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <Button type="submit" disabled={busy || form.title.trim().length < 3}>
            + Tambah
          </Button>
        </form>
      ) : null}

      {rows === null ? (
        <p className="mt-4 text-sm text-slate-400">Memuat…</p>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.slice((tplPage - 1) * tplSize, tplPage * tplSize).map((r, i) => {
            const d = drafts[r.id] ?? { title: r.title, note: r.note ?? '' };
            const dirty = d.title.trim() !== r.title || (d.note.trim() || '') !== (r.note ?? '');
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 p-2.5 shadow-[0_1px_6px_rgba(0,0,0,0.03)]">
                <button disabled={busy || i === 0} onClick={() => move(r, -1)} title="Naikkan" className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 transition hover:bg-slate-200 disabled:opacity-30">↑</button>
                <button disabled={busy || i === rows.length - 1} onClick={() => move(r, 1)} title="Turunkan" className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 transition hover:bg-slate-200 disabled:opacity-30">↓</button>
                <Input className="h-8 w-56! rounded-full px-3 py-1 text-[13px] shadow-none" value={d.title} onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...d, title: e.target.value } })} />
                <Input className="h-8 w-64! rounded-full px-3 py-1 text-[12px] shadow-none" placeholder="catatan…" value={d.note} onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...d, note: e.target.value } })} />
                {dirty ? (
                  <Button size="sm" disabled={busy || d.title.trim().length < 3} onClick={() => patch(r.id, { title: d.title.trim(), note: d.note.trim() || null }, `Item "${d.title.trim()}" disimpan.`)}>
                    Simpan
                  </Button>
                ) : null}
                <button
                  title={r.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  disabled={busy}
                  onClick={() => patch(r.id, { isActive: !r.isActive }, `Item "${r.title}" ${r.isActive ? 'dinonaktifkan' : 'diaktifkan'}.`)}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500 transition hover:bg-slate-200 disabled:opacity-30"
                >
                  {r.isActive ? '◉' : '○'}
                </button>
                <button title="Hapus" disabled={busy} onClick={() => remove(r)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FDECEA] text-xs text-[#E53935] transition hover:bg-[#FBDDD9] disabled:opacity-30">✕</button>
              </div>
            );
          })}
          <Pager page={tplPage} total={rows.length} limit={tplSize} rows={tplSize} onRowsChange={setTplSize} onChange={setTplPage} />
          <p className="text-[11px] text-slate-400">Perubahan hanya berlaku untuk kelas yang dibuat setelah ini (kelas lama tetap memakai salinan saat dibuat).</p>
        </div>
      )}
    </Card>
  );
}

/** Pengelola Judul Materi + Learning Path (level dasar → advanced). */
function MaterialsManager() {
  const [rows, setRows] = useState<MaterialRow[] | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useRowsPerPage('settings-materials');
  useResetPageOnSize(pageSize, setPage);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { title: string; category: string; description: string; syllabus: string }>>({});
  const [form, setForm] = useState({ title: '', category: '', levelNumber: '', description: '', syllabus: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, cov] = await Promise.all([
        api<{ data: MaterialRow[]; total: number }>(`/materials?paged=1&page=${page}&limit=${pageSize}`),
        api<Coverage>('/learning-path/coverage'),
      ]);
      setRows(m.data);
      setTotal(m.total);
      setCoverage(cov);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat judul materi');
    }
  }, [page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const list = rows ?? [];
    const levels = [...new Set(list.map((m) => m.levelNumber ?? 0))].filter((l) => l > 0).sort((a, b) => a - b);
    const groups = levels.map((level) => ({
      level: level as number | null,
      items: list
        .filter((m) => m.levelNumber === level)
        .sort((a, b) => a.orderInLevel - b.orderInLevel || a.title.localeCompare(b.title)),
    }));
    const unassigned = list
      .filter((m) => !m.levelNumber)
      .sort((a, b) => a.title.localeCompare(b.title));
    if (unassigned.length) groups.push({ level: null, items: unassigned });
    return groups;
  }, [rows]);

  async function patch(id: string, data: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/materials/${id}`, { method: 'PATCH', body: data });
      setMsg(okMsg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  async function move(m: MaterialRow, dir: -1 | 1, siblings: MaterialRow[]) {
    const idx = siblings.findIndex((x) => x.id === m.id);
    const j = idx + dir;
    if (j < 0 || j >= siblings.length) return;
    const other = siblings[j];
    setBusy(true);
    try {
      await api(`/materials/${m.id}`, { method: 'PATCH', body: { orderInLevel: other.orderInLevel } });
      await api(`/materials/${other.id}`, { method: 'PATCH', body: { orderInLevel: m.orderInLevel } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyusun urutan');
    } finally {
      setBusy(false);
    }
  }

  async function addMaterial(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/materials', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          category: form.category.trim() || undefined,
          levelNumber: form.levelNumber ? Number(form.levelNumber) : undefined,
          description: form.description.trim() || undefined,
          syllabus: form.syllabus.trim() || undefined,
        },
      });
      setMsg(`Judul materi "${form.title.trim()}" ditambahkan.`);
      setForm({ title: '', category: '', levelNumber: '', description: '', syllabus: '' });
      setShowAdd(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah materi');
    } finally {
      setBusy(false);
    }
  }

  async function removeMaterial(m: MaterialRow) {
    if (!window.confirm(`Hapus judul materi "${m.title}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/materials/${m.id}`, { method: 'DELETE' });
      setMsg(`Judul materi "${m.title}" dihapus.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus materi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-4xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Judul Materi &amp; Learning Path</h2>
          <p className="mt-0.5 max-w-lg text-xs text-slate-400">
            <b>Judul Materi</b> adalah unit ajar; <b>Kelas Reguler = Judul Materi + Batch</b>. Beri{' '}
            <b>Level Number</b> untuk menyusun <b>Learning Path</b> dari paling dasar ke paling advanced — satu level boleh berisi beberapa judul materi.
          </p>
        </div>
        <Button onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Tutup Form' : '+ Judul Materi'}</Button>
      </div>

      <ErrorNote message={error} />
      {msg ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</div>
      ) : null}

      {showAdd ? (
        <form onSubmit={addMaterial} className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Judul Materi *" className="sm:col-span-2">
            <Input required placeholder="cth: Effective Leadership for Managers" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Level Number">
            <Input type="number" min={1} max={99} placeholder="kosong = belum diatur" value={form.levelNumber} onChange={(e) => setForm({ ...form, levelNumber: e.target.value })} />
          </Field>
          <Field label="Kategori">
            <Input placeholder="Leadership / Komunikasi / TOT…" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </Field>
          <Field label="Deskripsi" className="sm:col-span-2 lg:col-span-4">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={busy || !form.title.trim()}>
              {busy ? 'Menyimpan…' : 'Simpan Materi'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>
              Batal
            </Button>
          </div>
        </form>
      ) : null}

      {rows === null ? (
        <p className="mt-4 text-sm text-slate-400">Memuat…</p>
      ) : (
        <div className="mt-4 space-y-4">
          {grouped.map((g) => (
            <div key={g.level ?? 'none'}>
              <p className="mb-1.5 flex items-center gap-2 text-[12px] font-bold tracking-wide text-slate-500 uppercase">
                {g.level ? <Badge className="bg-[#FDECEA] text-[#E53935]">Level {g.level}</Badge> : <Badge className="bg-slate-100 text-slate-500">Belum berlevel</Badge>}
                <span className="text-slate-300">{g.items.length} materi</span>
              </p>
              <div className="space-y-2">
                {g.items.map((m, idx) => {
                  const d = drafts[m.id];
                  const isOpen = editing === m.id;
                  return (
                    <div key={m.id} className={cn('rounded-2xl border p-3', m.isActive ? 'border-slate-100 shadow-[0_1px_6px_rgba(0,0,0,0.03)]' : 'border-dashed border-slate-200 bg-slate-50/60')}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          className="h-8 w-16! rounded-full px-2 py-1 text-center text-[12px] shadow-none"
                          value={m.levelNumber ?? ''}
                          placeholder="—"
                          onChange={(e) => patch(m.id, { levelNumber: e.target.value ? Number(e.target.value) : null }, `Level "${m.title}" diatur.`)}
                          title="Level Number (1 = paling dasar)"
                        />
                        <button disabled={busy || idx === 0} onClick={() => move(m, -1, g.items)} title="Naikkan urutan" className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 transition hover:bg-slate-200 disabled:opacity-30">↑</button>
                        <button disabled={busy || idx === g.items.length - 1} onClick={() => move(m, 1, g.items)} title="Turunkan urutan" className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500 transition hover:bg-slate-200 disabled:opacity-30">↓</button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-slate-900">{m.title}</p>
                          <p className="text-[11px] text-slate-400">
                            {m.category ?? '—'} · {m.classCount ?? 0} kelas{m.isActive ? '' : ' · nonaktif'}
                          </p>
                          {(() => {
                            const cov = coverage?.levels.flatMap((l) => l.materials).find((x) => x.id === m.id);
                            if (!cov) return null;
                            return (
                              <p className="mt-1 flex flex-wrap items-center gap-1.5">
                                <Badge className="bg-emerald-100 text-emerald-700">👥 {cov.attended} sudah ikut</Badge>
                                <Badge className="bg-[#FDECEA] text-[#E53935]">🎯 {cov.prospects} prospek</Badge>
                                <Link
                                  href={`/prospects?materialId=${m.id}`}
                                  className="text-[11px] font-bold text-[#E53935] hover:underline"
                                >
                                  Lihat Prospek →
                                </Link>
                              </p>
                            );
                          })()}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => (isOpen ? setEditing(null) : setEditing(m.id))}>
                          {isOpen ? 'Tutup' : 'Ubah'}
                        </Button>
                        <button
                          title={m.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          disabled={busy}
                          onClick={() => patch(m.id, { isActive: !m.isActive }, `Materi "${m.title}" ${m.isActive ? 'dinonaktifkan' : 'diaktifkan'}.`)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500 transition hover:bg-slate-200 disabled:opacity-30"
                        >
                          {m.isActive ? '◉' : '○'}
                        </button>
                        <button
                          title={(m.classCount ?? 0) > 0 ? 'Masih dipakai kelas' : 'Hapus materi'}
                          disabled={busy || (m.classCount ?? 0) > 0}
                          onClick={() => removeMaterial(m)}
                          className={cn('flex h-7 w-7 items-center justify-center rounded-full text-xs transition disabled:opacity-25', (m.classCount ?? 0) > 0 ? 'text-slate-300' : 'bg-[#FDECEA] text-[#E53935] hover:bg-[#FBDDD9]')}
                        >
                          ✕
                        </button>
                      </div>

                      {isOpen ? (
                        <div className="mt-3 grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2">
                          <Field label="Judul Materi">
                            <Input value={d?.title ?? m.title} onChange={(e) => setDrafts({ ...drafts, [m.id]: { ...(d ?? { title: m.title, category: m.category ?? '', description: m.description ?? '', syllabus: m.syllabus ?? '' }), title: e.target.value } })} />
                          </Field>
                          <Field label="Kategori">
                            <Input value={d?.category ?? m.category ?? ''} onChange={(e) => setDrafts({ ...drafts, [m.id]: { ...(d ?? { title: m.title, category: m.category ?? '', description: m.description ?? '', syllabus: m.syllabus ?? '' }), category: e.target.value } })} />
                          </Field>
                          <Field label="Deskripsi" className="sm:col-span-2">
                            <textarea rows={2} className={TXT} value={d?.description ?? m.description ?? ''} onChange={(e) => setDrafts({ ...drafts, [m.id]: { ...(d ?? { title: m.title, category: m.category ?? '', description: m.description ?? '', syllabus: m.syllabus ?? '' }), description: e.target.value } })} />
                          </Field>
                          <Field label="Silabus" className="sm:col-span-2">
                            <textarea rows={4} className={TXT} value={d?.syllabus ?? m.syllabus ?? ''} onChange={(e) => setDrafts({ ...drafts, [m.id]: { ...(d ?? { title: m.title, category: m.category ?? '', description: m.description ?? '', syllabus: m.syllabus ?? '' }), syllabus: e.target.value } })} />
                          </Field>
                          <div className="flex gap-2 sm:col-span-2">
                            <Button
                              size="sm"
                              disabled={busy || !(d?.title ?? m.title).trim()}
                              onClick={() =>
                                patch(
                                  m.id,
                                  { title: (d?.title ?? m.title).trim(), category: d?.category ?? m.category, description: d?.description ?? m.description, syllabus: d?.syllabus ?? m.syllabus },
                                  `Materi "${(d?.title ?? m.title).trim()}" disimpan.`,
                                )
                              }
                            >
                              Simpan Perubahan
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              Batal
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
                          {m.description ? <p>{m.description}</p> : null}
                          {m.syllabus ? (
                            <details>
                              <summary className="cursor-pointer font-semibold text-[#E53935]">📋 Silabus ({m.syllabus.split('\n').filter(Boolean).length} poin)</summary>
                              <ol className="mt-1 list-inside list-decimal space-y-0.5 pl-1">
                                {m.syllabus.split('\n').filter(Boolean).map((line, i) => (
                                  <li key={i}>{line.replace(/^\s*\d+[.)]\s*/, '')}</li>
                                ))}
                              </ol>
                            </details>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <Pager page={page} total={total} limit={pageSize} rows={pageSize} onRowsChange={setPageSize} onChange={setPage} />

          {/* Pratinjau Learning Path */}
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="mb-2 text-[12px] font-bold tracking-wide text-slate-500 uppercase">Pratinjau Learning Path</p>
            {grouped.filter((g) => g.level).length === 0 ? (
              <p className="text-[12px] text-slate-400">Belum ada materi berlevel. Isi kolom “Level” di atas untuk menyusun jalur belajar.</p>
            ) : (
              <div className="space-y-1.5">
                {grouped
                  .filter((g) => g.level)
                  .map((g, gi) => (
                    <div key={g.level} className="flex items-start gap-2 text-[12px]">
                      <span className="mt-0.5 flex h-6 w-16 shrink-0 items-center justify-center rounded-full bg-white font-bold text-[#E53935] shadow-sm">Lv {g.level}</span>
                      <span className="flex-1 text-slate-600">{g.items.map((m) => m.title).join('  ·  ')}</span>
                      {gi < grouped.filter((x) => x.level).length - 1 ? <span className="text-slate-300">↓</span> : null}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function ClassesManager() {
  const { settings } = useSettings();
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useRowsPerPage('settings-classes');
  useResetPageOnSize(pageSize, setPage);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        batchName: string;
        materialId: string;
        startDate: string;
        endDate: string;
        location: string;
        status: BatchStatus;
        deliveryType: DeliveryType;
        clientName: string;
        pricePerPax: string;
        packagePrice: string;
      }
    >
  >({});
  const [form, setForm] = useState({
    batchName: '',
    materialId: '',
    startDate: '',
    endDate: '',
    location: '',
    status: 'PLANNED' as BatchStatus,
    deliveryType: 'REGULAR' as DeliveryType,
    clientName: '',
    pricePerPax: '',
    packagePrice: '',
  });
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, m] = await Promise.all([
        api<{ data: BatchRow[]; total: number }>(`/batches?paged=1&page=${page}&limit=${pageSize}`),
        api<MaterialRow[]>('/materials'),
      ]);
      setRows(b.data);
      setTotal(b.total);
      setMaterials(m);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat kelas');
    }
  }, [page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const toDateInput = (iso: string) => new Date(iso).toISOString().slice(0, 10);

  function startEdit(b: BatchRow) {
    setEditing(b.id);
    setDrafts((d) => ({
      ...d,
      [b.id]: {
        batchName: b.batchName,
        materialId: b.material?.id ?? '',
        startDate: toDateInput(b.startDate),
        endDate: toDateInput(b.endDate),
        location: b.location ?? '',
        status: b.status,
        deliveryType: b.deliveryType ?? 'REGULAR',
        clientName: b.clientName ?? '',
        pricePerPax: b.pricePerPax != null ? String(b.pricePerPax) : '',
        packagePrice: b.packagePrice != null ? String(b.packagePrice) : '',
      },
    }));
  }

  async function saveEdit(b: BatchRow) {
    const d = drafts[b.id];
    if (!d?.batchName.trim() || !d.startDate || !d.endDate) return;
    setBusy(true);
    setError('');
    try {
      await api(`/batches/${b.id}`, {
        method: 'PATCH',
        body: {
          batchName: d.batchName.trim(),
          materialId: d.materialId || undefined,
          startDate: new Date(d.startDate).toISOString(),
          endDate: new Date(d.endDate).toISOString(),
          location: d.location.trim() || null,
          status: d.status,
          deliveryType: d.deliveryType,
          clientName: d.clientName.trim() || null,
          pricePerPax: d.pricePerPax ? Number(d.pricePerPax) : null,
          packagePrice: d.packagePrice ? Number(d.packagePrice) : null,
        },
      });
      setMsg(`Kelas "${d.batchName.trim()}" disimpan.`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan kelas');
    } finally {
      setBusy(false);
    }
  }

  async function addClass(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/batches', {
        method: 'POST',
        body: {
          batchName: form.batchName.trim(),
          materialId: form.materialId,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
          location: form.location.trim() || undefined,
          status: form.status,
          deliveryType: form.deliveryType,
          clientName: form.clientName.trim() || undefined,
          pricePerPax: form.pricePerPax ? Number(form.pricePerPax) : undefined,
          packagePrice: form.packagePrice ? Number(form.packagePrice) : undefined,
        },
      });
      setMsg(`Kelas "${form.batchName.trim()}" ditambahkan.`);
      setForm({
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
      setShowAdd(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah kelas');
    } finally {
      setBusy(false);
    }
  }

  async function removeClass(b: BatchRow) {
    if (!window.confirm(`Hapus kelas "${b.batchName}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/batches/${b.id}`, { method: 'DELETE' });
      setMsg(`Kelas "${b.batchName}" dihapus.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus kelas');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-4xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Kelas Reguler</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Menu training default INTIMAKNA — berdiri sendiri (tanpa program). <i>Dulu disebut “Batch”.</i>
          </p>
        </div>
        <Button
          onClick={() => {
            const next = !showAdd;
            if (next) {
              setForm((f) => ({
                ...f,
                batchName: f.batchName || settings.period.label || '',
                status: (settings.defaults.classStatus as BatchStatus) || f.status,
                pricePerPax:
                  f.pricePerPax ||
                  (settings.defaults.regularPrice ? String(settings.defaults.regularPrice) : ''),
              }));
            }
            setShowAdd(next);
          }}
        >
          {showAdd ? 'Tutup Form' : '+ Kelas Baru'}
        </Button>
      </div>

      <ErrorNote message={error} />
      {msg ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {msg}
        </div>
      ) : null}

      {showAdd ? (
        <form onSubmit={addClass} className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nama Kelas *">
            <Input required placeholder="cth: ELLM-B4 2026" value={form.batchName} onChange={(e) => setForm({ ...form, batchName: e.target.value })} />
          </Field>
          <Field label="Judul Materi *">
            <Select required value={form.materialId} onChange={(e) => setForm({ ...form, materialId: e.target.value })}>
              <option value="">— Pilih Judul Materi —</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.levelNumber ? `Level ${m.levelNumber} · ` : ''}
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bentuk Pelaksanaan">
            <Select value={form.deliveryType} onChange={(e) => setForm({ ...form, deliveryType: e.target.value as DeliveryType })}>
              <option value="REGULAR">Kelas Reguler (harga per peserta)</option>
              <option value="IN_HOUSE">In-House Korporat (harga paket)</option>
            </Select>
          </Field>
          {form.deliveryType === 'IN_HOUSE' ? (
            <>
              <Field label="Nama Korporat *">
                <Input required placeholder="cth: PT Nusantara Jaya" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </Field>
              <Field label="Harga Paket (Rp) *" hint="Dibayar sekali oleh korporat, bukan per peserta.">
                <Input required type="number" min={0} value={form.packagePrice} onChange={(e) => setForm({ ...form, packagePrice: e.target.value })} />
              </Field>
            </>
          ) : (
            <Field label="Harga per Peserta (Rp) *" hint="Harga jual kelas per peserta.">
              <Input required type="number" min={0} value={form.pricePerPax} onChange={(e) => setForm({ ...form, pricePerPax: e.target.value })} />
            </Field>
          )}
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BatchStatus })}>
              {BATCH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BATCH_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tanggal Mulai *">
            <Input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="Tanggal Selesai *">
            <Input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
          <Field label="Lokasi">
            <Input placeholder="Kota / venue" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={busy || !form.batchName.trim() || !form.materialId || (form.deliveryType !== 'IN_HOUSE' && !form.pricePerPax)}>
              {busy ? 'Menyimpan…' : 'Simpan Kelas'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>
              Batal
            </Button>
          </div>
        </form>
      ) : null}

      {rows === null ? (
        <p className="mt-4 text-sm text-slate-400">Memuat…</p>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <Empty>Belum ada kelas. Tambahkan kelas reguler pertama di atas.</Empty>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.map((b) => {
            const d = drafts[b.id];
            const isOpen = editing === b.id;
            const locked = b.participantCount > 0;
            return (
              <div key={b.id} className="rounded-2xl border border-slate-100 p-3 shadow-[0_1px_6px_rgba(0,0,0,0.03)]">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{b.batchName}</p>
                    <p className="text-[11px] text-slate-400">
                      {b.material?.title ?? b.category ?? 'Kelas'}
                      {b.material?.levelNumber ? ` · Level ${b.material.levelNumber}` : ''} · batch “{b.batchName}” ·{' '}
                      {fmtDate(b.startDate)} – {fmtDate(b.endDate)}
                      {b.location ? ` · ${b.location}` : ''} · {b.participantCount} peserta
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <Badge className={DELIVERY_BADGE[b.deliveryType ?? 'REGULAR']}>
                        {DELIVERY_LABEL[b.deliveryType ?? 'REGULAR']}
                      </Badge>
                      {(b.deliveryType ?? 'REGULAR') === 'IN_HOUSE'
                        ? `Paket ${money(b.packagePrice ?? 0)}${b.clientName ? ` · ${b.clientName}` : ''}`
                        : b.pricePerPax != null
                          ? `${money(b.pricePerPax)} / peserta`
                          : 'Harga belum diisi'}
                    </p>
                  </div>
                  <Badge className={BATCH_STATUS_BADGE[b.status]}>{BATCH_STATUS_LABEL[b.status]}</Badge>
                  <Button size="sm" variant="outline" onClick={() => (isOpen ? setEditing(null) : startEdit(b))}>
                    {isOpen ? 'Tutup' : 'Ubah'}
                  </Button>
                  <button
                    title={locked ? 'Masih ada peserta — kelas tidak bisa dihapus' : 'Hapus kelas'}
                    disabled={busy || locked}
                    onClick={() => removeClass(b)}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs transition disabled:opacity-25',
                      locked ? 'text-slate-300' : 'bg-[#FDECEA] text-[#E53935] hover:bg-[#FBDDD9]',
                    )}
                  >
                    ✕
                  </button>
                </div>

                {isOpen ? (
                  <div className="mt-3 grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Judul Materi">
                      <Select value={d?.materialId ?? ''} onChange={(e) => setDrafts({ ...drafts, [b.id]: { ...d, materialId: e.target.value } })}>
                        <option value="">— Pilih Judul Materi —</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.levelNumber ? `Level ${m.levelNumber} · ` : ''}{m.title}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Nama Kelas">
                      <Input value={d?.batchName ?? ''} onChange={(e) => setDrafts({ ...drafts, [b.id]: { ...d, batchName: e.target.value } })} />
                    </Field>
                    <Field label="Status">
                      <Select value={d?.status ?? 'PLANNED'} onChange={(e) => setDrafts({ ...drafts, [b.id]: { ...d, status: e.target.value as BatchStatus } })}>
                        {BATCH_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {BATCH_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Tanggal Mulai">
                      <Input type="date" value={d?.startDate ?? ''} onChange={(e) => setDrafts({ ...drafts, [b.id]: { ...d, startDate: e.target.value } })} />
                    </Field>
                    <Field label="Tanggal Selesai">
                      <Input type="date" value={d?.endDate ?? ''} onChange={(e) => setDrafts({ ...drafts, [b.id]: { ...d, endDate: e.target.value } })} />
                    </Field>
                    <Field label="Lokasi">
                      <Input value={d?.location ?? ''} onChange={(e) => setDrafts({ ...drafts, [b.id]: { ...d, location: e.target.value } })} />
                    </Field>
                    <Field label="Bentuk Pelaksanaan">
                      <Select value={d?.deliveryType ?? 'REGULAR'} onChange={(e) => setDrafts({ ...drafts, [b.id]: { ...d, deliveryType: e.target.value as DeliveryType } })}>
                        <option value="REGULAR">Kelas Reguler</option>
                        <option value="IN_HOUSE">In-House Korporat</option>
                      </Select>
                    </Field>
                    {(d?.deliveryType ?? 'REGULAR') === 'IN_HOUSE' ? (
                      <>
                        <Field label="Nama Korporat">
                          <Input value={d?.clientName ?? ''} onChange={(e) => setDrafts({ ...drafts, [b.id]: { ...d, clientName: e.target.value } })} />
                        </Field>
                        <Field label="Harga Paket (Rp)">
                          <Input type="number" min={0} value={d?.packagePrice ?? ''} onChange={(e) => setDrafts({ ...drafts, [b.id]: { ...d, packagePrice: e.target.value } })} />
                        </Field>
                      </>
                    ) : (
                      <Field label="Harga per Peserta (Rp)">
                        <Input type="number" min={0} value={d?.pricePerPax ?? ''} onChange={(e) => setDrafts({ ...drafts, [b.id]: { ...d, pricePerPax: e.target.value } })} />
                      </Field>
                    )}
                    <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
                      <Button size="sm" disabled={busy || !d?.batchName.trim() || !d?.materialId} onClick={() => saveEdit(b)}>
                        Simpan Perubahan
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
          <Pager page={page} total={total} limit={pageSize} rows={pageSize} onRowsChange={setPageSize} onChange={setPage} />
    </Card>
  );
}

/** Pengelola master program: nama, deskripsi, dan silabus (opsional). */
function ProgramsManager() {
  const [rows, setRows] = useState<ProgramRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useRowsPerPage('settings-programs');
  useResetPageOnSize(pageSize, setPage);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { title: string; category: string; description: string; syllabus: string; inHousePrice: string }>>({});
  const [form, setForm] = useState(EMPTY_PROG);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await api<{ data: ProgramRow[]; total: number }>(`/programs?paged=1&page=${page}&limit=${pageSize}`);
      setRows(all.data);
      setTotal(all.total);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat program');
    }
  }, [page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(p: ProgramRow) {
    setEditing(p.id);
    setDrafts((d) => ({
      ...d,
      [p.id]: {
        title: p.title,
        category: p.category,
        description: p.description ?? '',
        syllabus: p.syllabus ?? '',
        inHousePrice: p.inHousePrice != null ? String(p.inHousePrice) : '',
      },
    }));
  }

  async function saveEdit(p: ProgramRow) {
    const d = drafts[p.id];
    if (!d || !d.title.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api(`/programs/${p.id}`, {
        method: 'PATCH',
        body: {
          title: d.title.trim(),
          category: d.category.trim(),
          description: d.description.trim() || null,
          syllabus: d.syllabus.trim() || null,
          inHousePrice: d.inHousePrice ? Number(d.inHousePrice) : null,
        },
      });
      setMsg(`Program "${d.title.trim()}" disimpan.`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan program');
    } finally {
      setBusy(false);
    }
  }

  async function addProgram(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/programs', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          category: form.category.trim(),
          description: form.description.trim() || undefined,
          syllabus: form.syllabus.trim() || undefined,
          inHousePrice: form.inHousePrice ? Number(form.inHousePrice) : undefined,
          standardPrice: Number(form.standardPrice),
        },
      });
      setMsg(`Program "${form.title.trim()}" ditambahkan.`);
      setForm(EMPTY_PROG);
      setShowAdd(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah program');
    } finally {
      setBusy(false);
    }
  }

  async function removeProgram(p: ProgramRow) {
    if (!window.confirm(`Hapus program "${p.title}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/programs/${p.id}`, { method: 'DELETE' });
      setMsg(`Program "${p.title}" dihapus.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus program');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-4xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Program Pelatihan</h2>
          <p className="mt-0.5 max-w-md text-xs text-slate-400">
            Materi <b>custom</b> untuk kebutuhan khusus — berdiri sendiri, di luar menu kelas reguler.
          </p>
        </div>
        <Button onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Tutup Form' : '+ Program Baru'}</Button>
      </div>

      <ErrorNote message={error} />
      {msg ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {msg}
        </div>
      ) : null}

      {showAdd ? (
        <form onSubmit={addProgram} className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
          <Field label="Nama Program *" className="sm:col-span-1">
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Kategori *" className="sm:col-span-1">
            <Input required placeholder="Leadership / Komunikasi / TOT…" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </Field>
          <Field label="Harga Standar (Rp) *" className="sm:col-span-1">
            <Input required type="number" min={0} value={form.standardPrice} onChange={(e) => setForm({ ...form, standardPrice: e.target.value })} />
          </Field>
          <Field label="Harga Paket In-House (opsional)" className="sm:col-span-1" hint="Harga flat bila program dilaksanakan in-house.">
            <Input type="number" min={0} value={form.inHousePrice} onChange={(e) => setForm({ ...form, inHousePrice: e.target.value })} />
          </Field>
          <Field label="Deskripsi" className="sm:col-span-2">
            <textarea
              rows={2}
              className={TXT}
              placeholder="Ringkasan program…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Silabus (opsional)" hint="Satu materi per baris — otomatis tampil sebagai daftar." className="sm:col-span-2">
            <textarea
              rows={4}
              className={TXT}
              placeholder={'1. Modul pembuka…\n2. Materi inti…\n3. Studi kasus & praktik…'}
              value={form.syllabus}
              onChange={(e) => setForm({ ...form, syllabus: e.target.value })}
            />
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy || !form.title.trim() || !form.category.trim()}>
              {busy ? 'Menyimpan…' : 'Simpan Program'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>
              Batal
            </Button>
          </div>
        </form>
      ) : null}

      {rows === null ? (
        <p className="mt-4 text-sm text-slate-400">Memuat…</p>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <Empty>Belum ada program. Tambahkan program pertama di atas.</Empty>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.map((p) => {
            const d = drafts[p.id];
            const isOpen = editing === p.id;
            return (
              <div key={p.id} className="rounded-2xl border border-slate-100 p-3 shadow-[0_1px_6px_rgba(0,0,0,0.03)]">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{p.title}</p>
                    <p className="text-[11px] text-slate-400">
                      <span className="rounded-full bg-slate-100 px-2 py-px font-semibold text-slate-500">
                        {p.category}
                      </span>{' '}
                      · {money(p.standardPrice)} per peserta
                      {p.inHousePrice != null ? ` · paket ${money(p.inHousePrice)}` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => (isOpen ? setEditing(null) : startEdit(p))}>
                    {isOpen ? 'Tutup' : 'Ubah'}
                  </Button>
                  <button
                    title="Hapus program"
                    disabled={busy}
                    onClick={() => removeProgram(p)}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs transition disabled:opacity-25',
                      'bg-[#FDECEA] text-[#E53935] hover:bg-[#FBDDD9]',
                    )}
                  >
                    ✕
                  </button>
                </div>

                {!isOpen ? (
                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    {p.description ? <p>{p.description}</p> : <p className="text-slate-300">Tanpa deskripsi.</p>}
                    {p.syllabus ? (
                      <details className="text-slate-500">
                        <summary className="cursor-pointer font-semibold text-[#E53935]">📋 Silabus ({p.syllabus.split('\n').length} poin)</summary>
                        <ol className="mt-1 list-inside list-decimal space-y-0.5 pl-1">
                          {p.syllabus.split('\n').filter(Boolean).map((line, i) => (
                            <li key={i}>{line.replace(/^\s*\d+[.)]\s*/, '')}</li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2">
                    <Field label="Nama Program">
                      <Input value={d?.title ?? ''} onChange={(e) => setDrafts({ ...drafts, [p.id]: { ...d, title: e.target.value } })} />
                    </Field>
                    <Field label="Kategori">
                      <Input value={d?.category ?? ''} onChange={(e) => setDrafts({ ...drafts, [p.id]: { ...d, category: e.target.value } })} />
                    </Field>
                    <Field label="Deskripsi" className="sm:col-span-2">
                      <textarea rows={2} className={TXT} value={d?.description ?? ''} onChange={(e) => setDrafts({ ...drafts, [p.id]: { ...d, description: e.target.value } })} />
                    </Field>
                    <Field label="Silabus (opsional)" className="sm:col-span-2">
                      <textarea rows={4} className={TXT} value={d?.syllabus ?? ''} onChange={(e) => setDrafts({ ...drafts, [p.id]: { ...d, syllabus: e.target.value } })} />
                    </Field>
                    <Field label="Harga Paket In-House (opsional)">
                      <Input type="number" min={0} value={d?.inHousePrice ?? ''} onChange={(e) => setDrafts({ ...drafts, [p.id]: { ...d, inHousePrice: e.target.value } })} />
                    </Field>
                    <div className="flex gap-2 sm:col-span-2">
                      <Button size="sm" disabled={busy || !d?.title.trim() || !d?.category.trim()} onClick={() => saveEdit(p)}>
                        Simpan Perubahan
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Batal
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Pager page={page} total={total} limit={pageSize} rows={pageSize} onRowsChange={setPageSize} onChange={setPage} />
    </Card>
  );
}

const KEYS = ['name', 'email', 'phone', 'company', 'position', 'program', 'tanggal', 'lokasi', 'kota'] as const;
type RowKey = (typeof KEYS)[number];
const ALIAS: Record<string, RowKey> = {
  nama: 'name', name: 'name', namalengkap: 'name', fullname: 'name',
  email: 'email', surel: 'email',
  telepon: 'phone', telp: 'phone', phone: 'phone', hp: 'phone', nowa: 'phone', whatsapp: 'phone', nowhatsapp: 'phone', nomor: 'phone', nohp: 'phone', mobile: 'phone',
  perusahaan: 'company', company: 'company', instansi: 'company', organisasi: 'company',
  jabatan: 'position', posisi: 'position', position: 'position', jobtitle: 'position',
  program: 'program', programpelatihan: 'program', programyangsudahdiikuti: 'program', pelatihan: 'program', training: 'program', kelas: 'program',
  tanggal: 'tanggal', tgl: 'tanggal', date: 'tanggal', waktupelaksanaan: 'tanggal',
  lokasi: 'lokasi', location: 'lokasi', tempat: 'lokasi', venue: 'lokasi',
  kota: 'kota', city: 'kota',
};
const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');

type ImportRowResult = {
  row: number;
  name: string;
  phone: string;
  program?: string;
  tanggal?: string;
  action: 'created' | 'updated' | 'skipped' | 'error';
  message?: string;
};
type ImportSummary = {
  dryRun: boolean;
  total: number;
  participantsCreated: number;
  participantsUpdated: number;
  participantsSkipped: number;
  enrollmentsAdded: number;
  enrollmentsSkipped: number;
  classesCreated: number;
  errors: number;
  results: ImportRowResult[];
};

function ImportBadge({ action }: { action: ImportRowResult['action'] }) {
  const map: Record<ImportRowResult['action'], string> = {
    created: 'bg-emerald-100 text-emerald-700',
    updated: 'bg-sky-100 text-sky-700',
    skipped: 'bg-amber-100 text-amber-700',
    error: 'bg-rose-100 text-rose-600',
  };
  const label: Record<ImportRowResult['action'], string> = {
    created: 'Dibuat', updated: 'Diperbarui', skipped: 'Dilewati', error: 'Error',
  };
  return <Badge className={map[action]}>{label[action]}</Badge>;
}

/** Migrasi data alumni dari CSV/Excel. */
function AlumniImportCard() {
  const [rows, setRows] = useState<Array<Record<string, string>> | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');

  async function onFile(file: File) {
    setParseError('');
    setReport(null);
    setError('');
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames.includes('Alumni') ? 'Alumni' : wb.SheetNames[0];
      const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
      if (raw.length < 2) {
        setParseError('File kosong atau hanya berisi header.');
        setRows(null);
        return;
      }
      const headers = (raw[0] as unknown[]).map((h) => normHeader(String(h ?? '')));
      const mapped = headers.map((h) => ALIAS[h]);
      if (!mapped.includes('name') || !mapped.includes('phone')) {
        setParseError('Kolom wajib "nama" dan "telepon" tidak ditemukan. Gunakan template yang disediakan.');
        setRows(null);
        return;
      }
      const parsed: Array<Record<string, string>> = [];
      const localDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      for (let i = 1; i < raw.length; i++) {
        const line = raw[i] as unknown[];
        const obj: Record<string, string> = {};
        let empty = true;
        mapped.forEach((key, idx) => {
          if (!key) return;
          const cell = line[idx];
          const v = cell instanceof Date ? localDate(cell) : String(cell ?? '').trim();
          if (v) empty = false;
          obj[key] = v;
        });
        if (!empty) parsed.push(obj);
      }
      if (parsed.length === 0) {
        setParseError('Tidak ada baris data yang bisa dibaca.');
        setRows(null);
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch {
      setParseError('Gagal membaca file. Pastikan format .csv, .xlsx, atau .xls.');
      setRows(null);
    }
  }

  async function submit(dryRun: boolean) {
    if (!rows) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<ImportSummary>('/alumni-import', {
        method: 'POST',
        body: { rows, dryRun, updateExisting },
      });
      setReport(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memproses impor');
    } finally {
      setBusy(false);
    }
  }

  function downloadReport() {
    if (!report) return;
    const head = 'baris,nama,telepon,program,tanggal,status,keterangan';
    const body = report.results
      .map((r) =>
        [
          r.row,
          `"${(r.name ?? '').replace(/"/g, '""')}"`,
          `"${r.phone ?? ''}"`,
          `"${(r.program ?? '').replace(/"/g, '""')}"`,
          `"${(r.tanggal ?? '').replace(/"/g, '""')}"`,
          r.action,
          `"${(r.message ?? '').replace(/"/g, '""')}"`,
        ].join(','),
      )
      .join('\n');
    const blob = new Blob([`${head}\n${body}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-impor-alumni-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const preview = rows?.slice(0, 8) ?? [];

  return (
    <Card className="max-w-4xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Migrasi Data Alumni</h2>
          <p className="mt-0.5 max-w-md text-xs text-slate-400">
            Unggah data alumni lama dari <b>CSV atau Excel</b>. Kolom wajib: <b>nama</b> & <b>telepon</b>.
            Kolom riwayat: <b>program, tanggal, lokasi, kota</b> (opsional). Satu orang boleh memiliki
            beberapa baris program — aplikasi akan <b>menggabungkan orang yang sama</b>. Selalu jalankan{' '}
            <b>Cek (dry-run)</b> dulu sebelum impor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/templates/template-alumni.csv"
            download
            className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ⬇ Template CSV
          </a>
          <a
            href="/templates/template-alumni.xlsx"
            download
            className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ⬇ Template Excel
          </a>
        </div>
      </div>

      <ErrorNote message={error} />
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
            className="block w-full max-w-sm cursor-pointer rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-[#FDECEA] file:px-3 file:py-1 file:text-[12px] file:font-semibold file:text-[#E53935]"
          />
          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            Perbarui data yang sudah ada (cocok via telepon/email)
          </label>
        </div>

        {parseError ? <ErrorNote message={parseError} /> : null}

        {rows ? (
          <>
            <p className="text-[13px] text-slate-500">
              File <b>{fileName}</b> — <b>{rows.length}</b> baris terbaca.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-[12px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thCls}>Nama</th>
                    <th className={thCls}>Telepon</th>
                    <th className={thCls}>Email</th>
                    <th className={thCls}>Perusahaan</th>
                    <th className={thCls}>Program</th>
                    <th className={thCls}>Tanggal</th>
                    <th className={thCls}>Lokasi / Kota</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td className={tdCls}>{r.name || '—'}</td>
                      <td className={tdCls}>{r.phone || '—'}</td>
                      <td className={tdCls}>{r.email || '—'}</td>
                      <td className={tdCls}>{r.company || '—'}</td>
                      <td className={tdCls}>{r.program || '—'}</td>
                      <td className={tdCls}>{r.tanggal || '—'}</td>
                      <td className={tdCls}>{[r.lokasi, r.kota].filter(Boolean).join(' / ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">Menampilkan {preview.length} baris pertama dari {rows.length}.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => submit(true)}>
                🔍 Cek (dry-run)
              </Button>
              <Button
                disabled={busy || !report || report.dryRun !== true}
                onClick={() => {
                  if (window.confirm('Impor data ini ke database sekarang?')) void submit(false);
                }}
                title={!report || report.dryRun !== true ? 'Jalankan Cek (dry-run) dulu' : 'Impor ke database'}
              >
                ⬆ Impor Sekarang
              </Button>
              <Button variant="ghost" onClick={() => { setRows(null); setReport(null); setFileName(''); }}>
                Bersihkan
              </Button>
            </div>
          </>
        ) : null}

        {report ? (
          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={report.dryRun ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'}>
                {report.dryRun ? 'HASIL CEK (belum disimpan)' : 'HASIL IMPOR'}
              </Badge>
              <Badge className="bg-slate-100 text-slate-600">Total baris {report.total}</Badge>
              <Badge className="bg-emerald-100 text-emerald-700">Peserta dibuat {report.participantsCreated}</Badge>
              <Badge className="bg-sky-100 text-sky-700">Peserta diperbarui {report.participantsUpdated}</Badge>
              <Badge className="bg-amber-100 text-amber-700">Peserta dilewati {report.participantsSkipped}</Badge>
              <Badge className="bg-emerald-100 text-emerald-700">Riwayat ditambahkan {report.enrollmentsAdded}</Badge>
              <Badge className="bg-amber-100 text-amber-700">Riwayat dilewati {report.enrollmentsSkipped}</Badge>
              {report.classesCreated > 0 ? (
                <Badge className="bg-[#F3E8FF] text-[#7E57C2]">Kelas baru {report.classesCreated}</Badge>
              ) : null}
              <Badge className="bg-rose-100 text-rose-600">Error {report.errors}</Badge>
              {!report.dryRun ? (
                <Button size="sm" variant="outline" className="ml-auto" onClick={downloadReport}>
                  ⬇ Unduh laporan
                </Button>
              ) : null}
            </div>
            {report.results.some((r) => r.action === 'error') ? (
              <div className="mt-3 max-h-56 overflow-y-auto rounded-xl bg-rose-50/60 p-3 text-[12px] text-rose-700">
                {report.results
                  .filter((r) => r.action === 'error')
                  .slice(0, 50)
                  .map((r) => (
                    <p key={r.row}>
                      Baris {r.row}: {r.message} {r.name ? `(${r.name})` : ''}
                    </p>
                  ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { me } = useAuth();

  if (me && me.role !== 'SUPER_ADMIN') {
    return (
      <div>
        <PageHeader title="Konfigurasi Aplikasi" />
        <Card className="p-6">
          <p className="text-sm text-slate-500">
            Halaman ini hanya dapat diakses oleh <b>Super Admin</b>.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Konfigurasi Aplikasi"
        desc="Kelola seluruh pengaturan sistem Intimakna TMS sebagai Super Admin."
      />

      <WidgetBoard
        pageKey="settings"
        widgets={[
          { key: 'general', label: 'Konfigurasi Umum', node: <GeneralSettingsManager /> },
          { key: 'pipeline', label: 'Pipeline Leads (Status)', node: <PipelineManager /> },
          { key: 'materials', label: 'Judul Materi & Learning Path', node: <MaterialsManager /> },
          { key: 'classes', label: 'Kelas Reguler', node: <ClassesManager /> },
          { key: 'programs', label: 'Program Pelatihan', node: <ProgramsManager /> },
          { key: 'checklist', label: 'Checklist Default', node: <ChecklistTemplateManager /> },
          { key: 'import', label: 'Migrasi Data Alumni', node: <AlumniImportCard /> },
          {
            key: 'areas',
            label: 'Modul Lain & Akses Cepat',
            node: (
              <div className="space-y-5">
                <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
                  {AREAS.map((a) => (
                    <Card key={a.title} className="p-5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FDECEA] text-lg">
                          {a.icon}
                        </span>
                        <div>
                          <p className="font-bold text-slate-900">{a.title}</p>
                          <p className="text-xs text-slate-400">{a.desc}</p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Empty>Menunggu spesifikasi & akan aktif pada rilis berikutnya.</Empty>
                      </div>
                    </Card>
                  ))}
                </div>
                <Card className="w-fit max-w-full p-5">
                  <p className="mb-3 text-sm font-bold text-slate-900">Akses cepat</p>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/users" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                      ☺ Kelola Akun & Peran
                    </Link>
                    <Link href="/leads" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                      ◈ Lihat Kanban Leads
                    </Link>
                    <Link href="/batches" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                      ☰ Master Program & Batch
                    </Link>
                  </div>
                  {me ? (
                    <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
                      Masuk sebagai <b className="text-[#7E57C2]">{ROLE_LABEL[me.role]}</b> — {me.email}
                    </p>
                  ) : null}
                </Card>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
