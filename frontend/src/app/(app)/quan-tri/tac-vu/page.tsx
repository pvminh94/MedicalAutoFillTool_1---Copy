'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Play, Power, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CrudTable, type CrudField } from '@/components/shared/crud-table';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';

interface HandlerInfo {
  code: string;
  label: string;
  description: string;
}

interface JobRun {
  id: number;
  status: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  message?: string;
  error?: string;
  errorStack?: string;
  trigger?: string;
}

/** Tác vụ định kỳ: sao lưu, chốt số liệu, dọn tệp, nhắc nhở nhập báo cáo… */
export default function JobsPage() {
  const can = useAuth((s) => s.can);
  const queryClient = useQueryClient();
  const [historyJob, setHistoryJob] = useState<Record<string, unknown> | null>(null);

  const { data: handlers } = useQuery({
    queryKey: ['job-handlers'],
    queryFn: () => apiFetch<HandlerInfo[]>('/jobs/handlers'),
  });

  const { data: history } = useQuery({
    queryKey: ['job-runs', historyJob?.id],
    enabled: !!historyJob,
    queryFn: () => apiFetch<{ runs: JobRun[] }>(`/jobs/${historyJob?.id}`),
  });

  const runNow = useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ message?: string; durationMs?: number }>(`/jobs/${id}/run`, { method: 'POST' }),
    onMutate: () => toast.loading('Đang chạy tác vụ…', { id: 'job-run' }),
    onSuccess: async (res) => {
      // API chạy xong mới trả về → hiện đúng kết quả thay vì chỉ "đã kích hoạt"
      const secs = res?.durationMs ? ` (${(res.durationMs / 1000).toFixed(1)}s)` : '';
      toast.success(`${res?.message ?? 'Tác vụ đã chạy xong'}${secs}`, { id: 'job-run', duration: 8000 });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/jobs'] }),
        queryClient.invalidateQueries({ queryKey: ['job-runs'] }),
      ]);
    },
    onError: async (err) => {
      toast.error((err as Error).message, { id: 'job-run', duration: 10000 });
      await queryClient.invalidateQueries({ queryKey: ['job-runs'] });
    },
  });

  const toggle = useMutation({
    mutationFn: (payload: { id: number; active: boolean }) =>
      apiFetch(`/jobs/${payload.id}/toggle`, { method: 'PATCH', body: { active: payload.active } }),
    onSuccess: async () => {
      toast.success('Đã đổi trạng thái tác vụ');
      await queryClient.invalidateQueries({ queryKey: ['/jobs'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const sync = useMutation({
    mutationFn: () => apiFetch('/jobs/sync', { method: 'POST' }),
    onSuccess: () => toast.success('Đã đồng bộ lịch chạy với bộ định thời'),
    onError: (err) => toast.error((err as Error).message),
  });

  const fields: CrudField[] = [
    { name: 'code', label: 'Mã tác vụ', required: true, createOnly: true, placeholder: 'BACKUP_NGAY' },
    { name: 'name', label: 'Tên tác vụ', required: true, placeholder: 'Sao lưu cơ sở dữ liệu hằng ngày' },
    {
      name: 'handler',
      label: 'Hàm xử lý',
      type: 'select',
      required: true,
      options: (handlers ?? []).map((h) => ({ value: h.code, label: `${h.label} (${h.code})` })),
      help: 'Danh mục hàm có sẵn do hệ thống cung cấp',
    },
    { name: 'cron', label: 'Biểu thức Cron', required: true, placeholder: '30 23 * * *', help: 'Ví dụ 30 23 * * * = 23:30 hằng ngày' },
    { name: 'timezone', label: 'Múi giờ', defaultValue: 'Asia/Ho_Chi_Minh' },
    { name: 'timeoutSec', label: 'Thời gian tối đa (giây)', type: 'number', defaultValue: 300, hideInTable: true },
    { name: 'maxRetries', label: 'Số lần thử lại', type: 'number', defaultValue: 2, hideInTable: true },
    { name: 'allowOverlap', label: 'Cho chạy chồng lấn', type: 'switch', defaultValue: false, hideInTable: true },
    { name: 'active', label: 'Đang bật', type: 'switch', defaultValue: true },
    { name: 'description', label: 'Mô tả', type: 'textarea' },
  ];

  return (
    <>
      <PageHeader
        title="Tác vụ định kỳ"
        description="Bộ định thời chạy nền: sao lưu, chốt số liệu báo cáo, dọn tệp tạm, gửi nhắc nhở"
        actions={
          <Button variant="outline" loading={sync.isPending} onClick={() => sync.mutate()}>
            <RefreshCw /> Đồng bộ lịch chạy
          </Button>
        }
      />
      <CrudTable
        title="Danh sách tác vụ"
        endpoint="/jobs"
        fields={fields}
        createLabel="Thêm tác vụ"
        searchPlaceholder="Tìm theo mã, tên, hàm xử lý…"
        canCreate={can('job.create')}
        canEdit={can('job.update')}
        canDelete={can('job.delete')}
        pageSize={20}
        columns={[
          {
            key: 'name',
            label: 'Tác vụ',
            render: (row) => (
              <div>
                <div className="font-medium">{String(row.name)}</div>
                <div className="font-mono text-[10px] text-[var(--muted-foreground)]">{String(row.code)}</div>
              </div>
            ),
          },
          {
            key: 'cron',
            label: 'Lịch chạy',
            render: (row) => (
              <div>
                <div className="font-mono text-xs">{String(row.cron)}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">
                  {row.nextRun ? `Kế tiếp: ${formatDateTime(String(row.nextRun))}` : 'Chưa tính được'}
                </div>
              </div>
            ),
          },
          { key: 'handlerLabel', label: 'Hàm xử lý' },
          {
            key: 'lastStatus',
            label: 'Lần chạy gần nhất',
            render: (row) => (
              <div className="space-y-0.5">
                <Badge
                  tone={
                    row.lastStatus === 'SUCCESS'
                      ? 'success'
                      : row.lastStatus === 'FAILED'
                        ? 'danger'
                        : row.lastStatus === 'RUNNING'
                          ? 'warning'
                          : 'muted'
                  }
                >
                  {row.lastStatus === 'SUCCESS'
                    ? 'Thành công'
                    : row.lastStatus === 'FAILED'
                      ? 'Thất bại'
                      : row.lastStatus === 'RUNNING'
                        ? 'Đang chạy'
                        : 'Chưa chạy'}
                </Badge>
                <div className="text-[10px] text-[var(--muted-foreground)]">
                  {row.lastRunAt ? formatDateTime(String(row.lastRunAt)) : '—'} · {String(row.runCount ?? 0)} lần
                  {Number(row.failCount ?? 0) > 0 ? ` · ${row.failCount} lỗi` : ''}
                </div>
              </div>
            ),
          },
          {
            key: 'active',
            label: 'Bật',
            render: (row) => (row.active ? <Badge tone="success">Đang bật</Badge> : <Badge tone="muted">Tắt</Badge>),
          },
        ]}
        rowActions={(row) => (
          <>
            {can('job.run') ? (
              <Button variant="ghost" size="icon" title="Chạy ngay" onClick={() => runNow.mutate(Number(row.id))}>
                <Play />
              </Button>
            ) : null}
            {can('job.update') ? (
              <Button
                variant="ghost"
                size="icon"
                title={row.active ? 'Tắt tác vụ' : 'Bật tác vụ'}
                onClick={() => toggle.mutate({ id: Number(row.id), active: !row.active })}
              >
                <Power />
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" title="Lịch sử chạy" onClick={() => setHistoryJob(row)}>
              <CalendarClock />
            </Button>
          </>
        )}
      />

      <Dialog
        open={!!historyJob}
        onClose={() => setHistoryJob(null)}
        title={`Lịch sử chạy: ${String(historyJob?.name ?? '')}`}
        description="50 lần chạy gần nhất"
        size="lg"
      >
        <div className="space-y-2">
          {history?.runs?.length ? (
            history.runs.map((run) => (
              <div key={run.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    tone={run.status === 'SUCCESS' ? 'success' : run.status === 'FAILED' ? 'danger' : run.status === 'RUNNING' ? 'warning' : 'muted'}
                  >
                    {run.status}
                  </Badge>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    {formatDateTime(run.startedAt)}
                    {run.durationMs ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ''}
                  </span>
                </div>
                {run.message ? <div className="mt-1 text-xs text-[var(--muted-foreground)]">{run.message}</div> : null}
                {run.status === 'FAILED' && (run.error || run.errorStack) ? (
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--danger)]">{(run.error || run.errorStack || '').split('\n').slice(0, 4).join('\n')}</pre>
                ) : null}
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">Chưa có lần chạy nào được ghi lại</div>
          )}
        </div>
      </Dialog>
    </>
  );
}
