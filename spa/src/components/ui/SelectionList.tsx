import type { CSSProperties, ReactNode } from 'react';
import { reportStyles } from '../designSystem';
import { cn } from './cn';
import { CheckboxRow } from './CheckboxRow';

export type SelectionListItem = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  indentLevel?: number;
  className?: string;
};

type SelectionListProps = {
  items?: SelectionListItem[];
  emptyState?: ReactNode;
  className?: string;
  onItemSelect?: (item: SelectionListItem) => void;
  children?: ReactNode;
};

export const SelectionList = ({
  items,
  emptyState,
  className,
  onItemSelect,
  children
}: SelectionListProps) => {
  if (children) {
    return <div className={cn(reportStyles.selectionList, className)} role="list">{children}</div>;
  }

  if (!items || items.length === 0) {
    return <div className={reportStyles.selectionListEmpty}>{emptyState ?? 'No options available.'}</div>;
  }

  return (
    <div className={cn(reportStyles.selectionList, className)} role="list">
      {items.map((item) => {
        const isDisabled = item.disabled === true;
        const isSelected = item.selected === true;

        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              reportStyles.selectionListItem,
              isSelected && reportStyles.selectionListItemSelected,
              isDisabled && reportStyles.selectionListItemDisabled,
              item.className
            )}
            disabled={isDisabled}
            aria-pressed={isSelected}
            onClick={() => onItemSelect?.(item)}
            style={
              item.indentLevel
                ? { paddingLeft: `calc(1rem + ${item.indentLevel * 0.75}rem)` }
                : undefined
            }
          >
            {item.leading ? <span className="mt-0.5 shrink-0">{item.leading}</span> : null}

            <span className="min-w-0 flex-1 text-left">
              <span className={reportStyles.selectionListLabel}>{item.label}</span>
              {item.description ? (
                <span className={reportStyles.selectionListDescription}>{item.description}</span>
              ) : null}
            </span>

            {item.trailing ? <span className="mt-0.5 shrink-0">{item.trailing}</span> : null}
          </button>
        );
      })}
    </div>
  );
};

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
    onClick={disabled ? undefined : onClick}
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

export { CheckboxRow };
