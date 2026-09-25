import type { ReactNode } from 'react';

/** Tiêu đề trang dùng chung: tiêu đề, mô tả và khu vực nút thao tác bên phải. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        {breadcrumb ? (
          <div className="text-[11px] text-[var(--muted-foreground)]">{breadcrumb}</div>
        ) : null}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Ô số liệu lớn trên bảng điều khiển. */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
}) {
  const tones: Record<string, string> = {
    default: 'bg-[var(--muted)] text-[var(--foreground)]',
    primary: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  };
  return (
    <div className="rounded-[var(--radius-card)] border bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {label}
          </div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          {hint ? <div className="text-[11px] text-[var(--muted-foreground)]">{hint}</div> : null}
        </div>
        {icon ? (
          <div className={`flex size-9 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
        ) : null}
      </div>
    </div>
  );
}
