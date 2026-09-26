'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, LockOpen, ShieldCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CrudTable, type CrudField } from '@/components/shared/crud-table';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';

/**
 * Chuẩn hoá danh sách vai trò của một người dùng.
 * API `/users` trả mảng `{ name, code, color }`; vẫn nhận dạng chuỗi cũ `tên|mã|màu;;…`.
 * (Trước đây trang chỉ hiểu dạng chuỗi nên người dùng đã có vai trò bị gửi mã rỗng
 * → "Vai trò không tồn tại" và các ô tích không được đánh dấu.)
 */
function parseUserRoles(value: unknown): { name: string; code: string }[] {
  if (Array.isArray(value)) {
    return value
      .map((r) => (typeof r === 'string' ? { name: r, code: r } : { name: String(r?.name ?? r?.code ?? ''), code: String(r?.code ?? '') }))
      .filter((r) => r.code);
  }
  if (typeof value === 'string' && value) {
    return value
      .split(';;')
      .map((part) => {
        const [name = '', code = ''] = part.split('|');
        return { name: name || code, code };
      })
      .filter((r) => r.code);
  }
  return [];
}

interface RoleOption {
  id: number;
  code: string;
  name: string;
  color: string;
  dataScope: 'OWN' | 'DEPT' | 'ALL';
  active: boolean;
}

interface DeptOption {
  id: number;
  code: string;
  name: string;
  level: number;
}

