import type { InputHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { reportStyles } from '../designSystem';
import { cn } from './cn';

type CheckboxRowProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children' | 'onChange'> & {
  checked: boolean;
  description?: ReactNode;
  label: ReactNode;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  contentClassName?: string;
  inputClassName?: string;
};

export const CheckboxRow = forwardRef<HTMLInputElement, CheckboxRowProps>(
  (
    {
      checked,
      className,
      contentClassName,
      description,
      disabled,
      id,
      inputClassName,
      label,
      onCheckedChange,
      ...props
    },
    ref
  ) => {
    return (
      <label
        className={cn(
          reportStyles.checkboxRow,
          checked && reportStyles.checkboxRowSelected,
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className={cn(reportStyles.checkboxControl, inputClassName)}
          {...props}
        />

        <span className={cn('min-w-0 flex-1', contentClassName)}>
          <span className={reportStyles.checkboxLabel}>{label}</span>
          {description ? (
            <span className={reportStyles.checkboxDescription}>{description}</span>
          ) : null}
        </span>
      </label>
    );
  }
);

CheckboxRow.displayName = 'CheckboxRow';
