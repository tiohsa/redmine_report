import React, { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n';
import {
  applyEmbeddedIssueDialogStyles,
  bindIframeEscapeHandler,
  COMPACT_ACTION_BUTTON_HEIGHT,
  COMPACT_ACTION_BUTTON_MIN_WIDTH,
  COMPACT_ICON_BUTTON_SIZE,
  DEFAULT_DIALOG_WIDTH_PX,
  getEmbeddedDialogDefaultHeight,
  getEmbeddedIssueDialogErrorMessage,
  ISSUE_DIALOG_STYLE_ID,
  MAX_DIALOG_VIEWPORT_HEIGHT_RATIO,
  useEmbeddedIssueDialogLayout,
} from './embeddedIssueDialog';

const EMBEDDED_DIALOG_BUTTON_FONT_FAMILY = "'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif";
const EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS = `
                  #issue-form p:has(#issue_subject),
                  #new_issue p:has(#issue_subject),
                  #edit_issue p:has(#issue_subject) {
                    margin-bottom: 8px !important;
                  }
                  #issue-form label[for="issue_subject"],
                  #new_issue label[for="issue_subject"],
                  #edit_issue label[for="issue_subject"] {
                    margin-bottom: 2px !important;
                    font-size: 12px !important;
                    line-height: 1.2 !important;
                  }
                  #issue_subject {
                    min-height: 28px !important;
                    height: 28px !important;
                    padding-top: 3px !important;
                    padding-bottom: 3px !important;
                    font-size: 13px !important;
                    line-height: 1.2 !important;
                  }
`;

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

  const createIssueFromEmbeddedForm = async (): Promise<number> => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) throw new Error(t('embeddedIssueForm.formNotLoaded'));

    const form =
      doc.querySelector<HTMLFormElement>('form#issue-form') ||
      doc.querySelector<HTMLFormElement>('form#new_issue') ||
      doc.querySelector<HTMLFormElement>('#issue-form form') ||
      doc.querySelector<HTMLFormElement>('form.new_issue');

    if (!form) throw new Error(t('embeddedIssueForm.formNotFound'));

    const action = form.getAttribute('action') || '/issues';
    const method = (form.getAttribute('method') || 'post').toUpperCase();
    const formData = new FormData(form);
    const res = await fetch(action, {
      method,
      credentials: 'same-origin',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(t('embeddedIssueForm.createIssueFailed', { status: res.status }));
    }

    const locationCandidates = [res.url, res.headers.get('x-response-url') || '', res.headers.get('location') || ''];
    const createdIssueId = locationCandidates
      .map((url) => url.match(/\/issues\/(\d+)(?:[/?#]|$)/))
      .find((match): match is RegExpMatchArray => Boolean(match && match[1]));

    if (!createdIssueId) {
      throw new Error(t('embeddedIssueForm.createdIssueIdNotFound'));
    }
    return Number(createdIssueId[1]);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const newIssueId = await createIssueFromEmbeddedForm();
      onCreated?.(newIssueId);
      onClose();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const normalizeEmbeddedFormActions = (doc: Document) => {
    const forms = Array.from(doc.querySelectorAll('form[action]'));
    forms.forEach((form) => {
      const rawAction = form.getAttribute('action');
      if (!rawAction) return;
      try {
        const actionUrl = new URL(rawAction, window.location.origin);
        if (actionUrl.origin === window.location.origin) return;
        const normalized = `${actionUrl.pathname}${actionUrl.search}${actionUrl.hash}`;
        form.setAttribute('action', normalized);
      } catch {
        // Ignore invalid URL and keep original action.
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] sm:p-6"
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
          <button
            type="button"
            aria-label={t('destinationIssueDialog.closeAria')}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
            style={{ width: '24px', height: '24px' }}
            onClick={onClose}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
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

                applyEmbeddedIssueDialogStyles(doc, {
                  contentPadding: '16px',
                  extraCss: EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS,
                  styleId: `${ISSUE_DIALOG_STYLE_ID}-destination`,
                });
                setIframeError(getEmbeddedIssueDialogErrorMessage(doc));
                bindIframeSizeObservers(doc);
                iframeEscapeCleanupRef.current?.();
                iframeEscapeCleanupRef.current = bindIframeEscapeHandler(doc, onClose);
                normalizeEmbeddedFormActions(doc);

                const pathname = doc.location?.pathname || '';
                if (!handledCreationRef.current && /^\/issues\/\d+(?:\/)?$/.test(pathname)) {
                  handledCreationRef.current = true;
                  const createdIssueId = Number(pathname.split('/').pop());
                  onCreated?.(Number.isFinite(createdIssueId) ? createdIssueId : undefined);
                  onClose();
                  return;
                }
              } catch {
                setIframeError(null);
              }

              requestAnimationFrame(() => {
                setIframeReady(true);
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
            className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
            style={{ width: '24px', height: '24px' }}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 3h7v7m0-7L10 14m-4 0H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
            </svg>
          </a>
          <button
            type="button"
            className="inline-flex h-7 min-w-[88px] items-center justify-center rounded-full border border-gray-200 bg-[#f0f0f0] px-4 text-[13px] font-medium text-[#222222] transition-colors hover:bg-gray-200"
            style={{ height: '28px', minWidth: '88px' }}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="inline-flex h-7 min-w-[88px] items-center justify-center rounded-full bg-[#181e25] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 disabled:pointer-events-none"
            style={{ height: '28px', minWidth: '88px' }}
            disabled={isSubmitting || !iframeReady}
            onClick={handleSave}
          >
            {isSubmitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
