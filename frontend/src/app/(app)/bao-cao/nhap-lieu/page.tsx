'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, FileSpreadsheet, Lock, Save, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, StatCard } from '@/components/shared/page-header';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatNumber, todayISO } from '@/lib/utils';
import type { Paginated } from '@/types/api';

interface TemplateRow {
  id: number;
  code: string;
  name: string;
  title: string;
  departmentId: number;
  departmentName: string;
  defaultPeriod: string;
}

interface GridColumn {
  id: number;
  colKey: string;
  label: string;
  groupLabel: string;
  kind: 'INPUT' | 'CALC';
  formula: string;
  format: string;
  unit: string;
  align: string;
  width: number;
}

interface GridRow {
  id: number;
  rowLabel: string;
  unit: string;
  agg: string;
  isBold: boolean;
  isTotal: boolean;
}

interface GridSection {
  id: number;
  title: string;
  note: string;
  rows: GridRow[];
  blocks: { id: number | null; label: string; note: string; rows: GridRow[] }[];
}

interface EntryGrid {
  template: TemplateRow & { title: string; footerNote: string };
  columns: GridColumn[];
  sections: GridSection[];
  period: { from: string; to: string; label: string; period: string };
  days: string[];
  values: Record<string, number>;
  notes: Record<string, string>;
  stats: { totalCells: number; filledCells: number; entryCount: number };
  /** Bản chốt số liệu đang khoá kỳ này (nếu có) */
  locked: { id: number; title: string } | null;
}

const PERIODS = [
  { value: 'day', label: 'Ngày' },
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'quarter', label: 'Quý' },
  { value: 'year', label: 'Năm' },
];

