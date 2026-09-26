"use client";

import { CrudTable, type CrudField } from "@/components/shared/crud-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

/**
 * Danh mục chức danh (Bác sĩ, Điều dưỡng, Kế toán…) — dùng cho ô chọn "Chức danh" của
 * người dùng và khi nhập danh sách nhân viên. Đổi tên chức danh sẽ cập nhật cho mọi
 * người dùng đang mang tên cũ.
 */
export default function JobTitlesPage() {
  const can = useAuth((s) => s.can);

  const fields: CrudField[] = [
    {
      name: "code",
      label: "Mã",
      required: true,
      placeholder: "BS",
      help: "Viết liền, không dấu — tự chuyển chữ hoa",
    },
    {
      name: "name",
      label: "Tên chức danh",
      required: true,
      placeholder: "Bác sĩ",
    },
    {
      name: "sortOrder",
      label: "Thứ tự",
      type: "number",
      hideInTable: true,
      help: "Bỏ trống → xếp cuối danh sách",
    },
    {
      name: "active",
      label: "Đang sử dụng",
      type: "switch",
      defaultValue: true,
      help: "Tắt để ẩn khỏi ô chọn (không ảnh hưởng người đang mang chức danh này)",
    },
    {
      name: "note",
      label: "Ghi chú",
      type: "textarea",
      hideInTable: true,
      placeholder: "Không bắt buộc",
    },
  ];

  return (
    <>
      <PageHeader
        title="Chức danh"
        description="Danh mục chức danh dùng khi khai báo người dùng và nhập danh sách nhân viên"
      />
      <CrudTable
        title="Danh sách chức danh"
        endpoint="/job-titles"
        fields={fields}
        createLabel="Thêm chức danh"
        searchPlaceholder="Tìm theo mã, tên chức danh…"
        canCreate={can("job_title.create")}
        canEdit={can("job_title.update")}
        canDelete={can("job_title.delete")}
        labelKey="name"
        pageSize={50}
        columns={[
          {
            key: "sortOrder",
            label: "TT",
            className: "w-12 text-[var(--muted-foreground)]",
          },
          {
            key: "code",
            label: "Mã",
            render: (row) => (
              <span className="font-mono text-xs">{String(row.code)}</span>
            ),
          },
          {
            key: "name",
            label: "Tên chức danh",
            render: (row) => (
              <span className="font-medium">{String(row.name)}</span>
            ),
          },
          {
            key: "userCount",
            label: "Số người dùng",
            render: (row) =>
              Number(row.userCount) > 0 ? (
                <Badge tone="info">{String(row.userCount)} người</Badge>
              ) : (
                <span className="text-[var(--muted-foreground)]">—</span>
              ),
          },
          {
            key: "active",
            label: "Trạng thái",
            render: (row) =>
              row.active ? (
                <Badge tone="success">Đang dùng</Badge>
              ) : (
                <Badge tone="muted">Ngừng</Badge>
              ),
          },
        ]}
      />
    </>
  );
}
