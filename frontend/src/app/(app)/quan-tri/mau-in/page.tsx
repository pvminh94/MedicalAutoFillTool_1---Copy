'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, FileCode2, History, Plus, Printer, Trash2, Upload } from 'lucide-react';
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
import { formatDateTime } from '@/lib/utils';
import type { Paginated } from '@/types/api';

interface PrintTemplateRow {
  id: number;
  code: string;
  name: string;
  description: string;
  module: string;
  docType: string;
  paperSize: string;
  orientation: string;
  version: number;
  active: boolean;
  departmentId: number | null;
  departmentName?: string | null;
  updatedAt: string;
  updatedByName?: string | null;
}

interface PrintTemplateDetail extends PrintTemplateRow {
  document: Record<string, unknown>;
  pageMargins?: Record<string, number>;
}

const PAPER_SIZES = ['A4', 'A5', 'A3', 'Letter', 'Legal', 'Custom'];
const MODULES = ['HSBA', 'REPORT', 'UTILITY', 'GENERIC'];

const DEFAULT_DOCUMENT = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 15, right: 20, bottom: 15, left: 25 },
  elements: [
    {
      id: 'el-1',
      type: 'text',
      x: 25,
      y: 15,
      width: 160,
      text: '{hospital.name}',
      style: { fontSize: 12, align: 'center', bold: true },
    },
    {
      id: 'el-2',
      type: 'text',
      x: 25,
      y: 25,
      width: 160,
      text: 'MẪU IN MỚI',
      style: { fontSize: 16, align: 'center', bold: true, textTransform: 'uppercase' },
    },
  ],
};

/**
 * Quản lý mẫu in: tạo, sửa thiết kế (JSON), xem trước PDF, ban hành và khôi phục phiên bản.
 * Trình thiết kế trực quan nằm ở trang riêng (/quan-tri/mau-in/thiet-ke/[id]).
 */
