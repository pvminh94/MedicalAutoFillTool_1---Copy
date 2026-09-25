'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Hospital, X } from 'lucide-react';
import { NAV_GROUPS } from './nav';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

/** Menu dọc: tự ẩn mục không đủ quyền, tự thu gọn trên màn hình nhỏ. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const can = useAuth((s) => s.can);
  const user = useAuth((s) => s.user);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-[var(--card)]">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[var(--primary)] text-white">
          <Hospital className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">QLBS</div>
          <div className="truncate text-[11px] text-[var(--muted-foreground)]">
            Quản lý bệnh viện
          </div>
        </div>
        {onNavigate ? (
          <button type="button" onClick={onNavigate} className="rounded-lg p-1 lg:hidden" aria-label="Đóng menu">
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <nav className="thin-scroll flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="space-y-1">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                {group.label}
              </div>
              {items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href) && item.href.split('/').length > 2);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                      active
                        ? 'bg-[var(--accent)] font-semibold text-[var(--accent-foreground)]'
                        : 'text-[var(--foreground)] hover:bg-[var(--muted)]',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {user ? (
        <div className="border-t px-4 py-3 text-[11px] text-[var(--muted-foreground)]">
          <div className="truncate font-medium text-[var(--foreground)]">{user.fullName}</div>
          <div className="truncate">{user.departmentName || user.title || user.username}</div>
        </div>
      ) : null}
    </aside>
  );
}
