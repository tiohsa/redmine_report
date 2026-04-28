import React, { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n';
import {
  COMPACT_ACTION_BUTTON_HEIGHT,
  COMPACT_ACTION_BUTTON_MIN_WIDTH,
  DEFAULT_DIALOG_WIDTH_PX,
  EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS,
  extractIssueIdFromLocationCandidates,
  findEmbeddedIssueForm as findEmbeddedIssueFormElement,
  getEmbeddedDialogDefaultHeight,
  MAX_DIALOG_VIEWPORT_HEIGHT_RATIO,
  submitEmbeddedIssueForm,
  setupEmbeddedIssueDialogIframe,
  useEmbeddedIssueDialogLayout,
} from './embeddedIssueDialog';
import { reportStyles } from '../designSystem';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

const EMBEDDED_DIALOG_BUTTON_FONT_FAMILY = "'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif";
type CreateDestinationIssueDialogProps = {
  projectIdentifier: string;
  onCreated?: (createdIssueId?: number) => void;
  onClose: () => void;
};

export function CreateDestinationIssueDialog({
  projectIdentifier,
  onCreated,
  onClose,
}: CreateDestinationIssueDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const handledCreationRef = useRef(false);
  const iframeEscapeCleanupRef = useRef<(() => void) | null>(null);
  const { dialogHeightPx, measureDialogHeight, bindIframeSizeObservers, resetLayout } = useEmbeddedIssueDialogLayout({
    isOpen: true,
    iframeRef,
    headerRef,
    footerRef,
    errorRef,
  });

  const defaultSubject = t('embeddedIssueForm.defaultSubject');
  const descriptionText = t('embeddedIssueForm.descriptionForAiResponse');

  const issueQuery = new URLSearchParams();
  issueQuery.set('issue[subject]', defaultSubject);
  issueQuery.set('issue[description]', descriptionText);

  const iframeUrl = `/projects/${projectIdentifier}/issues/new?${issueQuery.toString()}`;
  const externalUrl = iframeUrl;

  useEffect(() => {
    setIframeReady(false);
    setIframeError(null);
    handledCreationRef.current = false;
    iframeEscapeCleanupRef.current?.();
    iframeEscapeCleanupRef.current = null;
    resetLayout();
  }, [iframeUrl, resetLayout]);

  useEffect(() => () => {
    iframeEscapeCleanupRef.current?.();
    iframeEscapeCleanupRef.current = null;
  }, []);

  const handleSave = async () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) throw new Error(t('embeddedIssueForm.formNotLoaded'));
    const form = findEmbeddedIssueFormElement(doc);
      if (!form) throw new Error(t('embeddedIssueForm.formNotFound'));

      setIsSubmitting(true);
      setSubmitError(null);
      const res = await submitEmbeddedIssueForm(form);

      if (!res.ok) {
        throw new Error(t('embeddedIssueForm.createIssueFailed', { status: res.status }));
      }

      const createdIssueId = extractIssueIdFromLocationCandidates([
        res.url,
        res.headers.get('x-response-url'),
        res.headers.get('location'),
      ]);
      if (!createdIssueId) {
        throw new Error(t('embeddedIssueForm.createdIssueIdNotFound'));
      }

      onCreated?.(createdIssueId);
      onClose();
    } catch (err: any) {
      setSubmitError(t('common.alertError', { message: err.message }));
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`${reportStyles.dialogOverlay} z-[70] sm:p-6`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="report-surface-elevated flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300 font-sans"
        style={{
          width: `${DEFAULT_DIALOG_WIDTH_PX}px`,
          maxWidth: '98vw',
          height: `${dialogHeightPx ?? getEmbeddedDialogDefaultHeight()}px`,
          maxHeight: `${Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO)}px`,
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={headerRef}
          data-testid="destination-issue-dialog-header"
          className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 bg-white"
          style={{ padding: '2px 12px' }}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <h4 className="truncate text-[18px] font-display font-medium text-[#222222]" data-testid="destination-issue-dialog-title">
              {t('destinationIssueDialog.title')}
            </h4>
          </div>
          <div className="flex items-center gap-[6px] flex-shrink-0">
          <Button
            variant="icon-muted"
            aria-label={t('destinationIssueDialog.closeAria')}
            onClick={onClose}
          >
            <Icon name="close" />
          </Button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
          {submitError ? (
            <div className="report-alert-error mx-4 mt-4" role="alert">{submitError}</div>
          ) : null}
          {iframeError ? (
            <div
              ref={errorRef}
              data-testid="destination-issue-dialog-error"
              style={{
                flex: '0 0 auto',
                padding: '12px 16px',
                backgroundColor: '#fdecea',
                color: '#b71c1c',
                borderBottom: '1px solid #f5c6cb',
                fontSize: 13,
              }}
            >
              {iframeError}
            </div>
          ) : null}
          <iframe
            ref={iframeRef}
            title={t('destinationIssueDialog.iframeTitle')}
            src={iframeUrl}
            className={`absolute inset-0 w-full h-full border-0 bg-white ${iframeReady ? 'opacity-100' : 'opacity-0'}`}
            onLoad={(e) => {
              try {
                const doc = (e.target as HTMLIFrameElement).contentDocument;
                if (!doc) return;

                const createdIssueId = setupEmbeddedIssueDialogIframe(doc, {
                  onClose,
                  setIframeError,
                  bindIframeSizeObservers,
                  cleanupEscapeHandlerRef: iframeEscapeCleanupRef,
                  extraCss: EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS,
                  styleId: 'rr-embedded-issue-dialog-style-destination',
                });

                if (!handledCreationRef.current && createdIssueId) {
                  handledCreationRef.current = true;
                  onCreated?.(createdIssueId);
                  onClose();
                  return;
                }
              } catch {
                setIframeError(null);
              }

              requestAnimationFrame(() => {
                setIframeReady(true);
                setIsSubmitting(false);
                measureDialogHeight();
              });
            }}
          />
          {!iframeReady ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <div className="text-xs text-slate-500 font-medium tracking-wide">{t('embeddedIssueForm.dialogLoading')}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div
          ref={footerRef}
          data-testid="destination-issue-dialog-footer"
          className="flex flex-shrink-0 items-center justify-start gap-3 border-t border-gray-100 bg-white px-6 py-4"
        >
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t('common.openInNewTab')}
            className={reportStyles.iconButtonMuted}
          >
            <Icon name="open-in-new" />
          </a>
          <Button variant="secondary" className="min-w-[88px]" style={{ height: '28px', minWidth: '88px' }} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={isSubmitting || !iframeReady}
            onClick={handleSave}
            className="min-w-[88px]"
            style={{ height: '28px', minWidth: '88px' }}
          >
            {isSubmitting ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