export default function PrintTemplatesPage() {
  const can = useAuth((s) => s.can);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PrintTemplateDetail | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [docText, setDocText] = useState(JSON.stringify(DEFAULT_DOCUMENT, null, 2));
  const [deleting, setDeleting] = useState<PrintTemplateRow | null>(null);
  const [duplicating, setDuplicating] = useState<PrintTemplateRow | null>(null);
  const [newCode, setNewCode] = useState('');
  const [versionsOf, setVersionsOf] = useState<PrintTemplateRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['print-templates'],
    queryFn: () => apiFetch<Paginated<PrintTemplateRow>>('/print/templates?pageSize=50'),
  });

  const versions = useQuery({
    queryKey: ['print-template-versions', versionsOf?.id],
    enabled: !!versionsOf,
    queryFn: () => apiFetch<{ version: number; note: string; createdAt: string; createdByName?: string }[]>(`/print/templates/${versionsOf?.id}/versions`),
  });

  const openNew = (): void => {
    setEditing('new');
    setForm({ code: '', name: '', description: '', module: 'HSBA', docType: 'PHIEU_GENERIC', paperSize: 'A4', orientation: 'portrait', active: true });
    setDocText(JSON.stringify(DEFAULT_DOCUMENT, null, 2));
  };

  const openEdit = async (row: PrintTemplateRow): Promise<void> => {
    try {
      const detail = await apiFetch<PrintTemplateDetail>(`/print/templates/${row.id}`);
      setEditing(detail);
      setForm({ ...detail });
      setDocText(JSON.stringify(detail.document, null, 2));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const parseDoc = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(docText) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') throw new Error('Thiết kế phải là một đối tượng JSON');
      return parsed;
    } catch (err) {
      toast.error(`JSON không hợp lệ: ${(err as Error).message}`);
      return null;
    }
  };

  const preview = async (): Promise<void> => {
    const document = parseDoc();
    if (!document) return;
    try {
      const response = await apiFetch<Response>('/print/preview', {
        method: 'POST',
        body: { document, data: {}, rows: [] },
        raw: true,
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const document = parseDoc();
      if (!document) throw new Error('JSON không hợp lệ');
      const payload = { ...form, document };
      delete (payload as Record<string, unknown>).departmentName;
      delete (payload as Record<string, unknown>).updatedByName;
      if (editing && editing !== 'new') {
        return apiFetch(`/print/templates/${(editing as PrintTemplateDetail).id}`, { method: 'PUT', body: payload });
      }
      return apiFetch('/print/templates', { method: 'POST', body: payload });
    },
    onSuccess: async () => {
      toast.success('Đã lưu mẫu in');
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['print-templates'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const publish = useMutation({
    mutationFn: (payload: { id: number; active: boolean }) =>
      apiFetch(`/print/templates/${payload.id}/publish`, { method: 'PATCH', body: { active: payload.active } }),
    onSuccess: async () => {
      toast.success('Đã cập nhật trạng thái ban hành');
      await queryClient.invalidateQueries({ queryKey: ['print-templates'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/print/templates/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Đã xoá mẫu in');
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ['print-templates'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const duplicate = useMutation({
    mutationFn: (payload: { id: number; code: string }) =>
      apiFetch(`/print/templates/${payload.id}/duplicate`, { method: 'POST', body: { code: payload.code } }),
    onSuccess: async () => {
      toast.success('Đã sao chép mẫu in');
      setDuplicating(null);
      setNewCode('');
      await queryClient.invalidateQueries({ queryKey: ['print-templates'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const restore = useMutation({
    mutationFn: (payload: { id: number; version: number }) =>
      apiFetch(`/print/templates/${payload.id}/restore/${payload.version}`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Đã khôi phục phiên bản thiết kế');
      setVersionsOf(null);
      await queryClient.invalidateQueries({ queryKey: ['print-templates'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Thiết kế bản in"
        description="Khung in chuyên nghiệp theo toạ độ mm: văn bản, bảng biểu, đường kẻ, hình ảnh, mã QR, chữ ký số…"
        actions={
          can('print.template.create') ? (
            <Button onClick={openNew}>
              <Plus /> Thêm mẫu in
            </Button>
          ) : null
        }
      />

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <EmptyState title="Chưa có mẫu in nào" description="Tạo mẫu in đầu tiên để dùng cho phiếu sửa HSBA và báo cáo." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Mẫu in</Th>
                <Th>Loại chứng từ</Th>
                <Th>Khổ giấy</Th>
                <Th>Phiên bản</Th>
                <Th>Cập nhật</Th>
                <Th>Trạng thái</Th>
                <Th className="text-right">Thao tác</Th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Printer className="size-4 text-[var(--muted-foreground)]" />
                      <div>
                        <div className="font-medium">{row.name}</div>
                        <div className="font-mono text-[10px] text-[var(--muted-foreground)]">{row.code}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone="info">{row.module}</Badge>
                    <div className="mt-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">{row.docType}</div>
                  </Td>
                  <Td className="text-xs">
                    {row.paperSize} · {row.orientation === 'landscape' ? 'ngang' : 'dọc'}
                  </Td>
                  <Td className="text-xs tabular-nums">v{row.version}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    <div>{formatDateTime(row.updatedAt)}</div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">{row.updatedByName ?? ''}</div>
                  </Td>
                  <Td>{row.active ? <Badge tone="success">Đang dùng</Badge> : <Badge tone="muted">Ngừng</Badge>}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {can('print.template.update') ? (
                        <Button variant="ghost" size="icon" title="Sửa thiết kế" onClick={() => openEdit(row)}>
                          <FileCode2 />
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="icon" title="Lịch sử phiên bản" onClick={() => setVersionsOf(row)}>
                        <History />
                      </Button>
                      {can('print.template.create') ? (
                        <Button variant="ghost" size="icon" title="Sao chép" onClick={() => setDuplicating(row)}>
                          <Copy />
                        </Button>
                      ) : null}
                      {can('print.template.publish') ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={row.active ? 'Ngừng sử dụng' : 'Ban hành'}
                          onClick={() => publish.mutate({ id: row.id, active: !row.active })}
                        >
                          <Upload />
                        </Button>
                      ) : null}
                      {can('print.template.delete') ? (
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

      {/* Trình sửa thiết kế */}
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        size="xl"
        title={editing === 'new' ? 'Thêm mẫu in' : `Thiết kế: ${String(form.name ?? '')}`}
        description="Thiết kế lưu dưới dạng JSON theo toạ độ mm; bấm “Xem trước PDF” để kiểm tra kết quả thật"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Huỷ
            </Button>
            <Button variant="outline" onClick={preview}>
              <Eye /> Xem trước PDF
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Lưu thiết kế
            </Button>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-code">Mã mẫu *</Label>
              <Input
                id="t-code"
                value={String(form.code ?? '')}
                disabled={editing !== 'new'}
                onChange={(e) => setForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))}
                placeholder="PHIEU_SUA_HSBA"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Tên mẫu *</Label>
              <Input id="t-name" value={String(form.name ?? '')} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-module">Phân hệ</Label>
                <Select id="t-module" value={String(form.module ?? 'HSBA')} onChange={(e) => setForm((s) => ({ ...s, module: e.target.value }))}>
                  {MODULES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-doc">Loại chứng từ</Label>
                <Input id="t-doc" value={String(form.docType ?? '')} onChange={(e) => setForm((s) => ({ ...s, docType: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-paper">Khổ giấy</Label>
                <Select id="t-paper" value={String(form.paperSize ?? 'A4')} onChange={(e) => setForm((s) => ({ ...s, paperSize: e.target.value }))}>
                  {PAPER_SIZES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-orient">Hướng giấy</Label>
                <Select id="t-orient" value={String(form.orientation ?? 'portrait')} onChange={(e) => setForm((s) => ({ ...s, orientation: e.target.value }))}>
                  <option value="portrait">Dọc</option>
                  <option value="landscape">Ngang</option>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={Boolean(form.active)} onCheckedChange={(v) => setForm((s) => ({ ...s, active: v }))} />
              Ban hành để dùng chính thức
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="t-desc">Mô tả</Label>
              <Textarea id="t-desc" rows={2} value={String(form.description ?? '')} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-json">Thiết kế (JSON)</Label>
            <Textarea
              id="t-json"
              className="min-h-[440px] font-mono text-xs leading-relaxed"
              value={docText}
              onChange={(e) => setDocText(e.target.value)}
              spellCheck={false}
            />
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Toạ độ tính bằng milimét, gốc ở góc trên bên trái. Dùng <code>{'{đường.dẫn}'}</code> để chèn dữ liệu,{' '}
              <code>{'{system.pages}'}</code> cho tổng số trang, và <code>visibleWhen</code> để ẩn/hiện theo điều kiện.
            </p>
          </div>
        </div>
      </Dialog>

      {/* Lịch sử phiên bản */}
      <Dialog
        open={!!versionsOf}
        onClose={() => setVersionsOf(null)}
        title={`Phiên bản thiết kế: ${versionsOf?.name ?? ''}`}
        size="md"
      >
        <div className="space-y-2">
          {(versions.data ?? []).length === 0 ? (
            <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">Chưa có phiên bản nào được lưu</div>
          ) : (
            versions.data?.map((v) => (
              <div key={v.version} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">Phiên bản {v.version}</div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {formatDateTime(v.createdAt)} · {v.createdByName ?? ''} {v.note ? `· ${v.note}` : ''}
                  </div>
                </div>
                {can('print.template.update') ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={restore.isPending}
                    onClick={() => versionsOf && restore.mutate({ id: versionsOf.id, version: v.version })}
                  >
                    Khôi phục
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Dialog>

      <Dialog
        open={!!duplicating}
        onClose={() => setDuplicating(null)}
        size="sm"
        title={`Sao chép mẫu in: ${duplicating?.name ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setDuplicating(null)}>
              Huỷ
            </Button>
            <Button disabled={!newCode.trim()} loading={duplicate.isPending} onClick={() => duplicating && duplicate.mutate({ id: duplicating.id, code: newCode.trim().toUpperCase() })}>
              Sao chép
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="dup-tpl">Mã mẫu mới *</Label>
          <Input id="dup-tpl" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="PHIEU_SUA_HSBA_2" />
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title="Xoá mẫu in"
        message={<>Xoá mẫu in <b>{deleting?.name}</b>? Các phiếu đã in trước đó không bị ảnh hưởng.</>}
        confirmText="Xoá"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
