import type { LabelHTMLAttributes, ReactNode } from 'react';
import { reportStyles } from '../designSystem';
import { cn } from './cn';

type FieldLabelProps = Omit<LabelHTMLAttributes<HTMLLabelElement>, 'children'> & {
  children: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  hintClassName?: string;
};

export const FieldLabel = ({
  children,
  className,
  hint,
  hintClassName,
  required = false,
  ...props
}: FieldLabelProps) => (
  <div className={cn('space-y-1', className)}>
    <label className={reportStyles.fieldLabel} {...props}>
      <span>{children}</span>
      {required ? <span className={reportStyles.fieldRequired}>*</span> : null}
    </label>
    {hint ? <p className={cn(reportStyles.fieldHint, hintClassName)}>{hint}</p> : null}
  </div>
);
