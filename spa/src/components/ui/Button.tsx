import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { reportStyles } from '../designSystem';
import { cn } from './cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'pill' | 'pill-primary' | 'pill-secondary' | 'icon' | 'icon-active' | 'icon-muted';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  loading?: boolean;
  trailingIcon?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: reportStyles.buttonPrimary,
  secondary: reportStyles.buttonSecondary,
  ghost: reportStyles.buttonGhost,
  danger: reportStyles.buttonDanger,
  pill: reportStyles.pillNav,
  'pill-primary': reportStyles.pillPrimary,
  'pill-secondary': reportStyles.pillSecondary,
  icon: reportStyles.iconButton,
  'icon-active': reportStyles.iconButtonActive,
  'icon-muted': reportStyles.iconButtonMuted,
};

const sizeClassName: Record<ButtonSize, string> = {
  sm: reportStyles.buttonSm,
  md: reportStyles.buttonMd,
  lg: reportStyles.buttonLg
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      disabled,
      fullWidth = false,
      leadingIcon,
      loading = false,
      trailingIcon,
      type = 'button',
      variant = 'primary',
      size = 'md',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        className={cn(
          reportStyles.button,
          variantClassName[variant],
          sizeClassName[size],
          fullWidth && 'w-full',
          loading && reportStyles.buttonLoading,
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
              <path
                d="M22 12a10 10 0 0 0-10-10"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
            <span>{children}</span>
          </>
        ) : (
          <>
            {leadingIcon ? <span className="inline-flex shrink-0">{leadingIcon}</span> : null}
            <span>{children}</span>
            {trailingIcon ? <span className="inline-flex shrink-0">{trailingIcon}</span> : null}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
