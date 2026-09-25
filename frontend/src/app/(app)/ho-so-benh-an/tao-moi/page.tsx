'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, Save, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Card, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Switch, Textarea } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface DeptOption {
  id: number;
  name: string;
  level: number;
}

interface UserOption {
  id: number;
  fullName: string;
  username: string;
  title: string | null;
  departmentId: number | null;
}

interface Workflow {
  id: number;
  code: string;
  name: string;
  isDefault: boolean;
  departmentId: number | null;
  steps: { key: string; name: string; title: string; kind: string }[];
}

/** Tạo phiếu đề nghị sửa hồ sơ bệnh án — có thể gửi ngay hoặc lưu nháp. */
export default function CreateHsbaPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [form, setForm] = useState<Record<string, unknown>>({
    patientGender: 'Nữ',
    doiTuong: 'BHYT',
    priority: 'NORMAL',
    signNow: true,
  });
  const [signNow, setSignNow] = useState(true);

  useEffect(() => {
    if (!user) return;
    setForm((s) => ({
      ...s,
      requesterId: user.id,
      requesterName: user.fullName,
      requesterTitle: user.title ?? '',
      departmentId: user.departmentId ?? '',
      departmentName: user.departmentName ?? '',
    }));
  }, [user]);

  const { data: departments } = useQuery({
    queryKey: ['departments-options'],
    queryFn: () => apiFetch<DeptOption[]>('/departments/options'),
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['users-options'],
    queryFn: () => apiFetch<{ items: UserOption[] }>('/users?pageSize=200&activeOnly=true'),
  });

  const { data: workflows } = useQuery({
    queryKey: ['hsba-workflows'],
    queryFn: () => apiFetch<Workflow[]>('/hsba/workflows'),
  });

  const set = (key: string, value: unknown): void => setForm((s) => ({ ...s, [key]: value }));

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiFetch<{ id: number; code: string }>('/hsba/requests', { method: 'POST', body: payload }),
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

  const selectedRequester = users?.items.find((u) => u.id === Number(form.requesterId));

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
        <Card className="lg:col-span-2">
          <div className="space-y-5 p-4">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                1. Người đề nghị
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="requesterId">Tài khoản ký đề nghị *</Label>
                  <Select
                    id="requesterId"
                    value={String(form.requesterId ?? '')}
                    disabled={loadingUsers}
                    onChange={(e) => {
                      const u = users?.items.find((x) => x.id === Number(e.target.value));
                      setForm((s) => ({
                        ...s,
                        requesterId: e.target.value ? Number(e.target.value) : '',
                        requesterName: u?.fullName ?? s.requesterName,
                        requesterTitle: u?.title ?? '',
                        departmentId: u?.departmentId ?? s.departmentId,
                      }));
                    }}
                  >
                    <option value="">— Chọn người đề nghị —</option>
                    {(users?.items ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.username})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="requesterTitle">Chức danh</Label>
                  <Input id="requesterTitle" value={String(form.requesterTitle ?? '')} onChange={(e) => set('requesterTitle', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="departmentId">Khoa đề nghị</Label>
                  <Select
                    id="departmentId"
                    value={String(form.departmentId ?? '')}
                    onChange={(e) => {
                      const d = departments?.find((x) => x.id === Number(e.target.value));
                      setForm((s) => ({ ...s, departmentId: e.target.value ? Number(e.target.value) : null, departmentName: d?.name ?? '' }));
                    }}
                  >
                    <option value="">— Chọn khoa —</option>
                    {(departments ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {'— '.repeat(Math.max(0, d.level - 1))}
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="priority">Mức ưu tiên</Label>
                  <Select id="priority" value={String(form.priority ?? 'NORMAL')} onChange={(e) => set('priority', e.target.value)}>
                    <option value="LOW">Thấp</option>
                    <option value="NORMAL">Bình thường</option>
                    <option value="HIGH">Ưu tiên</option>
                    <option value="URGENT">Khẩn cấp</option>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t pt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                2. Người bệnh
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="patientName">Họ và tên người bệnh *</Label>
                  <Input id="patientName" value={String(form.patientName ?? '')} onChange={(e) => set('patientName', e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="patientGender">Giới tính</Label>
                  <Select id="patientGender" value={String(form.patientGender ?? '')} onChange={(e) => set('patientGender', e.target.value)}>
                    <option value="">—</option>
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Khác">Khác</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="patientBirthYear">Năm sinh</Label>
                  <Input id="patientBirthYear" value={String(form.patientBirthYear ?? '')} onChange={(e) => set('patientBirthYear', e.target.value)} placeholder="1985" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="maKcb">Mã KCB / mã hồ sơ</Label>
                  <Input id="maKcb" value={String(form.maKcb ?? '')} onChange={(e) => set('maKcb', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="maTheBhyt">Mã thẻ BHYT</Label>
                  <Input id="maTheBhyt" value={String(form.maTheBhyt ?? '')} onChange={(e) => set('maTheBhyt', e.target.value)} placeholder="DN4 79 1234567890" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ngayVaoVien">Ngày vào viện</Label>
                  <Input id="ngayVaoVien" type="date" value={String(form.ngayVaoVien ?? '')} onChange={(e) => set('ngayVaoVien', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ngayRaVien">Ngày ra viện</Label>
                  <Input id="ngayRaVien" type="date" value={String(form.ngayRaVien ?? '')} onChange={(e) => set('ngayRaVien', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doiTuong">Đối tượng</Label>
                  <Select id="doiTuong" value={String(form.doiTuong ?? 'BHYT')} onChange={(e) => set('doiTuong', e.target.value)}>
                    <option value="BHYT">BHYT</option>
                    <option value="Thu phí">Thu phí</option>
                    <option value="Miễn">Miễn</option>
                    <option value="Khác">Khác</option>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t pt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                3. Nội dung đề nghị sửa
              </h2>
              <div className="space-y-1.5">
                <Label htmlFor="reason">Lý do sai sót *</Label>
                <Textarea
                  id="reason"
                  rows={3}
                  value={String(form.reason ?? '')}
                  onChange={(e) => set('reason', e.target.value)}
                  placeholder="Ví dụ: Nhập sai ngày ra viện do hồ sơ giấy chưa khớp với phần mềm HIS…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="content">Nội dung cần sửa trong HSBA điện tử *</Label>
                <Textarea
                  id="content"
                  rows={4}
                  value={String(form.content ?? '')}
                  onChange={(e) => set('content', e.target.value)}
                  placeholder="Ví dụ: Sửa ngày ra viện từ 12/09/2026 thành 15/09/2026; điều chỉnh lại chẩn đoán…"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Số tiền liên quan (đồng)</Label>
                  <Input id="amount" value={String(form.amount ?? '')} onChange={(e) => set('amount', e.target.value)} placeholder="1250000" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="attachmentsNote">Tài liệu kèm theo</Label>
                  <Input id="attachmentsNote" value={String(form.attachmentsNote ?? '')} onChange={(e) => set('attachmentsNote', e.target.value)} placeholder="Bản sao hồ sơ giấy…" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={signNow} onCheckedChange={setSignNow} />
                Ký xác nhận ngay sau khi tạo (nếu bạn chính là người đề nghị)
              </label>
            </section>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="border-b px-4 py-3 text-sm font-semibold">Quy trình ký áp dụng</div>
            <div className="space-y-2 p-4">
              {!workflows ? (
                <Skeleton className="h-20" />
              ) : (
                <>
                  <Select value={String(form.workflowId ?? '')} onChange={(e) => set('workflowId', e.target.value ? Number(e.target.value) : undefined)}>
                    <option value="">— Tự chọn theo khoa (khuyến nghị) —</option>
                    {(workflows ?? []).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                        {w.isDefault ? ' (mặc định)' : ''}
                      </option>
                    ))}
                  </Select>
                  {(() => {
                    const wf =
                      (workflows ?? []).find((w) => w.id === Number(form.workflowId)) ??
                      (workflows ?? []).find((w) => w.isDefault) ??
                      (workflows ?? [])[0];
                    if (!wf) return null;
                    return (
                      <ol className="space-y-2 pt-2">
                        {wf.steps.map((step, index) => (
                          <li key={step.key} className="flex items-start gap-2">
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-semibold">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{step.name}</div>
                              <div className="text-[11px] text-[var(--muted-foreground)]">
                                {step.title} · {step.kind === 'requester' ? 'người đề nghị' : step.kind === 'dept_head' ? 'trưởng khoa' : step.kind === 'creator' ? 'người tạo phiếu' : 'theo vai trò'}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    );
                  })()}
                </>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
              <ClipboardList className="size-4" /> Người đề nghị đã chọn
            </div>
            <div className="space-y-1 p-4 text-sm">
              <div className="font-medium">{selectedRequester?.fullName ?? '—'}</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {selectedRequester?.username} · {selectedRequester?.title ?? ''}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {departments?.find((d) => d.id === Number(form.departmentId))?.name ?? 'Chưa chọn khoa'}
              </div>
              <p className="pt-2 text-[11px] text-[var(--muted-foreground)]">
                Người đề nghị chịu trách nhiệm về nội dung ký số ở bước 1. Bước 2 do tài khoản thuộc vai trò KHTB duyệt,
                bước 3 do vai trò Tài chính xác nhận đã hủy thanh toán.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
