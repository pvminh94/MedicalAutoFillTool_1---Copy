import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 shadow-sm',
        outline: 'border bg-[var(--card)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
        ghost: 'hover:bg-[var(--muted)]',
        subtle: 'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]',
        danger: 'bg-[var(--danger)] text-white hover:opacity-90',
        success: 'bg-[var(--success)] text-white hover:opacity-90',
        link: 'text-[var(--primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9.5 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
