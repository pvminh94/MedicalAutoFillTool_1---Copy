'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, BarChart3, FileDown, FileSpreadsheet, FileText, Lock, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, StatCard } from '@/components/shared/page-header';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { apiFetch, downloadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDateTime, formatNumber, todayISO } from '@/lib/utils';
import type { Paginated } from '@/types/api';

interface SnapshotRow {
  id: number;
  templateId: number;
  departmentId: number | null;
  title: string;
  periodLabel: string;
  status: 'DRAFT' | 'APPROVED' | 'LOCKED';
  dateFrom: string;
  dateTo: string;
  createdAt: string;
  createdBy: number;
}

const SNAPSHOT_STATUS: Record<string, { label: string; tone: 'muted' | 'info' | 'success' }> = {
  DRAFT: { label: 'Bản nháp', tone: 'muted' },
  APPROVED: { label: 'Đã duyệt', tone: 'info' },
  LOCKED: { label: 'Đã khoá', tone: 'success' },
};

interface TemplateRow {
  id: number;
  code: string;
  name: string;
  title: string;
  departmentName: string;
  defaultPeriod: string;
}

interface ReportCell {
  colKey: string;
  raw: number;
  value: number;
  formatted: string;
  kind: 'INPUT' | 'CALC';
}

interface ReportViewRow {
  rowId: number;
  rowLabel: string;
  unit: string;
  agg: string;
  isBold: boolean;
  isTotal: boolean;
  note: string;
  cells: ReportCell[];
}

interface ReportBuild {
  template: { id: number; name: string; title: string; subtitle: string; footerNote: string; departmentName: string };
  period: { period: string; from: string; to: string; label: string };
  columns: { colKey: string; label: string; groupLabel: string; kind: string; unit: string; align: string; format: string }[];
  sections: {
    id: number;
    title: string;
    note: string;
    rows: ReportViewRow[];
    blocks: { id: number | null; label: string; note: string; rows: ReportViewRow[] }[];
  }[];
  totals: Record<string, number>;
  completeness: { days: number; daysWithData: number; ratio: number };
  entryCount: number;
}

const PERIODS = [
  { value: 'day', label: 'Ngày' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'quarter', label: 'Quý' },
  { value: 'year', label: 'Năm' },
];

