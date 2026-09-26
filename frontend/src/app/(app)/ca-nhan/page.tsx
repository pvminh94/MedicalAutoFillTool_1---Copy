'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Monitor, Save, ShieldCheck, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Badge, Card, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, toList } from '@/lib/utils';

interface Profile {
  id: number;
  username: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  departmentName: string | null;
  roles: { code: string; name: string; dataScope: string }[];
  permissions: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

interface SessionInfo {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetch<Profile>('/auth/profile'),
  });

  const { data: sessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiFetch<unknown>('/auth/sessions').then((d) => toList<SessionInfo>(d, 'sessions')),
  });

  useEffect(() => {
    if (profile) setForm({ fullName: profile.fullName, title: profile.title ?? '', email: profile.email ?? '', phone: profile.phone ?? '' });
  }, [profile]);

  const save = useMutation({
    mutationFn: () => apiFetch('/auth/profile', { method: 'PUT', body: form }),
    onSuccess: async () => {
      toast.success('Đã cập nhật hồ sơ');
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await useAuth.getState().loadMe();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const revokeSession = useMutation({
    mutationFn: (id: string) => apiFetch(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Đã thu hồi phiên đăng nhập');
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const permissionsByModule = (profile?.permissions ?? []).reduce<Record<string, number>>((acc, code) => {
    const module = code.split('.')[0];
    acc[module] = (acc[module] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <PageHeader title="Thông tin cá nhân" description="Hồ sơ, vai trò, quyền hiệu lực và các phiên đăng nhập" />

      {isLoading || !profile ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
              <User className="size-4" /> Hồ sơ
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tên đăng nhập</Label>
                <Input value={profile.username} disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Khoa công tác</Label>
                <Input value={profile.departmentName ?? '—'} disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Họ và tên</Label>
                <Input value={String(form.fullName ?? '')} onChange={(e) => setForm((s) => ({ ...s, fullName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Chức danh</Label>
                <Input value={String(form.title ?? '')} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Thư điện tử</Label>
                <Input value={String(form.email ?? '')} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Điện thoại</Label>
                <Input value={String(form.phone ?? '')} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button loading={save.isPending} onClick={() => save.mutate()}>
                  <Save /> Lưu hồ sơ
                </Button>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
                <ShieldCheck className="size-4" /> Vai trò & quyền
              </div>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-1.5">
                  {(profile.roles ?? []).map((role) => (
                    <Badge key={role.code} tone="info">
                      {role.name}
                    </Badge>
                  ))}
                  {user?.isSuperAdmin ? <Badge tone="success">Quản trị tối cao</Badge> : null}
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  Phạm vi dữ liệu: {user?.dataScope === 'ALL' ? 'Toàn viện' : user?.dataScope === 'DEPT' ? 'Theo khoa' : 'Cá nhân'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(permissionsByModule).map(([module, count]) => (
                    <Badge key={module} tone="muted">
                      {module}: {count}
                    </Badge>
                  ))}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  Đăng nhập gần nhất: {profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : '—'}
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Monitor className="size-4" /> Phiên đăng nhập
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await logout(true);
                    router.replace('/login');
                  }}
                >
                  <LogOut /> Đăng xuất mọi thiết bị
                </Button>
              </div>
              <div className="divide-y">
                {(sessions ?? []).map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-2 px-4 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{s.userAgent || 'Không rõ thiết bị'}</div>
                      <div className="text-[var(--muted-foreground)]">
                        {s.ip} · {formatDateTime(s.lastSeenAt ?? s.createdAt)}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-[var(--danger)]" onClick={() => revokeSession.mutate(s.id)}>
                      Thu hồi
                    </Button>
                  </div>
                ))}
                {(sessions ?? []).length === 0 ? (
                  <div className="px-4 py-4 text-center text-xs text-[var(--muted-foreground)]">Chỉ có phiên hiện tại</div>
                ) : null}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
                <KeyRound className="size-4" /> Bảo mật
              </div>
              <div className="p-4">
                <Link href="/ca-nhan/doi-mat-khau" className="text-sm text-[var(--primary)] hover:underline">
                  Đổi mật khẩu đăng nhập →
                </Link>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
