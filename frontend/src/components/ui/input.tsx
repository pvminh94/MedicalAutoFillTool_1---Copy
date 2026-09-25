import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9.5 w-full rounded-lg border bg-[var(--card)] px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-20 w-full rounded-lg border bg-[var(--card)] px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-9.5 w-full rounded-lg border bg-[var(--card)] px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('text-sm font-medium leading-none', className)} {...props}>
      {children}
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-[var(--primary)]' : 'bg-[var(--border)]',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-1',
        )}
      />
    </button>
  );
}
