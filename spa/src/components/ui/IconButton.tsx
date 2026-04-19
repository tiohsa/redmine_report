import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { reportStyles } from '../designSystem';
import { cn } from './cn';

type IconButtonVariant = 'default' | 'active' | 'muted' | 'ghost';
type IconButtonSize = 'sm' | 'md';

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: ReactNode;
  label: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
};

const variantClasses: Record<IconButtonVariant, string> = {
  default: 'bg-[rgba(0,0,0,0.05)] text-[#18181b] hover:bg-[rgba(0,0,0,0.1)]',
  active: reportStyles.iconButtonActive,
  muted: reportStyles.iconButtonMuted,
  ghost: 'bg-transparent text-[#45515e] hover:bg-[rgba(0,0,0,0.05)] hover:text-[#222222]'
};

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10'
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      disabled,
      icon,
      label,
      size = 'md',
      title,
      type = 'button',
      variant = 'default',
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        aria-label={label}
        title={title ?? label}
        className={cn(
          reportStyles.iconButton,
          sizeClasses[size],
          variantClasses[variant],
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-200)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50',
          className
        )}
        {...props}
      >
        <span className="inline-flex shrink-0 items-center justify-center">
          {icon}
        </span>
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
