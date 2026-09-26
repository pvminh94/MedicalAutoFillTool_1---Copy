'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, Save, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  HsbaRequestForm,
  type DeptOption,
  type RequestFormValue,
  type UserOption,
  type WorkflowOption,
} from '@/components/hsba/request-form';
import { PageHeader } from '@/components/shared/page-header';
import { Card, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/input';
import { toList } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paginated } from '@/types/api';

/** Tạo phiếu đề nghị sửa hồ sơ bệnh án — có thể gửi ký ngay hoặc lưu nháp. */
export default function CreateHsbaPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [form, setForm] = useState<RequestFormValue>({
    patientGender: 'Nữ',
    doiTuong: 'BHYT',
    priority: 'NORMAL',
  });
  const [signNow, setSignNow] = useState(true);

  useEffect(() => {
    if (!user) return;
    setForm((s) => ({
      ...s,
      requesterId: user.id,
      requesterName: user.fullName,
      requesterTitle: user.title ?? '',
      departmentId: user.departmentId ?? null,
      departmentName: user.departmentName ?? '',
    }));
  }, [user]);

  const { data: departments } = useQuery({
    queryKey: ['departments-options'],
    queryFn: () => apiFetch<DeptOption[]>('/departments/options'),
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['users-options'],
    queryFn: () => apiFetch<Paginated<UserOption>>('/users?pageSize=200&activeOnly=true'),
  });

  const { data: workflows } = useQuery({
    queryKey: ['hsba-workflows'],
    queryFn: () => apiFetch<unknown>('/hsba/workflows?pageSize=200').then((d) => toList<WorkflowOption>(d)),
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<{ id: number; code: string }>('/hsba/requests', { method: 'POST', body: payload }),
    onSuccess: (result) => {
      toast.success(`Đã tạo phiếu ${result.code}`);
      router.push(`/ho-so-benh-an/${result.id}`);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const submit = (sign: boolean): void => {
    if (!form.patientName || !form.reason || !form.content || !form.requesterId) {
      toast.error('Vui lòng nhập người đề nghị, tên người bệnh, lý do và nội dung đề nghị sửa');
      return;
    }
    create.mutate({ ...form, signNow: sign });
  };

  const activeWorkflow =
    (workflows ?? []).find((w) => w.id === Number(form.workflowId)) ??
    (workflows ?? []).find((w) => w.isDefault) ??
    (workflows ?? [])[0];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumb={
          <Link href="/ho-so-benh-an" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3" /> Danh sách phiếu
          </Link>
        }
        title="Tạo phiếu đề nghị sửa HSBA"
        description="Ghi rõ lý do sai sót và nội dung cần sửa để Ban KHTH và Tài chính xác nhận"
        actions={
          <>
            <Button variant="outline" loading={create.isPending} onClick={() => submit(false)}>
              <Save /> Lưu nháp
            </Button>
            <Button loading={create.isPending} onClick={() => submit(true)}>
              <Send /> Tạo và gửi ký
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-4">
          {loadingUsers ? (
            <Skeleton className="h-64" />
          ) : (
            <HsbaRequestForm
              value={form}
              onChange={setForm}
              users={users?.items}
              departments={departments}
              workflows={workflows}
            />
          )}
          <label className="mt-4 flex items-center gap-2 border-t pt-4 text-sm">
            <Switch checked={signNow} onCheckedChange={setSignNow} />
            Ký xác nhận ngay sau khi tạo (nếu bạn chính là người đề nghị)
          </label>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="border-b px-4 py-3 text-sm font-semibold">Quy trình ký áp dụng</div>
            <div className="p-4">
              {!activeWorkflow ? (
                <p className="text-sm text-[var(--muted-foreground)]">Chưa có quy trình ký nào được cấu hình.</p>
              ) : (
                <>
                  <div className="text-sm font-medium">{activeWorkflow.name}</div>
                  <ol className="mt-2 space-y-2">
                    {activeWorkflow.steps.map((step, index) => (
                      <li key={step.key} className="flex items-start gap-2">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-semibold">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{step.name}</div>
                          <div className="text-[11px] text-[var(--muted-foreground)]">
                            {step.title} ·{' '}
                            {step.kind === 'requester'
                              ? 'người đề nghị'
                              : step.kind === 'dept_head'
                                ? 'trưởng khoa'
                                : step.kind === 'creator'
                                  ? 'người tạo phiếu'
                                  : 'theo vai trò'}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
              <ClipboardList className="size-4" /> Lưu ý khi lập phiếu
            </div>
            <ul className="space-y-2 p-4 text-[12px] text-[var(--muted-foreground)]">
              <li>• Nội dung đề nghị sửa cần ghi rõ “từ … thành …” để KHTH đối chiếu nhanh.</li>
              <li>• Số tiền liên quan giúp Tài chính xác định giao dịch BHYT cần hủy.</li>
              <li>• Sau khi ký bước 1, nếu bị trả lại bạn có thể sửa nội dung và gửi lại.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
