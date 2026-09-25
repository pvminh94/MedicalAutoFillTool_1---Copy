'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  History,
  Undo2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader, StatCard } from '@/components/shared/page-header';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatNumber } from '@/lib/utils';
import type { DashboardSummary } from '@/types/api';

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'muted'> = {
  SUCCESS: 'success',
  FAILED: 'danger',
  RUNNING: 'warning',
  SKIPPED: 'muted',
};

export default function DashboardPage() {
  const user = useAuth((s) => s.user);
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiFetch<DashboardSummary>('/dashboard/summary?days=14'),
    refetchInterval: 120_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Bảng điều khiển" description="Đang tải số liệu…" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const { hsba, reports, users, departments, jobs, recentAudit } = data;
  const scopeLabel = data.scope.isSuperAdmin
    ? 'Toàn viện'
    : data.scope.dataScope === 'ALL'
      ? 'Toàn viện (được uỷ quyền)'
      : `Khoa ${user?.departmentName ?? 'được gán'}`;

  const chartData = hsba.trend.map((t, i) => ({
    day: String(t.day).slice(5),
    'Phiếu tạo': t.total,
    'Hoàn tất': t.completed,
    'Ô số liệu': reports.trend[i]?.cells ?? 0,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Xin chào, ${user?.fullName ?? ''}`}
        description={`Phạm vi số liệu: ${scopeLabel} · Cập nhật ${formatDateTime(new Date().toISOString())}`}
        actions={
          <>
            <Link
              href="/ho-so-benh-an/tao-moi"
              className="inline-flex h-9.5 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
            >
              <ClipboardList className="size-4" /> Tạo phiếu sửa HSBA
            </Link>
            <Link
              href="/bao-cao/nhap-lieu"
              className="inline-flex h-9.5 items-center gap-2 rounded-lg border bg-[var(--card)] px-4 text-sm font-medium hover:bg-[var(--accent)]"
            >
              <FileSpreadsheet className="size-4" /> Nhập số liệu báo cáo
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Tổng phiếu sửa HSBA"
          value={formatNumber(hsba.total)}
          hint={`${formatNumber(hsba.today)} phiếu tạo hôm nay`}
          icon={<ClipboardList className="size-4" />}
          tone="primary"
        />
        <StatCard
          label="Đang chờ ký"
          value={formatNumber(hsba.pending)}
          hint="Chờ người đề nghị / KHTH / tài chính"
          icon={<CalendarClock className="size-4" />}
          tone="warning"
        />
        <StatCard
          label="Đã hoàn tất"
          value={formatNumber(hsba.completed)}
          hint="Đủ 3 bước ký xác nhận"
          icon={<CheckCircle2 className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Phiếu bị trả lại"
          value={formatNumber(hsba.returned)}
          hint="Cần chỉnh sửa và trình lại"
          icon={<Undo2 className="size-4" />}
          tone="danger"
        />
        <StatCard
          label="Ô số liệu hôm nay"
          value={formatNumber(reports.entriesToday)}
          hint={`${reports.departmentsToday}/${reports.departments} khoa đã nhập`}
          icon={<BarChart3 className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b px-4 py-3">
            <div className="text-sm font-semibold">Diễn biến 14 ngày gần nhất</div>
            <div className="text-xs text-[var(--muted-foreground)]">
              Phiếu sửa hồ sơ bệnh án tạo mới / hoàn tất và số ô số liệu báo cáo được nhập
            </div>
          </div>
          <div className="h-72 w-full p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gHsba" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="gDone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="Phiếu tạo"
                  stroke="var(--primary)"
                  fill="url(#gHsba)"
                  strokeWidth={2}
                />
                <Area type="monotone" dataKey="Hoàn tất" stroke="#10b981" fill="url(#gDone)" strokeWidth={2} />
                <Area
                  type="monotone"
                  dataKey="Ô số liệu"
                  stroke="#f59e0b"
                  fill="transparent"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="border-b px-4 py-3 text-sm font-semibold">Quy mô hệ thống</div>
            <div className="grid grid-cols-2 divide-x divide-y">
              <div className="p-3">
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <Users className="size-3.5" /> Người dùng
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(users.users)}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">{users.active} đang hoạt động</div>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <Building2 className="size-3.5" /> Khoa phòng
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(departments.total)}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {departments.reportable} khoa gửi báo cáo
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <BarChart3 className="size-3.5" /> Khoa có báo cáo
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{reports.departments}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {reports.departmentsToday} khoa nhập hôm nay
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <Activity className="size-3.5" /> Số liệu kỳ này
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {formatNumber(reports.entriesPeriod)}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">ô số liệu trong 7 ngày</div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-semibold">Tác vụ định kỳ</div>
              <Link
                href="/quan-tri/tac-vu"
                className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
              >
                Quản lý <ArrowRight className="size-3" />
              </Link>
            </div>
            <div className="divide-y">
              {jobs.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-[var(--muted-foreground)]">
                  Chưa cấu hình tác vụ nào
                </div>
              ) : (
                jobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{job.name}</div>
                      <div className="font-mono text-[11px] text-[var(--muted-foreground)]">{job.cron}</div>
                    </div>
                    <div className="text-right">
                      <Badge tone={job.active ? STATUS_TONE[job.lastStatus ?? ''] ?? 'muted' : 'muted'}>
                        {job.lastStatus === 'SUCCESS'
                          ? 'Thành công'
                          : job.lastStatus === 'FAILED'
                            ? 'Lỗi'
                            : job.active
                              ? 'Chờ chạy'
                              : 'Tắt'}
                      </Badge>
                      <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                        {job.lastRunAt ? formatDateTime(job.lastRunAt) : 'chưa chạy'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4" /> Hoạt động gần đây
          </div>
          <Link
            href="/quan-tri/nhat-ky"
            className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
          >
            Xem nhật ký <ArrowRight className="size-3" />
          </Link>
        </div>
        {recentAudit.length === 0 ? (
          <EmptyState title="Chưa có hoạt động nào" />
        ) : (
          <ul className="divide-y">
            {recentAudit.map((log) => (
              <li key={log.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="mt-1 size-2 shrink-0 rounded-full bg-[var(--primary)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-medium">{log.fullName || log.username}</span>{' '}
                    <span className="text-[var(--muted-foreground)]">{log.description}</span>
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {log.module} · {log.entity || '—'} · {formatDate(log.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
