import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border bg-[var(--card)] text-[var(--card-foreground)] shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3', className)}>
      <div className="space-y-0.5">
        <div className="text-base font-semibold">{title}</div>
        {description ? <div className="text-xs text-[var(--muted-foreground)]">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'brand';
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: 'bg-[var(--muted)] text-[var(--foreground)]',
    muted: 'bg-[var(--muted)] text-[var(--muted-foreground)]',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    info: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-100',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-[var(--muted)]', className)} />;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="text-sm font-medium">{title}</div>
      {description ? <div className="max-w-md text-xs text-[var(--muted-foreground)]">{description}</div> : null}
      {action}
    </div>
  );
}
