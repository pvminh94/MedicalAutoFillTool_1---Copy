'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface TabItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  content: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  const active = items.find((i) => i.key === value) ?? items[0];
  return (
    <div className={cn('space-y-4', className)}>
      <div className="thin-scroll flex gap-1 overflow-x-auto border-b">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              'relative -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
              item.key === active?.key
                ? 'border-[var(--primary)] font-semibold text-[var(--primary)]'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
          </button>
        ))}
      </div>
      <div>{active?.content}</div>
    </div>
  );
}