/** Tính nhanh giá trị cột công thức để xem trước ngay trên lưới nhập. */
function evalFormula(formula: string, lookup: (colKey: string) => number): number {
  if (!formula) return 0;
  const tokens = formula.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(\.\d+)?|[-+*/()]/g) ?? [];
  let expression = '';
  for (const token of tokens) {
    if (/^[A-Za-z_]/.test(token)) expression += lookup(token);
    else expression += token;
  }
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict";return (${expression || 0})`)() as number;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export default function ReportEntryPage() {
  const can = useAuth((s) => s.can);
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [period, setPeriod] = useState('day');
  const [date, setDate] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [draft, setDraft] = useState<Record<string, number>>({});

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

  const { data, isLoading } = useQuery({
    queryKey: ['report-entry-grid', query],
    enabled: !!activeTemplateId,
    queryFn: () => apiFetch<EntryGrid>(`/reports/entries/grid?${query}`),
  });

  const singleDay = (data?.days.length ?? 1) === 1;
  const entryDate = singleDay ? (data?.days[0] ?? date) : (data?.period.to ?? date);

  const valueOf = (rowId: number, colKey: string): number => {
    const key = `${rowId}|${colKey}|${entryDate}`;
    if (key in draft) return draft[key];
    return data?.values[key] ?? 0;
  };

  const calcValue = (rowId: number, col: GridColumn): number =>
    evalFormula(col.formula, (key) => valueOf(rowId, key));

  const dirtyCount = Object.keys(draft).length;
  const isTotalRow = (row: GridRow): boolean => row.isTotal;

  const totals = useMemo(() => {
    const result: Record<string, number> = {};
    if (!data) return result;
    for (const col of data.columns) {
      if (col.kind !== 'INPUT') continue;
      let sum = 0;
      for (const section of data.sections) {
        for (const block of [...(section.rows?.length ? [{ rows: section.rows }] : []), ...section.blocks]) {
          for (const row of block.rows) {
            if (isTotalRow(row)) continue;
            sum += valueOf(row.id, col.colKey);
          }
        }
      }
      result[col.colKey] = sum;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, draft]);

  const save = useMutation({
    mutationFn: () => {
      if (!data || !activeTemplateId) throw new Error('Chưa chọn mẫu báo cáo');
      const values = Object.entries(draft).map(([key, value]) => {
        const [rowId, colKey] = key.split('|');
        return { rowId: Number(rowId), colKey, value };
      });
      return apiFetch('/reports/entries', {
        method: 'POST',
        body: {
          templateId: activeTemplateId,
          entryDate,
          forPeriod: !singleDay,
          period: singleDay ? undefined : period,
          dateTo: period === 'range' ? dateTo : undefined,
          values,
        },
      });
    },
    onSuccess: async () => {
      toast.success(`Đã lưu ${dirtyCount} ô số liệu`);
      setDraft({});
      await queryClient.invalidateQueries({ queryKey: ['report-entry-grid'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const inputColumns = (data?.columns ?? []).filter((c) => c.kind === 'INPUT');
  const calcColumns = (data?.columns ?? []).filter((c) => c.kind === 'CALC');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Nhập số liệu báo cáo"
        description="Nhập theo ngày hoặc nhập một lần cho cả kỳ — số liệu lưu kèm người nhập và lịch sử thay đổi"
        actions={
          <>
            {dirtyCount > 0 ? <Badge tone="warning">{dirtyCount} ô chưa lưu</Badge> : null}
            {dirtyCount > 0 ? (
              <Button variant="outline" onClick={() => setDraft({})}>
                <Undo2 /> Hoàn tác
              </Button>
            ) : null}
            {can('report.entry.update') ? (
              <Button
                disabled={dirtyCount === 0 || !!data?.locked}
                loading={save.isPending}
                onClick={() => save.mutate()}
                title={data?.locked ? 'Kỳ này đã được chốt và khoá' : undefined}
              >
                <Save /> Lưu số liệu
              </Button>
            ) : null}
          </>
        }
      />

      {data?.locked ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <div className="font-medium">Kỳ này đã được chốt và khoá số liệu</div>
            <div className="text-xs text-[var(--muted-foreground)]">
              {data.locked.title} — số liệu đã báo cáo nên không sửa được nữa. Cần điều chỉnh,
              đề nghị quản trị mở khoá bản chốt ở trang Báo cáo.
            </div>
          </div>
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-64 space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Mẫu báo cáo</label>
            <Select
              value={String(activeTemplateId ?? '')}
              onChange={(e) => {
                setTemplateId(Number(e.target.value));
                setDraft({});
              }}
            >
              {(templates?.items ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.departmentName}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Kỳ báo cáo</label>
            <Select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setDraft({});
              }}
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Ngày</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setDraft({});
              }}
              className="w-40"
            />
          </div>
          {period === 'range' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--muted-foreground)]">Đến ngày</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <CalendarDays className="size-3.5" />
            {data ? (
              <>
                Kỳ {data.period.label}: {data.period.from} → {data.period.to} ({data.days.length} ngày)
              </>
            ) : null}
          </div>
        </div>
      </Card>

      {isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Ô đã nhập"
              value={`${formatNumber(data.stats.filledCells)}/${formatNumber(data.stats.totalCells)}`}
              icon={<CheckCircle2 className="size-4" />}
              tone="success"
              hint={`${data.stats.entryCount} bản ghi trong kỳ`}
            />
            <StatCard label="Bản ghi số liệu" value={formatNumber(data.stats.entryCount)} tone="primary" />
            <StatCard
              label="Chế độ nhập"
              value={singleDay ? 'Theo ngày' : 'Theo kỳ'}
              hint={singleDay ? `Ngày ${entryDate}` : `Ghi vào ngày ${entryDate} (ngày kết thúc kỳ)`}
            />
          </div>

          {data.sections.length === 0 ? (
            <EmptyState title="Mẫu báo cáo chưa có dòng số liệu" description="Vào mục “Mẫu báo cáo” để thiết kế cấu trúc bảng." />
          ) : (
            <Card>
              <div className="border-b px-4 py-3">
                <div className="text-sm font-semibold">{data.template.title || data.template.name}</div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {data.template.departmentName} · {inputColumns.length} cột nhập liệu · {calcColumns.length} cột tự tính
                </div>
              </div>
              <TableWrap>
                <thead>
                  <tr>
                    <Th className="sticky left-0 z-10 bg-[var(--card)]">Chỉ tiêu</Th>
                    {data.columns.map((col) => (
                      <Th key={col.colKey} className="text-center">
                        <div className="text-[11px] font-normal text-[var(--muted-foreground)]">{col.groupLabel || '\u00A0'}</div>
                        <div>{col.label}</div>
                        {col.unit ? <div className="text-[10px] font-normal text-[var(--muted-foreground)]">{col.unit}</div> : null}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sections.map((section) => (
                    <Fragment key={`section-${section.id}`}>
                      <tr className="bg-[var(--muted)]/60">
                        <Td className="font-semibold uppercase" >
                          {section.title}
                        </Td>
                        <Td className="text-center text-[11px] text-[var(--muted-foreground)]" />
                        {data.columns.slice(1).map((col) => (
                          <Td key={col.colKey} />
                        ))}
                      </tr>
                      {[
                        ...(section.rows && section.rows.length
                          ? [{ id: null as number | null, label: '', note: '', rows: section.rows }]
                          : []),
                        ...section.blocks,
                      ].map((block, bi) => (
                        <Fragment key={`block-${section.id}-${bi}`}>
                          {block.label ? (
                            <tr>
                              <Td className="pl-6 font-medium italic">{block.label}</Td>
                              {data.columns.map((col) => (
                                <Td key={col.colKey} />
                              ))}
                            </tr>
                          ) : null}
                          {block.rows.map((row) => (
                            <Tr key={row.id} className={cn(row.isBold && 'font-semibold')}>
                              <Td className="sticky left-0 z-10 bg-[var(--card)] pl-6">
                                {row.rowLabel}
                                {row.unit ? <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">({row.unit})</span> : null}
                              </Td>
                              {data.columns.map((col) =>
                                col.kind === 'INPUT' ? (
                                  <Td key={col.colKey} className="p-1">
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      className="h-8 w-20 text-right tabular-nums"
                                      value={String(valueOf(row.id, col.colKey) || '')}
                                      onChange={(e) => {
                                        const raw = e.target.value.replace(/[^\d.-]/g, '');
                                        setDraft((s) => ({ ...s, [`${row.id}|${col.colKey}|${entryDate}`]: raw === '' ? 0 : Number(raw) }));
                                      }}
                                    />
                                  </Td>
                                ) : (
                                  <Td key={col.colKey} className="text-right tabular-nums text-[var(--muted-foreground)]">
                                    {calcValue(row.id, col) ? formatNumber(calcValue(row.id, col)) : ''}
                                  </Td>
                                ),
                              )}
                            </Tr>
                          ))}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                  <Tr className="bg-[var(--muted)]/60 font-semibold">
                    <Td className="sticky left-0 z-10 bg-[var(--card)]">Tổng cộng</Td>
                    {data.columns.map((col) =>
                      col.kind === 'INPUT' ? (
                        <Td key={col.colKey} className="text-right tabular-nums">
                          {formatNumber(totals[col.colKey] ?? 0)}
                        </Td>
                      ) : (
                        <Td key={col.colKey} className="text-right tabular-nums">
                          {formatNumber(
                            data.sections.reduce((sum, s) => {
                              let sectionSum = 0;
                              for (const b of [...(s.rows?.length ? [{ rows: s.rows }] : []), ...s.blocks]) {
                                for (const r of b.rows) {
                                  if (!isTotalRow(r)) sectionSum += evalFormula(col.formula, (key) => valueOf(r.id, key));
                                }
                              }
                              return sum + sectionSum;
                            }, 0),
                          )}
                        </Td>
                      ),
                    )}
                  </Tr>
                </tbody>
              </TableWrap>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-[var(--muted-foreground)]">
                <span>
                  Tổng cộng bên dưới chỉ tính các dòng không phải dòng tổng — dùng đối chiếu nhanh khi nhập.
                </span>
                <Link href="/bao-cao" className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline">
                  <FileSpreadsheet className="size-3.5" /> Xem báo cáo đã tổng hợp
                </Link>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
