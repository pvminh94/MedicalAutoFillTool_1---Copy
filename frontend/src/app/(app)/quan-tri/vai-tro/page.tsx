'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, Save, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, normalizeVN } from '@/lib/utils';

interface Role {
  id: number;
  code: string;
  name: string;
  description?: string;
  dataScope: 'OWN' | 'DEPT' | 'ALL';
  priority: number;
  color?: string;
  isSystem: boolean;
  active: boolean;
  userCount?: number;
  permissionCount?: number;
}

interface Permission {
  id: number;
  code: string;
  module: string;
  action: string;
  name: string;
  description?: string;
}

interface Matrix {
  roles: { id: number; code: string; name: string; color?: string; dataScope: string }[];
  permissions: Permission[];
  granted: Record<string, string[]>;
}

const SCOPE_LABEL: Record<string, string> = {
  ALL: 'Toàn viện',
  DEPT: 'Theo khoa',
  OWN: 'Cá nhân',
};

/** Vai trò & ma trận phân quyền chi tiết theo từng chức năng. */
export default function RolesPage() {
  const can = useAuth((s) => s.can);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [duplicating, setDuplicating] = useState<Role | null>(null);
  const [newCode, setNewCode] = useState('');

  const { data: matrix, isLoading } = useQuery({
    queryKey: ['roles-matrix'],
    queryFn: () => apiFetch<Matrix>('/roles/matrix'),
  });

  const roles = matrix?.roles ?? [];
  const selected = roles.find((r) => r.id === selectedId) ?? null;
  const roleDetail = useQuery({
    queryKey: ['roles-detail', selectedId],
    enabled: !!selectedId,
    queryFn: () => apiFetch<Role>(`/roles/${selectedId}`),
  });

  useEffect(() => {
    if (!selectedId && roles.length) setSelectedId(roles[0].id);
  }, [roles, selectedId]);

  useEffect(() => {
    if (selected) setChecked(new Set(matrix?.granted[selected.code] ?? []));
  }, [selected, matrix]);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    const kw = normalizeVN(keyword.trim());
    for (const p of matrix?.permissions ?? []) {
      if (kw && !normalizeVN(`${p.name} ${p.code} ${p.module}`).includes(kw)) continue;
      const list = map.get(p.module) ?? [];
      list.push(p);
      map.set(p.module, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [matrix, keyword]);

  const savePermissions = useMutation({
    mutationFn: (payload: { id: number; codes: string[] }) =>
      apiFetch(`/roles/${payload.id}/permissions`, { method: 'PUT', body: { permissionCodes: payload.codes } }),
    onSuccess: async () => {
      toast.success('Đã lưu phân quyền');
      await queryClient.invalidateQueries({ queryKey: ['roles-matrix'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const saveRole = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing && editing !== 'new'
        ? apiFetch(`/roles/${(editing as Role).id}`, { method: 'PUT', body: payload })
        : apiFetch('/roles', { method: 'POST', body: payload }),
    onSuccess: async () => {
      toast.success('Đã lưu vai trò');
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['roles-matrix'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const removeRole = useMutation({
    mutationFn: (id: number) => apiFetch(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Đã xoá vai trò');
      setDeleting(null);
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ['roles-matrix'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const duplicateRole = useMutation({
    mutationFn: (payload: { id: number; code: string }) =>
      apiFetch(`/roles/${payload.id}/duplicate`, { method: 'POST', body: { code: payload.code } }),
    onSuccess: async () => {
      toast.success('Đã nhân bản vai trò');
      setDuplicating(null);
      setNewCode('');
      await queryClient.invalidateQueries({ queryKey: ['roles-matrix'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const openRoleForm = (role: Role | 'new'): void => {
    setEditing(role);
    setForm(
      role === 'new'
        ? { code: '', name: '', description: '', dataScope: 'DEPT', priority: 50, active: true }
        : { ...role },
    );
  };

  const toggleAll = (list: Permission[], value: boolean): void => {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const p of list) {
        if (value) next.add(p.code);
        else next.delete(p.code);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vai trò & phân quyền"
        description="Mỗi vai trò gồm tập quyền chi tiết theo chức năng và phạm vi dữ liệu được xem"
        actions={
          can('role.create') ? (
            <Button onClick={() => openRoleForm('new')}>
              <Plus /> Thêm vai trò
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Card className="max-h-[75vh] overflow-y-auto">
            <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {roles.length} vai trò
            </div>
            <div className="divide-y">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedId(role.id)}
                  className={cn(
                    'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                    selectedId === role.id ? 'bg-[var(--accent)]' : 'hover:bg-[var(--muted)]',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{role.name}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                      <span className="font-mono">{role.code}</span>
                      <span>· {SCOPE_LABEL[role.dataScope]}</span>
                    </div>
                  </div>
                  <Badge tone="muted">{(matrix?.granted[role.code] ?? []).length} quyền</Badge>
                </button>
              ))}
            </div>
          </Card>

          {selected ? (
            <Card className="flex max-h-[75vh] flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <ShieldCheck className="size-4 text-[var(--primary)]" />
                    {selected.name}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    Mã <span className="font-mono">{selected.code}</span> · phạm vi {SCOPE_LABEL[selected.dataScope]} ·
                    đang có {checked.size}/{(matrix?.permissions ?? []).length} quyền
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
                    <Input
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="Tìm quyền…"
                      className="h-8.5 w-44 pl-8 text-sm"
                    />
                  </div>
                  {can('role.create') ? (
                    <Button variant="outline" size="sm" onClick={() => setDuplicating(selected as unknown as Role)}>
                      <Copy /> Nhân bản
                    </Button>
                  ) : null}
                  {can('role.update') ? (
                    <Button variant="outline" size="sm" onClick={() => openRoleForm(selected as unknown as Role)}>
                      Sửa vai trò
                    </Button>
                  ) : null}
                  {can('role.delete') && !(roleDetail.data?.isSystem ?? false) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[var(--danger)]"
                      onClick={() => setDeleting(selected as unknown as Role)}
                    >
                      <Trash2 /> Xoá
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    loading={savePermissions.isPending}
                    onClick={() => savePermissions.mutate({ id: selected.id, codes: [...checked] })}
                  >
                    <Save /> Lưu phân quyền
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {grouped.length === 0 ? (
                  <EmptyState title="Không tìm thấy quyền phù hợp" />
                ) : (
                  grouped.map(([module, perms]) => {
                    const allChecked = perms.every((p) => checked.has(p.code));
                    return (
                      <div key={module} className="rounded-xl border">
                        <div className="flex items-center justify-between gap-2 border-b bg-[var(--muted)]/50 px-3 py-2">
                          <div className="font-mono text-xs font-semibold uppercase">{module}</div>
                          <label className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                            <input
                              type="checkbox"
                              checked={allChecked}
                              onChange={(e) => toggleAll(perms, e.target.checked)}
                            />
                            Chọn cả nhóm
                          </label>
                        </div>
                        <div className="grid gap-1 p-2 sm:grid-cols-2">
                          {perms.map((p) => (
                            <label
                              key={p.code}
                              className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--muted)]"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={checked.has(p.code)}
                                onChange={(e) =>
                                  setChecked((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(p.code);
                                    else next.delete(p.code);
                                    return next;
                                  })
                                }
                              />
                              <span className="min-w-0">
                                <span className="block truncate">{p.name}</span>
                                <span className="block font-mono text-[10px] text-[var(--muted-foreground)]">
                                  {p.code}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          ) : (
            <Card className="flex items-center justify-center p-10 text-sm text-[var(--muted-foreground)]">
              Chọn một vai trò để xem và chỉnh tập quyền.
            </Card>
          )}
        </div>
      )}

      {/* Thêm / sửa vai trò */}
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Thêm vai trò' : `Sửa vai trò: ${String(form.name ?? '')}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Huỷ
            </Button>
            <Button form="role-form" type="submit" loading={saveRole.isPending}>
              <KeyRound /> Lưu
            </Button>
          </>
        }
      >
        <form
          id="role-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveRole.mutate(form);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="role-code">Mã vai trò *</Label>
            <Input
              id="role-code"
              value={String(form.code ?? '')}
              onChange={(e) => setForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))}
              required
              disabled={editing !== 'new'}
              placeholder="TRUONG_KHOA"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Tên vai trò *</Label>
            <Input
              id="role-name"
              value={String(form.name ?? '')}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-scope">Phạm vi dữ liệu</Label>
            <Select
              id="role-scope"
              value={String(form.dataScope ?? 'DEPT')}
              onChange={(e) => setForm((s) => ({ ...s, dataScope: e.target.value }))}
            >
              <option value="OWN">Chỉ dữ liệu do mình tạo</option>
              <option value="DEPT">Theo khoa được gán</option>
              <option value="ALL">Toàn viện</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-desc">Mô tả</Label>
            <Input
              id="role-desc"
              value={String(form.description ?? '')}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!duplicating}
        onClose={() => setDuplicating(null)}
        title={`Nhân bản vai trò: ${duplicating?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDuplicating(null)}>
              Huỷ
            </Button>
            <Button
              loading={duplicateRole.isPending}
              disabled={!newCode.trim()}
              onClick={() => duplicating && duplicateRole.mutate({ id: duplicating.id, code: newCode.trim().toUpperCase() })}
            >
              Nhân bản
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="dup-code">Mã vai trò mới *</Label>
          <Input id="dup-code" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="TRUONG_KHOA_2" />
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Toàn bộ quyền của vai trò gốc sẽ được sao chép sang vai trò mới.
          </p>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title="Xoá vai trò"
        message={
          <>
            Xoá vai trò <b>{deleting?.name}</b>? Chỉ xoá được khi chưa có người dùng nào được gán.
          </>
        }
        confirmText="Xoá"
        loading={removeRole.isPending}
        onConfirm={() => deleting && removeRole.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
