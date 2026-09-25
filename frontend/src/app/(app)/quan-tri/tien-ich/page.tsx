'use client';

import { Blocks, ExternalLink, Route, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { CrudTable, type CrudField } from '@/components/shared/crud-table';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface DeptOption {
  id: number;
  name: string;
  level: number;
}

/**
 * Tiện ích mở rộng: cho phép gắn thêm chức năng mới (biểu mẫu, báo cáo, liên kết,
 * nhúng trang ngoài) mà không cần sửa mã nguồn — menu sẽ tự hiện theo quyền.
 */
export default function UtilitiesPage() {
  const can = useAuth((s) => s.can);
  const { data: departments } = useQuery({
    queryKey: ['departments-options'],
    queryFn: () => apiFetch<DeptOption[]>('/departments/options'),
  });

  const fields: CrudField[] = [
    { name: 'code', label: 'Mã tiện ích', required: true, createOnly: true, placeholder: 'TRA_CUU_ICD' },
    { name: 'name', label: 'Tên hiển thị', required: true, placeholder: 'Tra cứu mã bệnh ICD-10' },
    {
      name: 'kind',
      label: 'Loại',
      type: 'select',
      defaultValue: 'LINK',
      options: [
        { value: 'BUILTIN', label: 'Chức năng có sẵn trong hệ thống' },
        { value: 'FORM', label: 'Biểu mẫu nhập liệu' },
        { value: 'REPORT', label: 'Báo cáo' },
        { value: 'LINK', label: 'Liên kết ngoài' },
        { value: 'IFRAME', label: 'Nhúng trang ngoài' },
      ],
      help: 'Loại BUILTIN không xóa được vì gắn với chức năng hệ thống',
    },
    { name: 'route', label: 'Đường dẫn', help: 'Ví dụ /cong-cu/tra-cuu-icd hoặc https://…', span: 2 },
    { name: 'icon', label: 'Biểu tượng (lucide)', placeholder: 'Stethoscope' },
    { name: 'permissionCode', label: 'Quyền yêu cầu', help: 'Để trống = mọi người dùng đã đăng nhập đều thấy' },
    {
      name: 'placement',
      label: 'Vị trí hiển thị',
      type: 'select',
      defaultValue: 'sidebar',
      options: [
        { value: 'sidebar', label: 'Menu dọc' },
        { value: 'dashboard', label: 'Trang chủ' },
        { value: 'both', label: 'Cả hai' },
      ],
    },
    { name: 'badge', label: 'Nhãn nhỏ', placeholder: 'Mới' },
    { name: 'openInNewTab', label: 'Mở tab mới', type: 'switch', defaultValue: false },
    { name: 'sortOrder', label: 'Thứ tự', type: 'number', defaultValue: 0 },
    { name: 'active', label: 'Đang bật', type: 'switch', defaultValue: true },
    {
      name: 'departmentIds',
      label: 'Giới hạn theo khoa',
      type: 'select',
      hideInTable: true,
      options: (departments ?? []).map((d) => ({ value: d.id, label: d.name })),
      help: 'Bỏ trống = hiện cho mọi khoa',
    },
    { name: 'description', label: 'Mô tả', type: 'textarea' },
  ];

  return (
    <>
      <PageHeader
        title="Tiện ích mở rộng"
        description="Khai báo chức năng mới dạng cấu hình — menu tự cập nhật theo quyền của người dùng"
      />
      <CrudTable
        title="Danh mục tiện ích"
        endpoint="/utilities"
        fields={fields}
        createLabel="Thêm tiện ích"
        searchPlaceholder="Tìm theo mã, tên tiện ích…"
        canCreate={can('utility.create')}
        canEdit={can('utility.update')}
        canDelete={can('utility.delete')}
        columns={[
          {
            key: 'name',
            label: 'Tiện ích',
            render: (row) => (
              <div className="flex items-center gap-2">
                <Blocks className="size-4 text-[var(--muted-foreground)]" />
                <div>
                  <div className="font-medium">{String(row.name)}</div>
                  <div className="font-mono text-[10px] text-[var(--muted-foreground)]">{String(row.code)}</div>
                </div>
              </div>
            ),
          },
          {
            key: 'kind',
            label: 'Loại',
            render: (row) => <Badge tone="info">{String(row.kind ?? 'LINK')}</Badge>,
          },
          {
            key: 'route',
            label: 'Đường dẫn',
            render: (row) =>
              row.route ? (
                <span className="inline-flex items-center gap-1 font-mono text-xs">
                  <Route className="size-3" /> {String(row.route)}
                </span>
              ) : (
                '—'
              ),
          },
          { key: 'permissionCode', label: 'Quyền', render: (row) => (row.permissionCode ? <Badge tone="muted">{String(row.permissionCode)}</Badge> : <span className="text-[var(--muted-foreground)]">Mọi người</span>) },
          {
            key: 'placement',
            label: 'Vị trí',
            render: (row) =>
              row.placement === 'both' ? 'Menu + Trang chủ' : row.placement === 'dashboard' ? 'Trang chủ' : 'Menu dọc',
          },
          {
            key: 'openInNewTab',
            label: 'Tab mới',
            render: (row) => (row.openInNewTab ? <ExternalLink className="size-3.5" /> : '—'),
          },
          { key: 'active', label: 'Trạng thái' },
        ]}
        toolbar={
          <Badge tone="success">
            <Sparkles className="mr-1 size-3" /> Thêm chức năng không cần lập trình
          </Badge>
        }
      />
    </>
  );
}
