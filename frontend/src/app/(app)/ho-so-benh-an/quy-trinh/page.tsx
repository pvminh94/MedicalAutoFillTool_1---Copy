'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GitBranch, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input, Label, Select, Switch, Textarea } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface WorkflowStep {
  key: string;
  name: string;
  title: string;
  kind: 'requester' | 'role' | 'dept_head' | 'creator';
  roleCodes?: string[];
  confirmText?: string;
  allowReturn?: boolean;
  requireNote?: boolean;
}

interface Workflow {
  id: number;
  code: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  isDefault: boolean;
  departmentId: number | null;
  departmentName?: string | null;
  active: boolean;
}

interface RoleOption {
  code: string;
  name: string;
}

const KIND_LABEL: Record<string, string> = {
  requester: 'Người đề nghị của phiếu',
  creator: 'Người tạo phiếu',
  dept_head: 'Trưởng khoa của người đề nghị',
  role: 'Theo vai trò được chỉ định',
};

const emptyStep = (): WorkflowStep => ({
  key: '',
  name: '',
  title: '',
  kind: 'role',
  roleCodes: [],
  confirmText: '',
  allowReturn: true,
  requireNote: false,
});

/**
 * Thiết kế quy trình ký: số bước, thứ tự, người có thẩm quyền ở mỗi bước — hoàn toàn cấu hình.
 */
