import type { CSSProperties, ReactNode } from 'react';
import { reportStyles } from '../designSystem';
import { cn } from './cn';
import { CheckboxRow as BaseCheckboxRow } from './CheckboxRow';

type SelectionListProps = {
  className?: string;
  children?: ReactNode;
};

export const SelectionList = ({ className, children }: SelectionListProps) => (
  <div className={cn(reportStyles.selectionList, className)} role="list">
    {children}
  </div>
);

type SelectionRowProps = {
  active?: boolean;
  disabled?: boolean;
  indent?: number;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
};

export const SelectionRow = ({
  active = false,
  disabled = false,
  indent = 0,
  leading,
  trailing,
  className,
  children,
  onClick,
}: SelectionRowProps) => (
  <div
    role="button"
    tabIndex={disabled ? -1 : 0}
    aria-disabled={disabled}
    onMouseDown={(e) => e.stopPropagation()}
    onClick={disabled ? undefined : (e) => {
      e.stopPropagation();
      onClick?.();
    }}
    onKeyDown={(event) => {
      if (disabled || !onClick) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    }}
    className={cn(
      reportStyles.selectionRow,
      active && reportStyles.selectionRowActive,
      disabled && 'cursor-not-allowed opacity-50',
      className
    )}
  >
    {leading}
    <span className="min-w-0 flex-1 truncate" style={{ paddingLeft: indent ? `${indent}px` as CSSProperties['paddingLeft'] : undefined }}>
      {children}
    </span>
    {trailing}
  </div>
);

type CheckboxIndicatorProps = {
  checked: boolean;
  disabled?: boolean;
};

export const CheckboxRow = ({ checked, disabled = false }: CheckboxIndicatorProps) => (
  <span className="flex h-5 items-center justify-center pointer-events-none" aria-hidden="true">
    <BaseCheckboxRow
      checked={checked}
      disabled={disabled}
      label=""
      onCheckedChange={() => undefined}
      className="bg-transparent p-0 border-0"
      contentClassName="hidden"
      inputClassName="m-0"
      tabIndex={-1}
    />
  </span>
);
