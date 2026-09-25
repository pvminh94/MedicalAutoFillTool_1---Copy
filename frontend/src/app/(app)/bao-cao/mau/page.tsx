'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, FileText, Plus, Save, Sigma, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Switch, Textarea } from '@/components/ui/input';
import { TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { Paginated } from '@/types/api';

interface Column {
  id?: number;
  colKey: string;
  label: string;
  groupLabel: string;
  kind: 'INPUT' | 'CALC';
  formula: string;
  format: string;
  summaryKey?: string;
  unit: string;
  width: number;
  align: string;
  sortOrder: number;
  archived?: boolean;
}

interface Row {
  id?: number;
  rowLabel: string;
  groupLabel: string;
  agg: string;
  unit: string;
  isBold: boolean;
  isTotal: boolean;
  formula?: string;
  note: string;
  sortOrder: number;
  archived?: boolean;
}

interface Block {
  id?: number;
  label: string;
  note: string;
  sortOrder: number;
  rows: Row[];
}

interface Section {
  id?: number;
  code?: string;
  title: string;
  note: string;
  sortOrder: number;
  blocks: Block[];
  rows: Row[];
}

interface Template {
  id: number;
  code: string;
  name: string;
  title: string;
  subtitle: string;
  footerNote: string;
  departmentId: number;
  departmentName?: string;
  defaultPeriod: string;
  printTemplateId: number | null;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
  columns?: Column[];
  sections?: Section[];
  rowCount?: number;
  columnCount?: number;
}

interface DeptOption {
  id: number;
  name: string;
  level: number;
}

const emptyRow = (sortOrder: number): Row => ({
  rowLabel: '',
  groupLabel: '',
  agg: 'SUM',
  unit: '',
  isBold: false,
  isTotal: false,
  note: '',
  sortOrder,
});

const emptyBlock = (sortOrder: number): Block => ({ label: '', note: '', sortOrder, rows: [emptyRow(0)] });

const emptySection = (sortOrder: number): Section => ({
  title: '',
  note: '',
  sortOrder,
  blocks: [emptyBlock(0)],
  rows: [],
});

const emptyColumn = (sortOrder: number): Column => ({
  colKey: '',
  label: '',
  groupLabel: '',
  kind: 'INPUT',
  formula: '',
  format: 'number',
  unit: '',
  width: 90,
  align: 'right',
  sortOrder,
});

/** Thiết kế mẫu báo cáo: cột nhập liệu / cột công thức, nhóm dòng, dòng tổng, đơn vị tính. */
export default function ReportTemplatesPage() {
  const can = useAuth((s) => s.can);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [columns, setColumns] = useState<Column[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [duplicating, setDuplicating] = useState<Template | null>(null);
  const [newCode, setNewCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [formulaCheck, setFormulaCheck] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['report-templates'],
    queryFn: () => apiFetch<Paginated<Template>>('/reports/templates?pageSize=100'),
  });

  const { data: departments } = useQuery({
    queryKey: ['departments-options'],
    queryFn: () => apiFetch<DeptOption[]>('/departments/options?onlyReportable=true'),
  });

  const openEdit = async (row: Template): Promise<void> => {
    try {
      const detail = await apiFetch<Template>(`/reports/templates/${row.id}`);
      setEditing(detail);
      setMeta({ ...detail });
      setColumns(detail.columns ?? []);
      setSections(detail.sections ?? []);
      setCreating(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const openNew = (): void => {
    const blank: Template = {
      id: 0,
      code: '',
      name: '',
      title: '',
      subtitle: '',
      footerNote: '',
      departmentId: departments?.[0]?.id ?? 0,
      defaultPeriod: 'week',
      printTemplateId: null,
      isDefault: false,
      active: true,
      sortOrder: 0,
    };
    setEditing(blank);
    setMeta({ ...blank });
    setColumns([
      { ...emptyColumn(0), colKey: 'hs', label: 'HS', groupLabel: 'Tổng số', kind: 'INPUT' },
      { ...emptyColumn(1), colKey: 'tq', label: 'TQ', groupLabel: 'Tổng số', kind: 'INPUT' },
      { ...emptyColumn(2), colKey: 'te', label: 'TE', groupLabel: 'Tổng số', kind: 'INPUT' },
      { ...emptyColumn(3), colKey: 'tong', label: 'Tổng', groupLabel: 'Tổng số', kind: 'CALC', formula: 'hs+tq+te' },
    ]);
    setSections([{ ...emptySection(0), title: 'A. Công tác khám chữa bệnh' }]);
    setCreating(true);
  };

  const saveMeta = useMutation({
    mutationFn: async () => {
      const payload = { ...meta };
      delete (payload as Record<string, unknown>).departmentName;
      delete (payload as Record<string, unknown>).rowCount;
      delete (payload as Record<string, unknown>).columnCount;
      delete (payload as Record<string, unknown>).columns;
      delete (payload as Record<string, unknown>).sections;
      if (creating) {
        return apiFetch<Template>('/reports/templates', {
          method: 'POST',
          body: { ...payload, columns, sections },
        });
      }
      await apiFetch(`/reports/templates/${editing?.id}`, { method: 'PUT', body: payload });
      await apiFetch(`/reports/templates/${editing?.id}/structure`, { method: 'PUT', body: { columns, sections } });
      return { id: editing?.id } as Template;
    },
    onSuccess: async (result) => {
      toast.success('Đã lưu mẫu báo cáo');
      await queryClient.invalidateQueries({ queryKey: ['report-templates'] });
      if (result?.id) await openEdit({ id: result.id } as Template);
      setCreating(false);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/reports/templates/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Đã xoá mẫu báo cáo');
      setDeleting(null);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['report-templates'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const duplicate = useMutation({
    mutationFn: (payload: { id: number; code: string }) =>
      apiFetch(`/reports/templates/${payload.id}/duplicate`, { method: 'POST', body: { code: payload.code } }),
    onSuccess: async () => {
      toast.success('Đã nhân bản mẫu báo cáo');
      setDuplicating(null);
      setNewCode('');
      await queryClient.invalidateQueries({ queryKey: ['report-templates'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const checkFormula = async (): Promise<void> => {
    const calcCol = columns.find((c) => c.kind === 'CALC' && c.formula);
    if (!calcCol) {
      setFormulaCheck('Chưa có cột công thức nào để kiểm tra');
      return;
    }
    try {
      const result = await apiFetch<{ valid: boolean; message?: string; value?: number }>('/reports/templates/validate-formula', {
        method: 'POST',
        body: { formula: calcCol.formula, colKeys: columns.map((c) => c.colKey), sample: Object.fromEntries(columns.map((c) => [c.colKey, 3])) },
      });
      setFormulaCheck(result.valid ? `Công thức “${calcCol.formula}” hợp lệ${typeof result.value === 'number' ? ` (mẫu = ${result.value})` : ''}` : `Lỗi: ${result.message ?? 'không hợp lệ'}`);
    } catch (err) {
      setFormulaCheck((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mẫu báo cáo"
        description="Mỗi khoa có thể có mẫu riêng: cột nhập liệu, cột công thức tự tính, nhóm chỉ tiêu và dòng tổng"
        actions={
          can('report.template.create') ? (
            <Button onClick={openNew}>
              <Plus /> Thêm mẫu báo cáo
            </Button>
          ) : null
        }
      />

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <EmptyState title="Chưa có mẫu báo cáo nào" description="Tạo mẫu đầu tiên, sau đó gán cho khoa tương ứng." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Mẫu báo cáo</Th>
                <Th>Khoa</Th>
                <Th>Kỳ mặc định</Th>
                <Th>Cấu trúc</Th>
                <Th>Trạng thái</Th>
                <Th className="text-right">Thao tác</Th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-[var(--muted-foreground)]" />
                      <div>
                        <div className="font-medium">{row.name}</div>
                        <div className="font-mono text-[10px] text-[var(--muted-foreground)]">{row.code}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-sm">{row.departmentName ?? '—'}</Td>
                  <Td className="text-xs">{row.defaultPeriod}</Td>
                  <Td className="text-xs text-[var(--muted-foreground)]">
                    {row.columnCount ?? '—'} cột · {row.rowCount ?? '—'} dòng
                  </Td>
                  <Td>{row.active ? <Badge tone="success">Đang dùng</Badge> : <Badge tone="muted">Ngừng</Badge>}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {can('report.template.update') ? (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                          Thiết kế
                        </Button>
                      ) : null}
                      {can('report.template.create') ? (
                        <Button variant="ghost" size="icon" title="Nhân bản" onClick={() => setDuplicating(row)}>
                          <Copy />
                        </Button>
                      ) : null}
                      {can('report.template.delete') ? (
                        <Button variant="ghost" size="icon" className="text-[var(--danger)]" title="Xoá" onClick={() => setDeleting(row)}>
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        size="full"
        title={creating ? 'Thêm mẫu báo cáo' : `Thiết kế: ${String(meta.name ?? '')}`}
        description="Cột CALC dùng công thức trên khoá cột, ví dụ: hs+tq+te"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Đóng
            </Button>
            <Button variant="outline" onClick={checkFormula}>
              <Sigma /> Kiểm tra công thức
            </Button>
            <Button loading={saveMeta.isPending} onClick={() => saveMeta.mutate()}>
              <Save /> Lưu mẫu báo cáo
            </Button>
          </>
        }
      >
        {formulaCheck ? <div className="mb-3 rounded-lg border bg-[var(--muted)]/50 px-3 py-2 text-xs">{formulaCheck}</div> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Mã mẫu *</Label>
            <Input value={String(meta.code ?? '')} disabled={!creating} onChange={(e) => setMeta((s) => ({ ...s, code: e.target.value.toUpperCase() }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Tên mẫu *</Label>
            <Input value={String(meta.name ?? '')} onChange={(e) => setMeta((s) => ({ ...s, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Khoa *</Label>
            <Select value={String(meta.departmentId ?? '')} onChange={(e) => setMeta((s) => ({ ...s, departmentId: Number(e.target.value) }))}>
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
            <Label>Tiêu đề in trên báo cáo</Label>
            <Input value={String(meta.title ?? '')} onChange={(e) => setMeta((s) => ({ ...s, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Phụ đề</Label>
            <Input value={String(meta.subtitle ?? '')} onChange={(e) => setMeta((s) => ({ ...s, subtitle: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Kỳ mặc định</Label>
            <Select value={String(meta.defaultPeriod ?? 'week')} onChange={(e) => setMeta((s) => ({ ...s, defaultPeriod: e.target.value }))}>
              {['day', 'week', 'month', 'quarter', 'year'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label>Ghi chú chân báo cáo</Label>
            <Textarea rows={2} value={String(meta.footerNote ?? '')} onChange={(e) => setMeta((s) => ({ ...s, footerNote: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={Boolean(meta.active)} onCheckedChange={(v) => setMeta((s) => ({ ...s, active: v }))} />
            Đang sử dụng
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={Boolean(meta.isDefault)} onCheckedChange={(v) => setMeta((s) => ({ ...s, isDefault: v }))} />
            Là mẫu mặc định của khoa
          </label>
        </div>

        {/* Cột */}
        <div className="mt-5 space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Cột báo cáo ({columns.length})</div>
            <Button variant="outline" size="sm" onClick={() => setColumns((s) => [...s, emptyColumn(s.length)])}>
              <Plus /> Thêm cột
            </Button>
          </div>
          <TableWrap>
            <thead>
              <tr>
                <Th>Khoá</Th>
                <Th>Tên cột</Th>
                <Th>Nhóm</Th>
                <Th>Loại</Th>
                <Th>Công thức</Th>
                <Th>Chỉ tiêu tổng hợp</Th>
                <Th>ĐVT</Th>
                <Th>Rộng</Th>
                <Th className="text-right">Thao tác</Th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col, index) => (
                <Tr key={index}>
                  <Td className="p-1">
                    <Input className="h-8 w-20" value={col.colKey} onChange={(e) => setColumns((s) => s.map((c, i) => (i === index ? { ...c, colKey: e.target.value } : c)))} />
                  </Td>
                  <Td className="p-1">
                    <Input className="h-8 w-24" value={col.label} onChange={(e) => setColumns((s) => s.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)))} />
                  </Td>
                  <Td className="p-1">
                    <Input className="h-8 w-28" value={col.groupLabel ?? ''} onChange={(e) => setColumns((s) => s.map((c, i) => (i === index ? { ...c, groupLabel: e.target.value } : c)))} />
                  </Td>
                  <Td className="p-1">
                    <Select className="h-8 w-24" value={col.kind} onChange={(e) => setColumns((s) => s.map((c, i) => (i === index ? { ...c, kind: e.target.value as Column['kind'] } : c)))}>
                      <option value="INPUT">Nhập</option>
                      <option value="CALC">Tính</option>
                    </Select>
                  </Td>
                  <Td className="p-1">
                    <Input
                      className="h-8 w-28 font-mono text-xs"
                      disabled={col.kind !== 'CALC'}
                      value={col.formula ?? ''}
                      onChange={(e) => setColumns((s) => s.map((c, i) => (i === index ? { ...c, formula: e.target.value } : c)))}
                      placeholder="hs+tq+te"
                    />
                  </Td>
                  <Td className="p-1">
                    <Select className="h-8 w-24" value={col.summaryKey ?? ''} onChange={(e) => setColumns((s) => s.map((c, i) => (i === index ? { ...c, summaryKey: e.target.value } : c)))}>
                      <option value="">—</option>
                      <option value="kham">Khám bệnh</option>
                      <option value="vao">Vào viện</option>
                      <option value="ra">Ra viện</option>
                      <option value="tu_vong">Tử vong</option>
                      <option value="hien_con">Hiện còn</option>
                    </Select>
                  </Td>
                  <Td className="p-1">
                    <Input className="h-8 w-16" value={col.unit ?? ''} onChange={(e) => setColumns((s) => s.map((c, i) => (i === index ? { ...c, unit: e.target.value } : c)))} />
                  </Td>
                  <Td className="p-1">
                    <Input type="number" className="h-8 w-16" value={col.width ?? 90} onChange={(e) => setColumns((s) => s.map((c, i) => (i === index ? { ...c, width: Number(e.target.value) } : c)))} />
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => setColumns((s) => { const n = [...s]; [n[index - 1], n[index]] = [n[index], n[index - 1]]; return n; })}>
                      <ArrowUp />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={index === columns.length - 1} onClick={() => setColumns((s) => { const n = [...s]; [n[index + 1], n[index]] = [n[index], n[index + 1]]; return n; })}>
                      <ArrowDown />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-[var(--danger)]" onClick={() => setColumns((s) => s.filter((_, i) => i !== index))}>
                      <Trash2 />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </div>

        {/* Phần & dòng */}
        <div className="mt-5 space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Phần & chỉ tiêu ({sections.length} phần)</div>
            <Button variant="outline" size="sm" onClick={() => setSections((s) => [...s, emptySection(s.length)])}>
              <Plus /> Thêm phần
            </Button>
          </div>

          {sections.map((section, si) => (
            <div key={si} className="space-y-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input className="h-8 max-w-xs" value={section.title} placeholder="A. Công tác khám chữa bệnh" onChange={(e) => setSections((s) => s.map((x, i) => (i === si ? { ...x, title: e.target.value } : x)))} />
                <Input className="h-8 max-w-xs" value={section.note ?? ''} placeholder="Ghi chú" onChange={(e) => setSections((s) => s.map((x, i) => (i === si ? { ...x, note: e.target.value } : x)))} />
                <Button variant="outline" size="sm" onClick={() => setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: [...x.blocks, emptyBlock(x.blocks.length)] } : x)))}>
                  <Plus /> Nhóm dòng
                </Button>
                <Button variant="ghost" size="sm" className="ml-auto text-[var(--danger)]" onClick={() => setSections((s) => s.filter((_, i) => i !== si))}>
                  <Trash2 /> Xoá phần
                </Button>
              </div>

              {section.blocks.map((block, bi) => (
                <div key={bi} className="rounded-lg bg-[var(--muted)]/40 p-2">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Input
                      className="h-8 max-w-xs"
                      value={block.label}
                      placeholder="Nhóm dòng (có thể để trống)"
                      onChange={(e) =>
                        setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: x.blocks.map((b, j) => (j === bi ? { ...b, label: e.target.value } : b)) } : x)))
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: x.blocks.map((b, j) => (j === bi ? { ...b, rows: [...b.rows, emptyRow(b.rows.length)] } : b)) } : x)))
                      }
                    >
                      <Plus /> Thêm dòng
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-[var(--danger)]"
                      onClick={() =>
                        setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: x.blocks.filter((_, j) => j !== bi) } : x)))
                      }
                    >
                      <Trash2 /> Xoá nhóm
                    </Button>
                  </div>

                  <TableWrap>
                    <thead>
                      <tr>
                        <Th>Tên chỉ tiêu</Th>
                        <Th>Cách gộp</Th>
                        <Th>ĐVT</Th>
                        <Th>In đậm</Th>
                        <Th>Dòng tổng</Th>
                        <Th>Ghi chú</Th>
                        <Th className="text-right">Thao tác</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, ri) => (
                        <Tr key={ri} className={cn(row.isBold && 'font-semibold')}>
                          <Td className="p-1">
                            <Input className="h-8" value={row.rowLabel} onChange={(e) => setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: x.blocks.map((b, j) => (j === bi ? { ...b, rows: b.rows.map((r, k) => (k === ri ? { ...r, rowLabel: e.target.value } : r)) } : b)) } : x)))} />
                          </Td>
                          <Td className="p-1">
                            <Select className="h-8 w-24" value={row.agg} onChange={(e) => setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: x.blocks.map((b, j) => (j === bi ? { ...b, rows: b.rows.map((r, k) => (k === ri ? { ...r, agg: e.target.value } : r)) } : b)) } : x)))}>
                              {['SUM', 'FIRST', 'LAST', 'AVG', 'MIN', 'MAX'].map((a) => (
                                <option key={a} value={a}>
                                  {a}
                                </option>
                              ))}
                            </Select>
                          </Td>
                          <Td className="p-1">
                            <Input className="h-8 w-20" value={row.unit} onChange={(e) => setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: x.blocks.map((b, j) => (j === bi ? { ...b, rows: b.rows.map((r, k) => (k === ri ? { ...r, unit: e.target.value } : r)) } : b)) } : x)))} />
                          </Td>
                          <Td className="p-1 text-center">
                            <input type="checkbox" checked={row.isBold} onChange={(e) => setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: x.blocks.map((b, j) => (j === bi ? { ...b, rows: b.rows.map((r, k) => (k === ri ? { ...r, isBold: e.target.checked } : r)) } : b)) } : x)))} />
                          </Td>
                          <Td className="p-1 text-center">
                            <input type="checkbox" checked={row.isTotal} onChange={(e) => setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: x.blocks.map((b, j) => (j === bi ? { ...b, rows: b.rows.map((r, k) => (k === ri ? { ...r, isTotal: e.target.checked } : r)) } : b)) } : x)))} />
                          </Td>
                          <Td className="p-1">
                            <Input className="h-8" value={row.note} onChange={(e) => setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: x.blocks.map((b, j) => (j === bi ? { ...b, rows: b.rows.map((r, k) => (k === ri ? { ...r, note: e.target.value } : r)) } : b)) } : x)))} />
                          </Td>
                          <Td className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-[var(--danger)]"
                              onClick={() =>
                                setSections((s) => s.map((x, i) => (i === si ? { ...x, blocks: x.blocks.map((b, j) => (j === bi ? { ...b, rows: b.rows.filter((_, k) => k !== ri) } : b)) } : x)))
                              }
                            >
                              <Trash2 />
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={!!duplicating}
        onClose={() => setDuplicating(null)}
        size="sm"
        title={`Nhân bản: ${duplicating?.name ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setDuplicating(null)}>
              Huỷ
            </Button>
            <Button disabled={!newCode.trim()} loading={duplicate.isPending} onClick={() => duplicating && duplicate.mutate({ id: duplicating.id, code: newCode.trim().toUpperCase() })}>
              Nhân bản
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label>Mã mẫu mới *</Label>
          <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="BAO_CAO_TUAN_2" />
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title="Xoá mẫu báo cáo"
        message={<>Xoá mẫu <b>{deleting?.name}</b>? Số liệu đã nhập của mẫu cũng sẽ bị ẩn theo.</>}
        confirmText="Xoá"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