export default function WorkflowsPage() {
  const can = useAuth((s) => s.can);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<Workflow | null>(null);
  const [deleting, setDeleting] = useState<Workflow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['hsba-workflows'],
    queryFn: () => apiFetch<Workflow[]>('/hsba/workflows'),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles-all'],
    queryFn: () => apiFetch<RoleOption[]>('/roles/all'),
  });

  const workflows = data ?? [];

  const save = useMutation({
    mutationFn: async (payload: Workflow) => {
      const body = { ...payload };
      delete (body as Record<string, unknown>).departmentName;
      if (payload.id) return apiFetch<Workflow>(`/hsba/workflows/${payload.id}`, { method: 'PUT', body });
      return apiFetch<Workflow>('/hsba/workflows', { method: 'POST', body });
    },
    onSuccess: async (result: Workflow) => {
      toast.success('Đã lưu quy trình ký');
      setForm(null);
      setSelectedId(result?.id ?? null);
      await queryClient.invalidateQueries({ queryKey: ['hsba-workflows'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/hsba/workflows/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Đã xoá quy trình');
      setDeleting(null);
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ['hsba-workflows'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const setStep = (index: number, patch: Partial<WorkflowStep>): void => {
    if (!form) return;
    const steps = [...form.steps];
    steps[index] = { ...steps[index], ...patch };
    setForm({ ...form, steps });
  };

  const moveStep = (index: number, delta: number): void => {
    if (!form) return;
    const target = index + delta;
    if (target < 0 || target >= form.steps.length) return;
    const steps = [...form.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setForm({ ...form, steps });
  };

  const addStep = (): void => {
    if (!form) return;
    setForm({ ...form, steps: [...form.steps, emptyStep()] });
  };

  const removeStep = (index: number): void => {
    if (!form) return;
    setForm({ ...form, steps: form.steps.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quy trình ký điện tử"
        description="Khai báo số bước ký, thứ tự và thẩm quyền từng bước; có thể áp dụng chung hoặc riêng cho từng khoa"
        actions={
          can('hsba.workflow.create') ? (
            <Button
              onClick={() => {
                setForm({
                  id: 0,
                  code: '',
                  name: '',
                  description: '',
                  steps: [
                    { ...emptyStep(), key: 'DE_NGHI', name: 'Người đề nghị xác nhận', title: 'NGƯỜI ĐỀ NGHỊ SỬA HSBA', kind: 'requester' },
                    { ...emptyStep(), key: 'KHTB', name: 'Duyệt – TB.KHTH', title: 'DUYỆT/ TB.KHTH', kind: 'role', roleCodes: ['KHTB'] },
                  ],
                  isDefault: false,
                  departmentId: null,
                  active: true,
                });
                setSelectedId(null);
              }}
            >
              <Plus /> Thêm quy trình
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="max-h-[75vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <EmptyState title="Chưa có quy trình nào" />
          ) : (
            <div className="divide-y">
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(wf.id);
                    setForm({ ...wf });
                  }}
                  className={cn(
                    'block w-full px-3 py-2.5 text-left transition-colors',
                    selectedId === wf.id ? 'bg-[var(--accent)]' : 'hover:bg-[var(--muted)]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <GitBranch className="size-3.5 text-[var(--muted-foreground)]" />
                    <span className="truncate text-sm font-medium">{wf.name}</span>
                    {wf.isDefault ? <Badge tone="info">Mặc định</Badge> : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                    <span className="font-mono">{wf.code}</span>
                    <span>· {wf.steps.length} bước</span>
                    {wf.departmentName ? <span>· {wf.departmentName}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {form ? (
          <Card>
            <form
              className="space-y-4 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (form.steps.length === 0) {
                  toast.error('Quy trình phải có ít nhất một bước ký');
                  return;
                }
                save.mutate(form);
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="text-base font-semibold">{form.id ? 'Cập nhật quy trình' : 'Quy trình mới'}</div>
                <div className="flex items-center gap-2">
                  {form.id && can('hsba.workflow.delete') && !form.isDefault ? (
                    <Button type="button" variant="danger" size="sm" onClick={() => setDeleting(form)}>
                      <Trash2 /> Xoá
                    </Button>
                  ) : null}
                  <Button type="submit" loading={save.isPending}>
                    <Save /> Lưu quy trình
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wf-code">Mã quy trình *</Label>
                  <Input id="wf-code" value={form.code} disabled={!!form.id} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wf-name">Tên quy trình *</Label>
                  <Input id="wf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wf-desc">Mô tả</Label>
                  <Textarea id="wf-desc" rows={2} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v })} />
                  Áp dụng làm quy trình mặc định
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                  Đang sử dụng
                </label>
              </div>

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Các bước ký ({form.steps.length})</div>
                  <Button type="button" variant="outline" size="sm" onClick={addStep}>
                    <Plus /> Thêm bước
                  </Button>
                </div>

                {form.steps.map((step, index) => (
                  <div key={index} className="space-y-3 rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">Bước {index + 1}</div>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => moveStep(index, -1)} title="Lên">
                          <ArrowUp />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" disabled={index === form.steps.length - 1} onClick={() => moveStep(index, 1)} title="Xuống">
                          <ArrowDown />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="text-[var(--danger)]" onClick={() => removeStep(index)} title="Xoá bước">
                          <Trash2 />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label>Mã bước *</Label>
                        <Input value={step.key} onChange={(e) => setStep(index, { key: e.target.value.toUpperCase().replace(/\s+/g, '_') })} placeholder="KHTB" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Tên bước *</Label>
                        <Input value={step.name} onChange={(e) => setStep(index, { name: e.target.value })} placeholder="Duyệt – TB.KHTH" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Chức danh in trên phiếu *</Label>
                        <Input value={step.title} onChange={(e) => setStep(index, { title: e.target.value.toUpperCase() })} placeholder="DUYỆT/ TB.KHTH" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Người được ký</Label>
                        <Select value={step.kind} onChange={(e) => setStep(index, { kind: e.target.value as WorkflowStep['kind'] })}>
                          {Object.entries(KIND_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      {step.kind === 'role' ? (
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>Vai trò được ký (chọn nhiều)</Label>
                          <div className="flex flex-wrap gap-1.5 rounded-lg border p-2">
                            {(roles ?? []).map((role) => {
                              const checked = (step.roleCodes ?? []).includes(role.code);
                              return (
                                <label
                                  key={role.code}
                                  className={cn(
                                    'cursor-pointer rounded-full border px-2.5 py-1 text-[11px]',
                                    checked ? 'border-[var(--primary)] bg-[var(--accent)]' : 'hover:bg-[var(--muted)]',
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    className="mr-1.5 align-middle"
                                    checked={checked}
                                    onChange={(e) =>
                                      setStep(index, {
                                        roleCodes: e.target.checked
                                          ? [...(step.roleCodes ?? []), role.code]
                                          : (step.roleCodes ?? []).filter((c) => c !== role.code),
                                      })
                                    }
                                  />
                                  {role.name}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      <div className="space-y-1.5 sm:col-span-3">
                        <Label>Lời xác nhận khi ký</Label>
                        <Textarea
                          rows={2}
                          value={step.confirmText ?? ''}
                          onChange={(e) => setStep(index, { confirmText: e.target.value })}
                          placeholder="Tôi đã xem xét và DUYỆT / Thông báo cho sửa HSBA điện tử theo nội dung trên."
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={!!step.allowReturn} onCheckedChange={(v) => setStep(index, { allowReturn: v })} />
                        Cho phép trả lại
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={!!step.requireNote} onCheckedChange={(v) => setStep(index, { requireNote: v })} />
                        Bắt buộc ghi ý kiến
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </form>
          </Card>
        ) : (
          <Card className="flex items-center justify-center p-10 text-sm text-[var(--muted-foreground)]">
            Chọn một quy trình để xem/sửa, hoặc bấm “Thêm quy trình”.
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!deleting}
        title="Xoá quy trình ký"
        message={<>Xoá quy trình <b>{deleting?.name}</b>? Các phiếu đã tạo vẫn giữ nguyên dấu vết ký.</>}
        confirmText="Xoá"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