export default function ReportViewPage() {
  const can = useAuth((s) => s.can);
  const queryClient = useQueryClient();
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [confirmLock, setConfirmLock] = useState<SnapshotRow | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [period, setPeriod] = useState('week');
  const [date, setDate] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());

  const { data: templates } = useQuery({
    queryKey: ['report-templates'],
    queryFn: () => apiFetch<Paginated<TemplateRow>>('/reports/templates?pageSize=100&activeOnly=true'),
  });

  const activeTemplateId = templateId ?? templates?.items[0]?.id ?? null;

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (activeTemplateId) p.set('templateId', String(activeTemplateId));
    p.set('period', period);
    p.set('date', date);
    if (period === 'range') p.set('dateTo', dateTo);
    return p.toString();
  }, [activeTemplateId, period, date, dateTo]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['report-view', query],
    enabled: !!activeTemplateId,
    queryFn: () => apiFetch<ReportBuild>(`/reports/view?${query}`),
  });

  const { data: snapshots } = useQuery({
    queryKey: ['report-snapshots', activeTemplateId],
    enabled: showSnapshots && !!activeTemplateId,
    queryFn: () => apiFetch<Paginated<SnapshotRow>>(`/reports/snapshots?templateId=${activeTemplateId}&pageSize=50`),
  });

  const createSnapshot = useMutation({
    mutationFn: () =>
      apiFetch('/reports/snapshots', {
        method: 'POST',
        body: {
          templateId: activeTemplateId,
          period,
          date,
          dateTo: period === 'range' ? dateTo : undefined,
        },
      }),
    onSuccess: async () => {
      toast.success('Đã chốt số liệu kỳ báo cáo');
      setShowSnapshots(true);
      await queryClient.invalidateQueries({ queryKey: ['report-snapshots'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const setSnapshotStatus = useMutation({
    mutationFn: (payload: { id: number; status: 'DRAFT' | 'APPROVED' | 'LOCKED' }) =>
      apiFetch(`/reports/snapshots/${payload.id}/status`, { method: 'PATCH', body: { status: payload.status } }),
    onSuccess: async () => {
      toast.success('Đã cập nhật trạng thái bản chốt');
      setConfirmLock(null);
      await queryClient.invalidateQueries({ queryKey: ['report-snapshots'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const exportFile = async (format: 'excel' | 'word' | 'pdf'): Promise<void> => {
    if (!data) return;
    const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : 'pdf';
    const safeName = `${data.template.name} - ${data.period.label}`.replace(/[\\/:*?"<>|]/g, '-');
    try {
      await downloadFile(`/reports/export/${format}?${query}`, `${safeName}.${ext}`);
      toast.success('Đã tải tệp kết xuất');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Báo cáo công tác của khoa"
        description="Số liệu tổng hợp theo kỳ, kèm tỷ lệ hoàn thành nhập liệu và kết xuất chuyên nghiệp"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className={cn(isFetching && 'animate-spin')} />
            </Button>
            {can('report.export.excel') ? (
              <Button variant="outline" onClick={() => exportFile('excel')}>
                <FileSpreadsheet /> Excel
              </Button>
            ) : null}
            {can('report.export.word') ? (
              <Button variant="outline" onClick={() => exportFile('word')}>
                <FileText /> Word
              </Button>
            ) : null}
            {can('report.export.pdf') ? (
              <Button variant="outline" onClick={() => exportFile('pdf')}>
                <FileDown /> PDF
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setShowSnapshots(true)}>
              <Archive /> Bản chốt số liệu
            </Button>
            {can('report.snapshot.create') ? (
              <Button variant="outline" loading={createSnapshot.isPending} onClick={() => createSnapshot.mutate()}>
                <ShieldCheck /> Chốt số liệu kỳ này
              </Button>
            ) : null}
            <Button onClick={() => window.print()}>
              <Printer /> In báo cáo
            </Button>
          </>
        }
      />

      <Card className="no-print">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-64 space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Mẫu báo cáo</label>
            <Select value={String(activeTemplateId ?? '')} onChange={(e) => setTemplateId(Number(e.target.value))}>
              {(templates?.items ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.departmentName}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Kỳ</label>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Ngày tham chiếu</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          </div>
          {period === 'range' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--muted-foreground)]">Đến ngày</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
          ) : null}
          {data ? (
            <div className="ml-auto flex items-center gap-2">
              <Badge tone="info">{data.period.label}</Badge>
              <Badge tone={data.completeness.ratio >= 0.8 ? 'success' : data.completeness.ratio >= 0.5 ? 'warning' : 'danger'}>
                Nhập liệu {data.completeness.daysWithData}/{data.completeness.days} ngày
              </Badge>
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog
        open={showSnapshots}
        onClose={() => setShowSnapshots(false)}
        size="lg"
        title="Bản chốt số liệu báo cáo"
        description="Số liệu được lưu lại nguyên trạng theo kỳ — không bị ảnh hưởng khi sửa số liệu về sau"
      >
        {!snapshots || snapshots.items.length === 0 ? (
          <EmptyState
            title="Chưa có bản chốt nào"
            description="Bấm “Chốt số liệu kỳ này” để lưu lại số liệu hiện tại kèm dấu thời gian và người chốt."
          />
        ) : (
          <div className="space-y-2">
            {snapshots.items.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{s.title}</div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {s.periodLabel} · {s.dateFrom} → {s.dateTo} · chốt lúc {formatDateTime(s.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={SNAPSHOT_STATUS[s.status]?.tone ?? 'muted'}>{SNAPSHOT_STATUS[s.status]?.label ?? s.status}</Badge>
                  {can('report.snapshot.approve') && s.status === 'DRAFT' ? (
                    <Button size="sm" variant="outline" onClick={() => setSnapshotStatus.mutate({ id: s.id, status: 'APPROVED' })}>
                      Duyệt
                    </Button>
                  ) : null}
                  {can('report.snapshot.lock') && s.status !== 'LOCKED' ? (
                    <Button size="sm" variant="outline" onClick={() => setConfirmLock(s)}>
                      <Lock /> Khoá
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!confirmLock}
        title="Khoá bản chốt số liệu"
        message={<>Khoá <b>{confirmLock?.title}</b>? Sau khi khoá, số liệu của kỳ này được coi là số liệu chính thức.</>}
        confirmText="Khoá"
        loading={setSnapshotStatus.isPending}
        onConfirm={() => confirmLock && setSnapshotStatus.mutate({ id: confirmLock.id, status: 'LOCKED' })}
        onClose={() => setConfirmLock(null)}
      />

      {isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="no-print grid gap-3 sm:grid-cols-3">
            <StatCard label="Kỳ báo cáo" value={data.period.label} hint={`${data.period.from} → ${data.period.to}`} tone="primary" icon={<BarChart3 className="size-4" />} />
            <StatCard label="Số ô số liệu" value={formatNumber(data.entryCount)} hint={`${data.completeness.daysWithData}/${data.completeness.days} ngày có số liệu`} />
            <StatCard
              label="Tỷ lệ hoàn thành"
              value={`${Math.round(data.completeness.ratio * 100)}%`}
              tone={data.completeness.ratio >= 0.8 ? 'success' : 'warning'}
            />
          </div>

          <Card className="print-sheet">
            <div className="border-b px-6 py-4 text-center">
              <div className="text-xs uppercase tracking-widest text-[var(--muted-foreground)]">
                {data.template.departmentName}
              </div>
              <h2 className="mt-1 text-lg font-bold uppercase">{data.template.title || data.template.name}</h2>
              {data.template.subtitle ? <div className="text-sm">{data.template.subtitle}</div> : null}
              <div className="mt-1 text-sm font-medium">
                {data.period.label}
              </div>
            </div>

            {data.sections.length === 0 ? (
              <EmptyState title="Mẫu báo cáo chưa có dữ liệu cấu trúc" />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th className="sticky left-0 z-10 bg-[var(--card)]">Chỉ tiêu</Th>
                    {data.columns.map((col) => (
                      <Th key={col.colKey} className="text-center">
                        <div className="text-[11px] font-normal text-[var(--muted-foreground)]">{col.groupLabel || '\u00A0'}</div>
                        <div>{col.label}</div>
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sections.map((section) => (
                    <Fragment key={section.id}>
                      <tr className="bg-[var(--muted)]/60">
                        <Td className="font-semibold uppercase">{section.title}</Td>
                        {data.columns.map((col) => (
                          <Td key={col.colKey} />
                        ))}
                      </tr>
                      {[
                        ...(section.rows && section.rows.length
                          ? [{ id: null as number | null, label: '', note: '', rows: section.rows }]
                          : []),
                        ...section.blocks,
                      ].map((block, bi) => (
                        <Fragment key={`${section.id}-${bi}`}>
                          {block.label ? (
                            <tr className="bg-[var(--muted)]/30">
                              <Td className="pl-5 font-medium italic">{block.label}</Td>
                              {data.columns.map((col) => (
                                <Td key={col.colKey} />
                              ))}
                            </tr>
                          ) : null}
                          {block.rows.map((row) => (
                            <Tr key={row.rowId} className={cn(row.isBold && 'font-semibold', row.isTotal && 'bg-[var(--accent)]/40')}>
                              <Td className="sticky left-0 z-10 bg-[var(--card)] pl-5">
                                {row.rowLabel}
                                {row.unit ? <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">({row.unit})</span> : null}
                              </Td>
                              {data.columns.map((col) => {
                                const cell = row.cells.find((c) => c.colKey === col.colKey);
                                return (
                                  <Td
                                    key={col.colKey}
                                    className={cn(
                                      'tabular-nums',
                                      col.align === 'left' ? 'text-left' : 'text-right',
                                      col.kind === 'CALC' && 'text-[var(--muted-foreground)]',
                                    )}
                                  >
                                    {cell?.formatted ?? ''}
                                  </Td>
                                );
                              })}
                            </Tr>
                          ))}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                  <Tr className="bg-[var(--muted)] font-bold">
                    <Td className="sticky left-0 z-10 bg-[var(--card)]">TỔNG CỘNG</Td>
                    {data.columns.map((col) => (
                      <Td key={col.colKey} className={cn('tabular-nums', col.align === 'left' ? 'text-left' : 'text-right')}>
                        {formatNumber(data.totals[col.colKey] ?? 0)}
                      </Td>
                    ))}
                  </Tr>
                </tbody>
              </TableWrap>
            )}

            <div className="flex flex-wrap items-end justify-between gap-6 px-6 py-5 text-sm">
              <div className="text-xs italic text-[var(--muted-foreground)]">{data.template.footerNote}</div>
              <div className="grid grid-cols-3 gap-10 text-center">
                {['Người lập biểu', 'Trưởng khoa', 'Ban KHTH'].map((role) => (
                  <div key={role}>
                    <div className="font-medium">{role}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">(Ký, ghi rõ họ tên)</div>
                    <div className="mt-14 border-t" />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
