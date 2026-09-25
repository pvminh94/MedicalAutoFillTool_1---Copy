'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, StatCard } from '@/components/shared/page-header';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { apiFetch, downloadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatNumber, todayISO } from '@/lib/utils';

interface SummaryDept {
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  kind: string;
  templateId: number | null;
  templateName: string;
  indicators: Record<string, number>;
  filled: boolean;
}

interface SummaryResult {
  period: { period: string; from: string; to: string; label: string };
  departments: SummaryDept[];
  indicators: { key: string; label: string; colKey: string }[];
  totals: Record<string, number>;
  missing: { id: number; name: string }[];
}

const PERIODS = [
  { value: 'day', label: 'Ngày' },
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'quarter', label: 'Quý' },
  { value: 'year', label: 'Năm' },
];

/** Bảng tổng hợp toàn viện: gom số liệu mọi khoa theo chỉ tiêu chung. */
export default function SummaryPage() {
  const can = useAuth((s) => s.can);
  const [period, setPeriod] = useState('week');
  const [date, setDate] = useState(todayISO());

  const query = `period=${period}&date=${date}`;

  const { data, isLoading } = useQuery({
    queryKey: ['report-summary', query],
    queryFn: () => apiFetch<SummaryResult>(`/reports/summary?${query}`),
  });

  const exportSummary = async (format: 'excel' | 'pdf'): Promise<void> => {
    try {
      await downloadFile(`/reports/export/${format}?${query}&summary=1`, `Tong-hop-toan-vien.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch {
      /* một số cấu hình chỉ cho kết xuất theo mẫu khoa */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tổng hợp toàn viện"
        description="Số liệu công tác của tất cả khoa trong kỳ — tự động gom theo chỉ tiêu khám bệnh, vào viện, ra viện…"
        actions={
          <>
            <Button variant="outline" onClick={() => exportSummary('excel')} disabled={!can('report.export.excel')}>
              <Download /> Excel
            </Button>
            <Button onClick={() => window.print()}>
              <Printer /> In bảng tổng hợp
            </Button>
          </>
        }
      />

      <Card className="no-print">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Kỳ tổng hợp</label>
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
          {data ? (
            <div className="ml-auto flex items-center gap-2">
              <Badge tone="info">{data.period.label}</Badge>
              <Badge tone={data.missing.length === 0 ? 'success' : 'warning'}>
                {data.departments.length - data.missing.length}/{data.departments.length} khoa đã nhập
              </Badge>
            </div>
          ) : null}
        </div>
      </Card>

      {isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Khoa có báo cáo" value={data.departments.length} icon={<Building2 className="size-4" />} tone="primary" />
            <StatCard
              label="Khám bệnh"
              value={formatNumber(data.totals.kham ?? 0)}
              hint={data.period.label}
              tone="success"
            />
            <StatCard label="Vào viện" value={formatNumber(data.totals.vao ?? 0)} />
            <StatCard
              label="Chưa nhập số liệu"
              value={data.missing.length}
              icon={<AlertTriangle className="size-4" />}
              tone={data.missing.length ? 'danger' : 'success'}
            />
          </div>

          {data.missing.length > 0 ? (
            <Card className="no-print border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
              <div className="font-medium">Các khoa chưa nhập số liệu kỳ này</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {data.missing.map((m) => (
                  <Badge key={m.id} tone="warning">
                    {m.name}
                  </Badge>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="print-sheet">
            <div className="border-b px-6 py-4 text-center">
              <h2 className="text-lg font-bold uppercase">Bảng tổng hợp công tác toàn viện</h2>
              <div className="text-sm font-medium">{data.period.label}</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">
                Từ {data.period.from} đến {data.period.to}
              </div>
            </div>

            {data.departments.length === 0 ? (
              <EmptyState title="Chưa có khoa nào bật nhập báo cáo" />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th className="sticky left-0 z-10 bg-[var(--card)]">Khoa</Th>
                    <Th>Mẫu báo cáo</Th>
                    {data.indicators.map((ind) => (
                      <Th key={ind.key} className="text-center">
                        {ind.label}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.departments.map((dept) => (
                    <Tr key={dept.departmentId} className={cn(!dept.filled && 'text-[var(--muted-foreground)]')}>
                      <Td className="sticky left-0 z-10 bg-[var(--card)]">
                        <div className="font-medium">{dept.departmentName}</div>
                        <div className="font-mono text-[10px]">{dept.departmentCode}</div>
                      </Td>
                      <Td className="text-xs">
                        {dept.templateName || <Badge tone="warning">Chưa gán mẫu</Badge>}
                      </Td>
                      {data.indicators.map((ind) => (
                        <Td key={ind.key} className="text-right tabular-nums">
                          {dept.indicators[ind.key] ? formatNumber(dept.indicators[ind.key]) : '—'}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                  <Tr className="bg-[var(--muted)] font-bold">
                    <Td className="sticky left-0 z-10 bg-[var(--card)]">TỔNG CỘNG</Td>
                    <Td />
                    {data.indicators.map((ind) => (
                      <Td key={ind.key} className="text-right tabular-nums">
                        {formatNumber(data.totals[ind.key] ?? 0)}
                      </Td>
                    ))}
                  </Tr>
                </tbody>
              </TableWrap>
            )}

            <div className="flex items-end justify-end gap-10 px-6 py-5 text-sm">
              <div className="text-center">
                <div className="font-medium">Ban KHTH</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">(Ký, ghi rõ họ tên)</div>
                <div className="mt-14 w-40 border-t" />
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
