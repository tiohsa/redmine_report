import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { reportStyles } from '../designSystem';
import { IconButton } from './IconButton';
import { cn } from './cn';

type DialogSize = 'sm' | 'md' | 'lg';

type DialogShellProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  onClose: () => void;
  size?: DialogSize;
  className?: string;
  panelClassName?: string;
  closeLabel?: string;
  closeOnBackdropClick?: boolean;
};

const sizeClasses: Record<DialogSize, string> = {
  sm: reportStyles.dialogPanelSm,
  md: reportStyles.dialogPanelMd,
  lg: reportStyles.dialogPanelLg
};

export const DialogShell = ({
  open,
  title,
  description,
  children,
  footer,
  headerActions,
  onClose,
  size = 'md',
  className,
  panelClassName,
  closeLabel = 'Close dialog',
  closeOnBackdropClick = true
}: DialogShellProps) => {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const content = (
    <div className={cn(reportStyles.dialogShell, className)}>
      <div
        className={reportStyles.dialogBackdrop}
        aria-hidden="true"
        onMouseDown={closeOnBackdropClick ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(reportStyles.dialogPanel, sizeClasses[size], panelClassName)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={reportStyles.dialogHeader}>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={reportStyles.dialogTitle}>
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className={reportStyles.dialogDescription}>
                {description}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {headerActions}
            <IconButton
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              }
              label={closeLabel}
              variant="ghost"
              size="sm"
              onClick={onClose}
            />
          </div>
        </div>

        <div className={reportStyles.dialogBody}>{children}</div>

        {footer ? <div className={reportStyles.dialogFooter}>{footer}</div> : null}
      </div>
    </div>
  );

  return typeof document === 'undefined' ? content : createPortal(content, document.body);
};
