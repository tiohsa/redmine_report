import DatePicker from 'react-datepicker';
import { format, isValid, parse, parseISO } from 'date-fns';
import React, { forwardRef, useMemo, useRef } from 'react';
import { getDateFnsLocale, t } from '../../i18n';

type DateFieldKey = 'start_date' | 'due_date';

export type InlineDateRangeValue = {
  issueId: number;
  focusField: DateFieldKey;
  startDate: string;
  dueDate: string;
};

type InlineDateRangeEditorProps = {
  issueId: number;
  focusField: DateFieldKey | null;
  startDate: string;
  dueDate: string;
  startColumnWidth: number;
  dueColumnWidth: number;
  isSaving?: boolean;
  onActivate: (field: DateFieldKey, event?: React.MouseEvent) => void;
  onCommit: (field: DateFieldKey, value: string) => void;
  onCancel: () => void;
};

type InlineDateFieldProps = {
  field: DateFieldKey;
  issueId: number;
  isActive: boolean;
  value: string;
  minDate?: Date;
  maxDate?: Date;
  onActivate: (field: DateFieldKey, event?: React.MouseEvent) => void;
  onCommit: (field: DateFieldKey, value: string) => void;
  onCancel: () => void;
};

type CustomInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  'data-testid'?: string;
};

const DATE_DISPLAY_FORMAT = 'yyyy/MM/dd';
const DATE_PICKER_FORMAT = 'yyyy/MM/dd';
const DATE_PICKER_PORTAL_ID = 'redmine-report-inline-date-picker-portal';

const parseDateValue = (value: string): Date | null => {
  if (!value) return null;

  const isoParsed = parseISO(value);
  if (isValid(isoParsed)) return isoParsed;

  const formattedParsed = parse(value, DATE_DISPLAY_FORMAT, new Date());
  if (isValid(formattedParsed)) return formattedParsed;

  const fallbackParsed = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(fallbackParsed) ? fallbackParsed : null;
};

const formatDateValue = (value: string): string => {
  const parsed = parseDateValue(value);
  return parsed ? format(parsed, DATE_DISPLAY_FORMAT) : '-';
};

const toIsoDate = (value: Date | null): string => {
  if (!value) return '';
  return format(value, 'yyyy-MM-dd');
};

const DatePickerInput = forwardRef<HTMLInputElement, CustomInputProps>(function DatePickerInput(
  { className = '', ...props },
  ref
) {
  return <input ref={ref} {...props} className={className} readOnly />;
});

