'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileDown,
  PenLine,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { PageHeader, StatCard } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import type { Paginated } from '@/types/api';

interface HsbaRow {
  id: number;
  code: string;
  status: string;
  statusLabel?: string;
  pendingStepKey: string | null;
  pendingStepName?: string | null;
  patientName: string;
  patientBirthYear: string | null;
  patientGender: string | null;
  maKcb: string | null;
  maTheBhyt: string | null;
  ngayVaoVien: string | null;
  ngayRaVien: string | null;
  requesterName: string;
  departmentName: string | null;
  amount: string | null;
  priority: string | null;
  returnCount: number;
  updatedAt: string;
  canSign?: boolean;
}

const STATUS_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'CHO_DE_NGHI', label: 'Chờ đề nghị' },
  { value: 'CHO_KHTB', label: 'Chờ KHTH' },
  { value: 'CHO_TC', label: 'Chờ tài chính' },
  { value: 'HOAN_TAT', label: 'Hoàn tất' },
  { value: 'TRA_LAI', label: 'Đã trả lại' },
  { value: 'DA_HUY', label: 'Đã hủy' },
];

function RequestsContent() {
  const params = useSearchParams();
  const can = useAuth((s) => s.can);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState(params.get('q') ?? '');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [myTurn, setMyTurn] = useState(false);
  const [mine, setMine] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', '20');
    if (search) p.set('q', search);
    if (status) p.set('status', status);
    if (myTurn) p.set('myTurn', 'true');
    if (mine) p.set('mine', 'true');
    if (dateFrom) p.set('dateFrom', dateFrom);
    if (dateTo) p.set('dateTo', dateTo);
    return p.toString();
  }, [page, search, status, myTurn, mine, dateFrom, dateTo]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['hsba-requests', query],
    queryFn: () => apiFetch<Paginated<HsbaRow>>(`/hsba/requests?${query}`),
  });

  const { data: stats } = useQuery({
    queryKey: ['hsba-stats'],
    queryFn: () => apiFetch<{ total: number; byStatus: { status: string; label: string; total: number }[] }>('/hsba/requests/stats'),
  });

  const statsMap = useMemo(
    () => Object.fromEntries((stats?.byStatus ?? []).map((s) => [s.status, s.total])),
    [stats],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Phiếu đề nghị sửa hồ sơ bệnh án"
        description="Quy trình ký điện tử 3 bước: Người đề nghị → Duyệt/TB.KHTH → Tài chính xác nhận hủy thanh toán"
        actions={
          can('hsba.request.create') ? (
            <Link
              href="/ho-so-benh-an/tao-moi"
              className="inline-flex h-9.5 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
            >
              <PenLine className="size-4" /> Tạo phiếu mới
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng số phiếu" value={formatNumber(stats?.total ?? data?.total ?? 0)} icon={<ClipboardList className="size-4" />} tone="primary" />
        <StatCard label="Chờ KHTH duyệt" value={formatNumber(statsMap.CHO_KHTB ?? 0)} tone="warning" />
        <StatCard label="Chờ tài chính" value={formatNumber(statsMap.CHO_TC ?? 0)} tone="warning" />
        <StatCard label="Đã hoàn tất" value={formatNumber(statsMap.HOAN_TAT ?? 0)} icon={<ShieldCheck className="size-4" />} tone="success" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                status === tab.value
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]',
              )}
            >
              {tab.label}
              {tab.value && statsMap[tab.value] ? ` (${statsMap[tab.value]})` : ''}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(keyword.trim());
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tên người bệnh, mã KCB, mã thẻ BHYT, số phiếu…"
              className="h-8.5 w-80 pl-8 text-sm"
            />
          </form>

          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={myTurn} onChange={(e) => { setMyTurn(e.target.checked); setPage(1); }} />
            Chờ tôi xử lý
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} />
            Phiếu của tôi
          </label>

          <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="h-8.5 w-34 text-sm" />
            <span>→</span>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="h-8.5 w-34 text-sm" />
          </div>

          <Select
            value=""
            onChange={(e) => {
              const [field, value] = e.target.value.split('|');
              if (!field) return;
              setKeyword('');
              setSearch('');
              setStatus(field === 'status' ? value : '');
            }}
            className="hidden"
            aria-hidden
          >
            <option value="">Bộ lọc nâng cao</option>
          </Select>

          <Button variant="outline" size="sm" className="ml-auto" onClick={() => refetch()} title="Tải lại">
            <RefreshCw className={cn(isFetching && 'animate-spin')} />
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Chưa có phiếu nào"
            description="Tạo phiếu đề nghị sửa hồ sơ bệnh án đầu tiên để bắt đầu quy trình ký."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Số phiếu</Th>
                <Th>Người bệnh</Th>
                <Th>Khoa / người đề nghị</Th>
                <Th>Trạng thái</Th>
                <Th>Đang chờ</Th>
                <Th className="text-right">Số tiền</Th>
                <Th>Cập nhật</Th>
                <Th className="text-right">Thao tác</Th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <Link href={`/ho-so-benh-an/${row.id}`} className="font-mono text-xs font-semibold text-[var(--primary)] hover:underline">
                      {row.code}
                    </Link>
                    {row.priority && row.priority !== 'NORMAL' ? (
                      <Badge tone={row.priority === 'URGENT' ? 'danger' : row.priority === 'HIGH' ? 'warning' : 'muted'}>
                        {row.priority === 'URGENT' ? 'Khẩn' : row.priority === 'HIGH' ? 'Ưu tiên' : 'Thấp'}
                      </Badge>
                    ) : null}
                    <div className="text-[10px] text-[var(--muted-foreground)]">{formatDate(row.updatedAt)}</div>
                  </Td>
                  <Td>
                    <div className="font-medium">{row.patientName}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {[row.patientBirthYear, row.patientGender].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--muted-foreground)]">
                      {row.maKcb ? `KCB: ${row.maKcb}` : ''} {row.maTheBhyt ? `· BHYT: ${row.maTheBhyt}` : ''}
                    </div>
                  </Td>
                  <Td>
                    <div className="text-sm">{row.departmentName || '—'}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">{row.requesterName}</div>
                  </Td>
                  <Td>
                    <StatusBadge status={row.status} label={row.statusLabel} />
                    {row.returnCount > 0 ? (
                      <div className="mt-0.5 text-[10px] text-[var(--warning, #b45309)]">Đã trả lại {row.returnCount} lần</div>
                    ) : null}
                  </Td>
                  <Td className="text-xs">{row.pendingStepName || row.pendingStepKey || '—'}</Td>
                  <Td className="text-right text-sm tabular-nums">
                    {row.amount ? Number(row.amount).toLocaleString('vi-VN') : '—'}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">{formatDate(row.updatedAt)}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/ho-so-benh-an/${row.id}`}
                        className="rounded-lg p-2 text-xs hover:bg-[var(--muted)]"
                        title="Xem chi tiết và ký"
                      >
                        Chi tiết
                      </Link>
                      {can('hsba.request.print') ? (
                        <a
                          href={`/api/hsba/requests/${row.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg p-2 hover:bg-[var(--muted)]"
                          title="In phiếu PDF"
                        >
                          <FileDown className="size-4" />
                        </a>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}

        {data && data.total > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-xs text-[var(--muted-foreground)]">
            <div>
              {data.total} phiếu · Trang {data.page}/{Math.max(1, data.totalPages)}
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft /> Trước
              </Button>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Sau <ChevronRight />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default function HsbaListPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <RequestsContent />
    </Suspense>
  );
}
