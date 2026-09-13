'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useSettings } from '@/lib/settings';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, PageHeader, Pager, Select, thCls, tdCls, useResetPageOnSize, useRowsPerPage } from '@/components/ui';
import { WidgetBoard } from '@/components/widgets';
import { ROLE_BADGE, ROLE_LABEL, type Role, type UserRow } from '@/lib/core';

const CREATABLE_ROLES: Role[] = ['MANAGEMENT', 'SALES_MARKETING', 'ADMIN_TRAINING', 'TRAINING_SUPPORT', 'FINANCE', 'SUPER_ADMIN'];

export default function UsersPage() {
  const { me } = useAuth();
  const isManagement = me?.role === 'MANAGEMENT';
  const isSuper = me?.role === 'SUPER_ADMIN';
  const canManage = isManagement || isSuper || me?.role === 'ADMIN_TRAINING';
  const canToggle = isManagement || isSuper;
  const roleOptions = CREATABLE_ROLES.filter((r) => r !== 'SUPER_ADMIN' || isSuper);

  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useRowsPerPage('users');
  useResetPageOnSize(pageSize, setPage);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'SALES_MARKETING' });
  const { settings } = useSettings();

  useEffect(() => {
    setForm((f) =>
      f.role === 'SALES_MARKETING' && settings.defaults.newUserRole
        ? { ...f, role: settings.defaults.newUserRole }
        : f,
    );
  }, [settings.defaults.newUserRole]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ data: UserRow[]; total: number }>(`/users?paged=1&page=${page}&limit=${pageSize}`);
      setRows(r.data);
      setTotal(r.total);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pengguna');
    }
  }, [page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/users', { method: 'POST', body: form });
      setForm({ name: '', email: '', password: '', role: 'SALES_MARKETING' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat pengguna');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: UserRow) {
    try {
      await api(`/users/${u.id}/status`, { method: 'PATCH', body: { isActive: !u.isActive } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status');
    }
  }

  return (
    <div>
      <PageHeader
        title="Manajemen Pengguna"
        desc={canManage ? 'Buat akun dan kelola akses per peran (RBAC).' : undefined}
      />

      <ErrorNote message={error} />

      <WidgetBoard
        pageKey="users"
        widgets={[
          {
            key: 'create',
            label: 'Buat Akun',
            defaultSpan: 4,
            node: (
        <Card className="h-fit p-4">
          <p className="mb-3 text-sm font-semibold text-slate-800">Buat Akun Baru</p>
          <form onSubmit={createUser} className="space-y-3">
            <Field label="Nama Lengkap *">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email *">
              <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Password *" hint="Minimal 8 karakter.">
              <Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Peran">
                <Select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  disabled={!isManagement && !isSuper}
                >
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Menyimpan…' : 'Buat Akun'}
            </Button>
          </form>
        </Card>
            ),
          },
          {
            key: 'list',
            label: 'Daftar Pengguna',
            defaultSpan: 8,
            node: (
        <Card>
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
            Daftar Pengguna ({rows.length})
          </div>
          {rows.length === 0 ? (
            <div className="p-4">
              <Empty>Belum ada pengguna.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thCls}>Nama</th>
                    <th className={thCls}>Email</th>
                    <th className={thCls}>Peran</th>
                    <th className={thCls}>Status</th>
                    {canManage ? <th className={thCls}>Aksi</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className={tdCls}>
                        <p className="font-medium text-slate-800">{u.name}</p>
                        {u.id === me?.id ? <span className="text-xs text-indigo-500">(anda)</span> : null}
                      </td>
                      <td className={tdCls}>{u.email}</td>
                      <td className={tdCls}>
                        <Badge className={ROLE_BADGE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                      </td>
                      <td className={tdCls}>
                        <Badge className={u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}>
                          {u.isActive ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </td>
                      {canManage ? (
                        <td className={tdCls}>
                          {u.id !== me?.id && canToggle && (isSuper || u.role !== 'SUPER_ADMIN') ? (
                            <Button size="sm" variant={u.isActive ? 'danger' : 'outline'} onClick={() => toggleActive(u)}>
                              {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      ) : null}
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