/** Quản trị người dùng: CRUD, gán vai trò, khoá/mở khoá, đặt lại mật khẩu. */
export default function UsersPage() {
  const can = useAuth((s) => s.can);
  const queryClient = useQueryClient();

  const [roleTarget, setRoleTarget] = useState<Record<string, unknown> | null>(null);
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [resetTarget, setResetTarget] = useState<Record<string, unknown> | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<Record<string, unknown> | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const { data: roles } = useQuery({
    queryKey: ['roles-all'],
    queryFn: () => apiFetch<RoleOption[]>('/roles/all'),
  });

  const { data: departments } = useQuery({
    queryKey: ['departments-options'],
    queryFn: () => apiFetch<DeptOption[]>('/departments/options'),
  });

  const fields: CrudField[] = [
    { name: 'username', label: 'Tên đăng nhập', required: true, createOnly: true, placeholder: 'bs.nguyenvana' },
    { name: 'fullName', label: 'Họ và tên', required: true, placeholder: 'Nguyễn Văn A' },
    { name: 'title', label: 'Chức danh', placeholder: 'Bác sĩ / Điều dưỡng / Kế toán' },
    { name: 'departmentId', label: 'Khoa công tác', type: 'select', options: (departments ?? []).map((d) => ({ value: d.id, label: `${'— '.repeat(Math.max(0, d.level - 1))}${d.name}` })) },
    { name: 'email', label: 'Thư điện tử', type: 'email' },
    { name: 'phone', label: 'Điện thoại' },
    { name: 'password', label: 'Mật khẩu ban đầu', type: 'password', createOnly: true, hideInTable: true, help: 'Bỏ trống để dùng mật khẩu mặc định Qlbs@123456' },
    { name: 'mustChangePassword', label: 'Buộc đổi mật khẩu lần đầu', type: 'switch', defaultValue: true, hideInTable: true },
    { name: 'active', label: 'Đang làm việc', type: 'switch', defaultValue: true },
    { name: 'note', label: 'Ghi chú', type: 'textarea', hideInTable: true },
  ];

  const setRoles = useMutation({
    mutationFn: (payload: { id: number; roleCodes: string[] }) =>
      apiFetch(`/users/${payload.id}/roles`, { method: 'PUT', body: { roleCodes: payload.roleCodes, replace: true } }),
    onSuccess: async () => {
      toast.success('Đã cập nhật vai trò');
      setRoleTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['/users'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const resetPassword = useMutation({
    mutationFn: (id: number) => apiFetch<{ temporaryPassword?: string }>(`/users/${id}/reset-password`, { method: 'POST', body: {} }),
    onSuccess: async (res) => {
      setResetTarget(null);
      if (res.temporaryPassword) setTempPassword(res.temporaryPassword);
      else toast.success('Đã đặt lại mật khẩu');
      await queryClient.invalidateQueries({ queryKey: ['/users'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const unlock = useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}/unlock`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Đã mở khoá tài khoản');
      setUnlockTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['/users'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <>
      <PageHeader
        title="Người dùng"
        description="Tài khoản, vai trò và phạm vi dữ liệu được phép truy cập"
      />

      <CrudTable
        title="Danh sách người dùng"
        endpoint="/users"
        filterResource="users"
        fields={fields}
        createLabel="Thêm người dùng"
        searchPlaceholder="Tìm theo tên, tài khoản, chức danh…"
        canCreate={can('user.create')}
        canEdit={can('user.update')}
        canDelete={can('user.delete')}
        labelKey="fullName"
        pageSize={20}
        toolbar={
          <Badge tone="info">
            <UserPlus className="mr-1 size-3" /> {roles?.length ?? 0} vai trò sẵn có
          </Badge>
        }
        columns={[
          { key: 'username', label: 'Tài khoản' },
          { key: 'fullName', label: 'Họ và tên' },
          { key: 'title', label: 'Chức danh' },
          { key: 'departmentName', label: 'Khoa' },
          {
            key: 'roles',
            label: 'Vai trò',
            render: (row) => {
              const list = parseUserRoles(row.roles);
              if (!list.length) return <span className="text-[var(--muted-foreground)]">Chưa gán</span>;
              return (
                <div className="flex flex-wrap gap-1">
                  {list.map(({ name, code }) => {
                    return (
                      <Badge key={code} tone="muted">
                        <span title={code}>{name}</span>
                      </Badge>
                    );
                  })}
                </div>
              );
            },
          },
          {
            key: 'lockedUntil',
            label: 'Trạng thái',
            render: (row) => {
              const locked = row.lockedUntil && new Date(String(row.lockedUntil)) > new Date();
              if (locked) return <Badge tone="danger">Tạm khoá</Badge>;
              return row.active ? <Badge tone="success">Đang làm việc</Badge> : <Badge tone="muted">Đã nghỉ</Badge>;
            },
          },
          {
            key: 'lastLoginAt',
            label: 'Đăng nhập gần nhất',
            render: (row) => (row.lastLoginAt ? formatDateTime(String(row.lastLoginAt)) : '—'),
          },
        ]}
        rowActions={(row) => (
          <>
            {can('user.assign-role') ? (
              <Button
                variant="ghost"
                size="icon"
                title="Gán vai trò"
                onClick={() => {
                  setRoleTarget(row);
                  setRoleCodes(parseUserRoles(row.roles).map((r) => r.code));
                }}
              >
                <ShieldCheck />
              </Button>
            ) : null}
            {can('user.reset-password') ? (
              <Button variant="ghost" size="icon" title="Đặt lại mật khẩu" onClick={() => setResetTarget(row)}>
                <KeyRound />
              </Button>
            ) : null}
            {row.lockedUntil && new Date(String(row.lockedUntil)) > new Date() && can('user.update') ? (
              <Button variant="ghost" size="icon" title="Mở khoá" onClick={() => setUnlockTarget(row)}>
                <LockOpen />
              </Button>
            ) : null}
          </>
        )}
      />

      {/* Gán vai trò */}
      <Dialog
        open={!!roleTarget}
        onClose={() => setRoleTarget(null)}
        title={`Gán vai trò: ${String(roleTarget?.fullName ?? '')}`}
        description="Vai trò quyết định tập quyền và phạm vi số liệu được xem"
        footer={
          <>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              Huỷ
            </Button>
            <Button
              loading={setRoles.isPending}
              onClick={() => roleTarget && setRoles.mutate({ id: Number(roleTarget.id), roleCodes: [...new Set(roleCodes.filter(Boolean))] })}
            >
              Lưu vai trò
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {(roles ?? []).map((role) => {
            const checked = roleCodes.includes(role.code);
            return (
              <label
                key={role.code}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-[var(--muted)]"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={(e) =>
                    setRoleCodes((prev) => (e.target.checked ? [...prev, role.code] : prev.filter((c) => c !== role.code)))
                  }
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {role.name}
                    <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{role.code}</span>
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    Phạm vi: {role.dataScope === 'ALL' ? 'Toàn viện' : role.dataScope === 'DEPT' ? 'Theo khoa' : 'Cá nhân'}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!resetTarget}
        title="Đặt lại mật khẩu"
        message={
          <>
            Đặt lại mật khẩu cho <b>{String(resetTarget?.fullName ?? '')}</b> về mặc định và buộc đổi ở lần đăng nhập
            tới? Mọi phiên đăng nhập hiện tại sẽ bị thu hồi.
          </>
        }
        confirmText="Đặt lại"
        loading={resetPassword.isPending}
        onConfirm={() => resetTarget && resetPassword.mutate(Number(resetTarget.id))}
        onClose={() => setResetTarget(null)}
      />

      <ConfirmDialog
        open={!!unlockTarget}
        title="Mở khoá tài khoản"
        message={<>Mở khoá tài khoản <b>{String(unlockTarget?.username ?? '')}</b> và xoá số lần đăng nhập sai?</>}
        confirmText="Mở khoá"
        loading={unlock.isPending}
        onConfirm={() => unlockTarget && unlock.mutate(Number(unlockTarget.id))}
        onClose={() => setUnlockTarget(null)}
      />

      <Dialog
        open={!!tempPassword}
        onClose={() => setTempPassword(null)}
        title="Mật khẩu tạm thời"
        size="sm"
        footer={
          <Button onClick={() => setTempPassword(null)}>
            <Lock /> Đã hiểu
          </Button>
        }
      >
        <p className="text-sm">
          Mật khẩu tạm thời là <b className="font-mono">{tempPassword}</b>. Vui lòng gửi cho người dùng và yêu cầu đổi
          ngay sau khi đăng nhập.
        </p>
      </Dialog>
    </>
  );
}
