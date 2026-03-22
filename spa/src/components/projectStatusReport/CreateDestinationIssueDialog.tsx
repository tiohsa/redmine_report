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
      className="fixed inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-[6px] shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden"
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
          className="border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white"
          style={{ padding: '2px 12px' }}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <h4 className="text-[14px] font-bold text-slate-800 truncate" data-testid="destination-issue-dialog-title">
              {t('destinationIssueDialog.title')}
            </h4>
          </div>
          <div className="flex items-center gap-[6px] flex-shrink-0">
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }}
              title={t('common.openInNewTab')}
              aria-label={t('common.openInNewTab')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" />
              </svg>
            </a>
            <button
              type="button"
              aria-label={t('destinationIssueDialog.closeAria')}
              className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }}
              onClick={onClose}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 bg-white overflow-hidden">
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
            <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none">
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
          className="border-t border-slate-200 bg-white flex justify-start gap-[6px] flex-shrink-0 items-center"
          style={{ padding: '2px 12px 4px 12px' }}
        >
          <button
            type="button"
            className="bg-white border border-slate-300 text-[13px] text-slate-700 hover:bg-slate-50 rounded transition-colors cursor-pointer inline-flex items-center justify-center"
            style={{
              fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY,
              height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`,
              minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`,
            }}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-[13px] text-white rounded disabled:opacity-50 transition-colors cursor-pointer inline-flex items-center justify-center"
            style={{
              fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY,
              height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`,
              minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`,
            }}
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