const InlineDateField = ({
  field,
  issueId,
  isActive,
  value,
  minDate,
  maxDate,
  onActivate,
  onCommit,
  onCancel
}: InlineDateFieldProps) => {
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const displayValue = useMemo(() => formatDateValue(value), [value]);
  const lastCommittedValueRef = useRef<string | null>(null);
  const label = field === 'start_date'
    ? t('timeline.startDateCol', { defaultValue: 'Start Date' })
    : t('timeline.dueDateCol', { defaultValue: 'Due Date' });
  const testId = field === 'start_date'
    ? `start-date-input-${issueId}`
    : `due-date-input-${issueId}`;
  const PopperContainer = ({ children }: { children?: React.ReactNode }) => (
    <div
      data-date-editor-popper="true"
      style={{ pointerEvents: 'auto' }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
  const commitDate = (date: Date | null) => {
    const nextValue = toIsoDate(date);
    if (lastCommittedValueRef.current === nextValue) return;
    lastCommittedValueRef.current = nextValue;
    onCommit(field, nextValue);
    onCancel();
  };

  return (
    <div
      className={`report-inline-date-shell ${isActive ? 'report-inline-date-shell-active' : ''}`}
      data-date-editor-root="true"
    >
      <span
        data-testid={field === 'start_date' ? `start-date-display-${issueId}` : `due-date-display-${issueId}`}
        className="report-inline-date-display"
        onDoubleClick={(event) => onActivate(field, event)}
        onClick={(event) => event.stopPropagation()}
        title={displayValue}
      >
        {displayValue}
      </span>

      {/* アクティブ時: DatePickerのみ表示 */}
      {isActive && (
        <DatePicker
          open={true}
          selected={selectedDate}
          onInputClick={() => onActivate(field)}
          onChange={(date: Date | null) => {
            commitDate(date);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
              return;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              const currentValue = (event.currentTarget as HTMLInputElement | null)?.value || '';
              commitDate(parseDateValue(currentValue) ?? selectedDate);
            }
          }}
          minDate={minDate}
          maxDate={maxDate}
          portalId={DATE_PICKER_PORTAL_ID}
          locale={getDateFnsLocale()}
          dateFormat={DATE_PICKER_FORMAT}
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"
          popperClassName="report-inline-date-popper"
          popperContainer={PopperContainer}
          calendarClassName="report-inline-date-calendar"
          className="report-inline-date-input report-inline-date-input-active"
          autoFocus={true}
          preventOpenOnFocus={false}
          customInput={
            <DatePickerInput
              data-testid={testId}
              aria-label={label}
              className="report-inline-date-input report-inline-date-input-active"
            />
          }
          wrapperClassName="report-inline-date-picker-wrapper report-inline-date-picker-wrapper-active"
        >
          <div className="report-inline-date-calendar-footer">
            <button
              type="button"
              data-testid={`date-today-footer-${field}-${issueId}`}
              className="report-inline-date-calendar-button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                commitDate(new Date());
              }}
            >
              {t('common.today', { defaultValue: 'Today' })}
            </button>
            <button
              type="button"
              data-testid={`date-clear-footer-${field}-${issueId}`}
              className="report-inline-date-calendar-button report-inline-date-calendar-button-clear"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                commitDate(null);
              }}
            >
              {t('common.clear', { defaultValue: 'Clear' })}
            </button>
          </div>
        </DatePicker>
      )}
    </div>
  );
};

export const InlineDateRangeEditor = ({
  issueId,
  focusField,
  startDate,
  dueDate,
  startColumnWidth,
  dueColumnWidth,
  isSaving = false,
  onActivate,
  onCommit,
  onCancel
}: InlineDateRangeEditorProps) => {
  const startDateValue = startDate || '';
  const dueDateValue = dueDate || '';
  const hasStartConstraint = Boolean(dueDateValue);
  const hasDueConstraint = Boolean(startDateValue);

  return (
    <>
      <div
        className="shrink-0 flex items-center px-2 justify-start border-r border-slate-200/80 self-stretch overflow-hidden group/cell"
        style={{ width: `${startColumnWidth}px`, minWidth: `${startColumnWidth}px` }}
      >
        <div className="relative w-full h-8">
          <InlineDateField
            field="start_date"
            issueId={issueId}
            isActive={focusField === 'start_date'}
            value={startDateValue}
            maxDate={hasStartConstraint ? parseDateValue(dueDateValue) ?? undefined : undefined}
            onActivate={onActivate}
            onCommit={onCommit}
            onCancel={onCancel}
          />
        </div>
      </div>

      <div
        className="shrink-0 flex items-center px-2 justify-start border-r border-slate-200/80 self-stretch overflow-hidden group/cell"
        style={{ width: `${dueColumnWidth}px`, minWidth: `${dueColumnWidth}px` }}
      >
        <div className="relative w-full h-8 flex items-center">
          <InlineDateField
            field="due_date"
            issueId={issueId}
            isActive={focusField === 'due_date'}
            value={dueDateValue}
            minDate={hasDueConstraint ? parseDateValue(startDateValue) ?? undefined : undefined}
            onActivate={onActivate}
            onCommit={onCommit}
            onCancel={onCancel}
          />
          {isSaving ? (
            <div className="ml-1 flex h-3 w-3 flex-shrink-0 animate-spin rounded-full border-b-2 border-blue-600" />
          ) : null}
        </div>
      </div>
    </>
  );
};
