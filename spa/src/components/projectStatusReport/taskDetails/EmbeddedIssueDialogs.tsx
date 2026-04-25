import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../../i18n';
import { createIssue, type BulkIssuePayload } from '../../bulkIssueRegistration/bulkIssueApi';
import {
  applyEmbeddedLinkTargetBlank,
  applyEmbeddedIssueDialogStyles,
  bindIframeEscapeHandler,
  COMPACT_ACTION_BUTTON_HEIGHT,
  COMPACT_ACTION_BUTTON_MIN_WIDTH,
  COMPACT_ICON_BUTTON_SIZE,
  DEFAULT_DIALOG_WIDTH_PX,
  extractIssueIdFromLocationCandidates,
  findEmbeddedIssueForm as findEmbeddedIssueFormElement,
  getEmbeddedDialogDefaultHeight,
  getEmbeddedIssueDialogErrorMessage,
  ISSUE_DIALOG_STYLE_ID,
  MAX_DIALOG_VIEWPORT_HEIGHT_RATIO,
  normalizeEmbeddedFormActions,
  submitEmbeddedIssueForm,
  useEmbeddedIssueDialogLayout
} from '../embeddedIssueDialog';
import {
  buildSubIssueQuery,
  EMBEDDED_DIALOG_BUTTON_FONT_FAMILY,
  EMBEDDED_ISSUE_EDIT_EXTRA_CSS,
  EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS,
  EMBEDDED_ISSUE_VIEW_EXTRA_CSS,
  extractInheritedSubIssueFieldsFromForm,
  type InheritedSubIssueFields,
  syncEmbeddedIssueHeaderState
} from './shared';

type SubIssueCreationDialogProps = {
  projectIdentifier: string;
  parentIssueId: number;
  inheritedFields: InheritedSubIssueFields;
  onCreated?: (createdIssueId?: number) => void;
  onClose: () => void;
};

type IssueEditDialogProps = {
  projectIdentifier: string;
  issueId: number;
  issueUrl: string;
  onSaved?: (updatedIssueId?: number) => void;
  onClose: () => void;
};

type IssueViewDialogProps = {
  projectIdentifier: string;
  issueId: number;
  issueUrl: string;
  inheritedFields?: InheritedSubIssueFields;
  onSaved?: (updatedIssueId?: number) => void;
  onClose: () => void;
};

const createBulkIssues = async (
  projectIdentifier: string,
  parentIssueId: number,
  lines: string[],
  defaults: InheritedSubIssueFields
) => {
  for (const subject of lines) {
    const payload: BulkIssuePayload = { subject, ...defaults };
    await createIssue(projectIdentifier, parentIssueId, payload);
  }
};

const CompactDialogFrame = ({
  children,
  dialogHeightPx,
  onClose
}: {
  children: React.ReactNode;
  dialogHeightPx: number | null;
  onClose: () => void;
}) => (
  <div
    className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4 sm:p-6"
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
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);

export function SubIssueCreationDialog({
  projectIdentifier,
  parentIssueId,
  inheritedFields,
  onCreated,
  onClose
}: SubIssueCreationDialogProps) {
  const issueQuery = useMemo(() => buildSubIssueQuery(parentIssueId, inheritedFields), [inheritedFields, parentIssueId]);
  const iframeUrl = `/projects/${projectIdentifier}/issues/new?${issueQuery}`;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeHeader, setIframeHeader] = useState('');
  const [iframeSubject, setIframeSubject] = useState('');
  const [iframeError, setIframeError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const handledCreationRef = useRef(false);
  const cleanupIframeEscRef = useRef<(() => void) | null>(null);
  const { dialogHeightPx, measureDialogHeight, bindIframeSizeObservers, resetLayout } = useEmbeddedIssueDialogLayout({
    isOpen: true,
    iframeRef,
    headerRef,
    footerRef,
    sectionRef,
    errorRef
  });

  useEffect(() => {
    setIframeReady(false);
    setIframeError(null);
    setIframeHeader('');
    setIframeSubject('');
    handledCreationRef.current = false;
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
    resetLayout();
  }, [iframeUrl, resetLayout]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [onClose]);

  useEffect(() => () => {
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
  }, []);

  const findEmbeddedNewIssueForm = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) throw new Error(t('embeddedIssueForm.formNotLoaded'));

    const form = findEmbeddedIssueFormElement(doc, [
      'form#issue-form',
      'form#new_issue',
      '#issue-form form',
      'form.new_issue'
    ]);
    if (!form) throw new Error(t('embeddedIssueForm.formNotFound'));

    return { doc, form };
  };

  const submitDefaultIssueForm = () => {
    try {
      const { form } = findEmbeddedNewIssueForm();
      const submitter =
        form.querySelector<HTMLElement>('input[name="commit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('button[name="commit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('input[type="submit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('button[type="submit"]:not([disabled])');
      if (submitter) {
        submitter.click();
        return;
      }
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return;
      }
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      if (form.dispatchEvent(submitEvent)) form.submit();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    }
  };

  const createParentIssueFromEmbeddedForm = async (form: HTMLFormElement): Promise<number> => {
    const res = await submitEmbeddedIssueForm(form);
    if (!res.ok) {
      throw new Error(t('embeddedIssueForm.createParentIssueFailed', { status: res.status }));
    }

    const createdIssueId = extractIssueIdFromLocationCandidates([
      res.url,
      res.headers.get('x-response-url'),
      res.headers.get('location')
    ]);
    if (!createdIssueId) {
      throw new Error(t('embeddedIssueForm.createdParentIssueIdNotFound'));
    }
    return createdIssueId;
  };

  const handleSave = async () => {
    const lines = bulkText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    if (lines.length === 0) {
      submitDefaultIssueForm();
      return;
    }

    setIsSubmitting(true);
    try {
      const { form } = findEmbeddedNewIssueForm();
      const defaults = extractInheritedSubIssueFieldsFromForm(form);
      const newParentIssueId = await createParentIssueFromEmbeddedForm(form);
      await createBulkIssues(projectIdentifier, newParentIssueId, lines, defaults);
      setBulkText('');
      setBulkOpen(false);
      onCreated?.(newParentIssueId);
      onClose();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CompactDialogFrame dialogHeightPx={dialogHeightPx} onClose={onClose}>
      <div ref={headerRef} data-testid="sub-issue-dialog-header" className="border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white" style={{ padding: '2px 12px' }}>
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          {iframeHeader ? (
            <span className="text-[14px] font-bold text-slate-800 truncate" title={`${iframeHeader} #${parentIssueId} ${iframeSubject}`}>
              {iframeHeader} #{parentIssueId} {iframeSubject}
            </span>
          ) : (
            <span className="text-[14px] font-bold text-slate-800 truncate">{t('subIssueDialog.iframeTitle')} #{parentIssueId}</span>
          )}
        </div>
        <div className="flex items-center gap-[6px] flex-shrink-0">
          <a href={iframeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors" style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }} title={t('common.openInNewTab')} aria-label={t('common.openInNewTab')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" /></svg>
          </a>
          <button type="button" aria-label={t('timeline.closeCreateIssueDialogAria')} className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer" style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }} onClick={onClose}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 bg-white overflow-hidden">
        {iframeError ? <div ref={errorRef} data-testid="sub-issue-dialog-error" style={{ flex: '0 0 auto', padding: '12px 16px', backgroundColor: '#fdecea', color: '#b71c1c', borderBottom: '1px solid #f5c6cb', fontSize: 13 }}>{iframeError}</div> : null}
        <iframe
          ref={iframeRef}
          title={t('subIssueDialog.iframeTitle')}
          src={iframeUrl}
          className={`absolute inset-0 w-full h-full border-0 bg-white ${iframeReady ? 'opacity-100' : 'opacity-0'}`}
          onLoad={(e) => {
            try {
              const doc = (e.target as HTMLIFrameElement).contentDocument;
              if (!doc) return;

              applyEmbeddedIssueDialogStyles(doc, {
                contentPadding: '16px',
                extraCss: EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS,
                styleId: `${ISSUE_DIALOG_STYLE_ID}-subissue`
              });
              applyEmbeddedLinkTargetBlank(doc);
              setIframeError(getEmbeddedIssueDialogErrorMessage(doc));
              bindIframeSizeObservers(doc);
              cleanupIframeEscRef.current?.();
              cleanupIframeEscRef.current = bindIframeEscapeHandler(doc, onClose);
              normalizeEmbeddedFormActions(doc);

              try {
                syncEmbeddedIssueHeaderState(doc, setIframeHeader, setIframeSubject);
              } catch {
                // Ignore iframe parsing failures.
              }

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
        {!iframeReady ? <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600"></div></div> : null}
      </div>

      <div ref={sectionRef} className="border-t border-slate-200 bg-white flex-shrink-0" style={{ padding: '8px 12px 0 12px' }}>
        <button type="button" className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold bg-transparent border-0 p-0 hover:text-blue-600 transition-colors" onClick={() => setBulkOpen(!bulkOpen)}>
          <span className="inline-block transition-transform duration-200 text-xs" style={{ transform: bulkOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          <span className="text-[13px]">{t('subIssueDialog.bulkSectionTitle')}</span>
        </button>
        {bulkOpen ? <div className="mt-3"><textarea className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[13px] bg-white text-slate-800 resize-y" placeholder={t('subIssueDialog.bulkPlaceholder')} value={bulkText} onChange={(e) => setBulkText(e.target.value)} /></div> : null}
      </div>

      <div ref={footerRef} data-testid="sub-issue-dialog-footer" className="bg-white flex justify-start gap-[6px] flex-shrink-0 items-center" style={{ padding: '2px 12px 4px 12px' }}>
        <button type="button" className="rounded-[6px] border bg-white text-[13px] transition-colors cursor-pointer flex items-center justify-center antialiased" style={{ fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY, height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`, minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`, borderColor: '#cbd5e1', color: '#334155' }} onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="rounded-[6px] text-[13px] font-bold text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center antialiased" style={{ fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY, height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`, minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`, backgroundColor: '#1b69e3', color: '#fff' }} disabled={isSubmitting || !iframeReady} onClick={handleSave}>{isSubmitting ? t('common.saving') : t('common.save')}</button>
      </div>
    </CompactDialogFrame>
  );
}

export function IssueEditDialog({ projectIdentifier, issueId, issueUrl, onSaved, onClose }: IssueEditDialogProps) {
  const iframeUrl = `${issueUrl}/edit`;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [iframeHeader, setIframeHeader] = useState('');
  const [iframeSubject, setIframeSubject] = useState('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const saveInFlightRef = useRef(false);
  const cleanupIframeEscRef = useRef<(() => void) | null>(null);
  const cleanupEmbeddedSubmitRef = useRef<(() => void) | null>(null);
  const { dialogHeightPx, measureDialogHeight, bindIframeSizeObservers, resetLayout } = useEmbeddedIssueDialogLayout({
    isOpen: true,
    iframeRef,
    headerRef,
    footerRef,
    sectionRef,
    errorRef
  });

  useEffect(() => {
    setIframeReady(false);
    setIframeError(null);
    setIframeHeader('');
    setIframeSubject('');
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
    cleanupEmbeddedSubmitRef.current?.();
    cleanupEmbeddedSubmitRef.current = null;
    resetLayout();
  }, [iframeUrl, resetLayout]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [onClose]);

  useEffect(() => () => {
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
    cleanupEmbeddedSubmitRef.current?.();
    cleanupEmbeddedSubmitRef.current = null;
  }, []);

  const findEmbeddedIssueForm = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) throw new Error(t('embeddedIssueForm.formNotLoaded'));
    const form = findEmbeddedIssueFormElement(doc);
    if (!form) throw new Error(t('embeddedIssueForm.formNotFound'));
    return { doc, form };
  };

  const parseEmbeddedIssueDocument = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');
  const hasEmbeddedIssueForm = (doc: Document) => Boolean(findEmbeddedIssueFormElement(doc));

  const bindEmbeddedIssueFormSubmit = (doc: Document) => {
    cleanupEmbeddedSubmitRef.current?.();
    cleanupEmbeddedSubmitRef.current = null;

    const form = findEmbeddedIssueFormElement(doc);
    if (!form) return;

    const handleSubmit = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      void handleSave();
    };

    form.addEventListener('submit', handleSubmit);
    cleanupEmbeddedSubmitRef.current = () => {
      form.removeEventListener('submit', handleSubmit);
    };
  };

  const syncEmbeddedIssueFrame = (doc: Document) => {
    applyEmbeddedIssueDialogStyles(doc, {
      contentPadding: '16px',
      extraCss: EMBEDDED_ISSUE_EDIT_EXTRA_CSS,
      styleId: `${ISSUE_DIALOG_STYLE_ID}-edit`
    });
    applyEmbeddedLinkTargetBlank(doc);
    setIframeError(getEmbeddedIssueDialogErrorMessage(doc));
    bindIframeSizeObservers(doc);

    try {
      syncEmbeddedIssueHeaderState(doc, setIframeHeader, setIframeSubject);
    } catch {
      // Ignore iframe parsing failures.
    }

    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = bindIframeEscapeHandler(doc, onClose);
    normalizeEmbeddedFormActions(doc);
    bindEmbeddedIssueFormSubmit(doc);

    requestAnimationFrame(() => {
      setIframeReady(true);
      measureDialogHeight();
    });
  };

  const renderValidationResponseInIframe = (html: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    try {
      doc.open();
      doc.write(html);
      doc.close();
    } catch {
      return;
    }
    syncEmbeddedIssueFrame(doc);
  };

  const saveEditedIssueFromEmbeddedForm = async (): Promise<
    | { kind: 'saved'; issueId: number }
    | { kind: 'validation-error'; errorMessage: string | null }
  > => {
    const { form } = findEmbeddedIssueForm();
    const action = form.getAttribute('action') || `/issues/${issueId}`;
    const res = await submitEmbeddedIssueForm(form);

    const updatedIssueId = extractIssueIdFromLocationCandidates([
      res.url,
      res.headers.get('x-response-url'),
      res.headers.get('location'),
      action
    ]) || issueId;

    if (res.redirected && res.ok) {
      return { kind: 'saved', issueId: updatedIssueId };
    }

    const responseHtml = await res.text();
    const responseDoc = parseEmbeddedIssueDocument(responseHtml);
    const validationMessage = getEmbeddedIssueDialogErrorMessage(responseDoc);

    if (validationMessage || hasEmbeddedIssueForm(responseDoc)) {
      renderValidationResponseInIframe(responseHtml);
      return { kind: 'validation-error', errorMessage: validationMessage };
    }

    if (!res.ok) {
      throw new Error(t('common.alertError', { message: `status=${res.status}` }));
    }

    return { kind: 'saved', issueId: updatedIssueId };
  };

  const handleSave = async () => {
    const lines = bulkText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const { form } = findEmbeddedIssueForm();
      const saveResult = await saveEditedIssueFromEmbeddedForm();
      if (saveResult.kind === 'validation-error') return;

      if (lines.length > 0) {
        const defaults = extractInheritedSubIssueFieldsFromForm(form);
        await createBulkIssues(projectIdentifier, saveResult.issueId, lines, defaults);
        setBulkText('');
        setBulkOpen(false);
      }

      onSaved?.(saveResult.issueId);
      onClose();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    } finally {
      saveInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <CompactDialogFrame dialogHeightPx={dialogHeightPx} onClose={onClose}>
      <div ref={headerRef} data-testid="edit-issue-dialog-header" className="border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white" style={{ padding: '2px 12px' }}>
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          {iframeHeader ? (
            <span className="text-[14px] font-bold text-slate-800 truncate" title={`${iframeHeader} ${iframeSubject}`}>{iframeHeader} {iframeSubject}</span>
          ) : (
            <>
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0 text-[10px] font-semibold text-slate-600">#{issueId}</span>
              <span className="text-[14px] font-bold text-slate-800 truncate">{t('timeline.editIssueDialogTitle')}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-[6px] flex-shrink-0">
          <a href={iframeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors" style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }} title={t('common.openInNewTab')} aria-label={t('common.openInNewTab')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" /></svg>
          </a>
          <button type="button" aria-label={t('timeline.closeEditIssueDialogAria')} className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer" style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }} onClick={onClose}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 bg-white overflow-hidden">
        {iframeError ? <div ref={errorRef} data-testid="edit-issue-dialog-error" style={{ flex: '0 0 auto', padding: '12px 16px', backgroundColor: '#fdecea', color: '#b71c1c', borderBottom: '1px solid #f5c6cb', fontSize: 13 }}>{iframeError}</div> : null}
        <iframe ref={iframeRef} title={t('timeline.editIssueDialogTitle')} src={iframeUrl} className={`absolute inset-0 w-full h-full border-0 bg-white ${iframeReady ? 'opacity-100' : 'opacity-0'}`} onLoad={(e) => {
          try {
            const doc = (e.target as HTMLIFrameElement).contentDocument;
            if (!doc) return;
            syncEmbeddedIssueFrame(doc);
          } catch {
            setIframeError(null);
          }
        }} />
        {!iframeReady ? <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600"></div></div> : null}
      </div>
      <div ref={sectionRef} className="border-t border-slate-200 bg-white flex-shrink-0" style={{ padding: '8px 12px 0 12px' }}>
        <button type="button" className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold bg-transparent border-0 p-0 hover:text-blue-600 transition-colors" onClick={() => setBulkOpen(!bulkOpen)}>
          <span className="inline-block transition-transform duration-200 text-xs" style={{ transform: bulkOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          <span className="text-[13px]">{t('subIssueDialog.bulkSectionTitle')}</span>
        </button>
        {bulkOpen ? <div className="mt-3"><textarea className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[13px] bg-white text-slate-800 resize-y" placeholder={t('subIssueDialog.bulkPlaceholder')} value={bulkText} onChange={(e) => setBulkText(e.target.value)} /></div> : null}
      </div>
      <div ref={footerRef} data-testid="edit-issue-dialog-footer" className="bg-white flex justify-start gap-[6px] flex-shrink-0 items-center" style={{ padding: '2px 12px 4px 12px' }}>
        <button type="button" className="rounded-[6px] border bg-white text-[13px] transition-colors cursor-pointer flex items-center justify-center antialiased" style={{ fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY, height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`, minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`, borderColor: '#cbd5e1', color: '#334155' }} onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="rounded-[6px] text-[13px] font-bold text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center antialiased" style={{ fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY, height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`, minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`, backgroundColor: '#1b69e3', color: '#fff' }} disabled={isSubmitting || !iframeReady} onClick={handleSave}>{isSubmitting ? t('common.saving') : t('common.save')}</button>
      </div>
    </CompactDialogFrame>
  );
}

export function IssueViewDialog({ projectIdentifier, issueId, issueUrl, inheritedFields = {}, onSaved, onClose }: IssueViewDialogProps) {
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [iframeHeader, setIframeHeader] = useState('');
  const [iframeSubject, setIframeSubject] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const cleanupIframeEscRef = useRef<(() => void) | null>(null);
  const handledSaveRef = useRef(false);
  const awaitingRedirectRef = useRef(false);
  const { dialogHeightPx, measureDialogHeight, bindIframeSizeObservers, resetLayout } = useEmbeddedIssueDialogLayout({
    isOpen: true,
    iframeRef,
    headerRef,
    footerRef,
    errorRef,
    sectionRef
  });

  useEffect(() => {
    setIframeReady(false);
    setIframeError(null);
    setIframeHeader('');
    setIframeSubject('');
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
    handledSaveRef.current = false;
    awaitingRedirectRef.current = false;
    resetLayout();
  }, [issueUrl, resetLayout]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [onClose]);

  useEffect(() => () => {
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
  }, []);

  const findEmbeddedIssueForm = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) throw new Error(t('embeddedIssueForm.formNotLoaded'));
    const form = findEmbeddedIssueFormElement(doc);
    if (!form) throw new Error(t('embeddedIssueForm.formNotFound'));
    return { doc, form };
  };

  const submitDefaultIssueForm = () => {
    try {
      const { form } = findEmbeddedIssueForm();
      const submitter =
        form.querySelector<HTMLElement>('input[name="commit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('button[name="commit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('input[type="submit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('button[type="submit"]:not([disabled])');
      if (submitter) {
        submitter.click();
        return;
      }
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return;
      }
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      if (form.dispatchEvent(submitEvent)) form.submit();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    }
  };

  const handleSave = async () => {
    const lines = bulkText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        awaitingRedirectRef.current = true;
        submitDefaultIssueForm();
        return;
      }
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await createBulkIssues(projectIdentifier, issueId, lines, inheritedFields);
      setBulkText('');
      setBulkOpen(false);
      onSaved?.(issueId);
      onClose();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CompactDialogFrame dialogHeightPx={dialogHeightPx} onClose={onClose}>
      <div ref={headerRef} data-testid="view-issue-dialog-header" className="border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white" style={{ padding: '2px 12px' }}>
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          {iframeHeader ? <span className="text-[14px] font-bold text-slate-800 truncate" title={`${iframeHeader} ${iframeSubject}`}>{iframeHeader} {iframeSubject}</span> : <><span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0 text-[10px] font-semibold text-slate-600">#{issueId}</span><span className="text-[14px] font-bold text-slate-800 truncate">{t('timeline.viewIssueDialogTitle')}</span></>}
        </div>
        <div className="flex items-center gap-[6px] flex-shrink-0">
          <a href={issueUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors" style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }} title={t('common.openInNewTab')} aria-label={t('common.openInNewTab')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" /></svg>
          </a>
          <button type="button" aria-label={t('timeline.closeDialogAria')} className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer" style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }} onClick={onClose}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 bg-white overflow-hidden">
        {iframeError ? <div ref={errorRef} data-testid="view-issue-dialog-error" style={{ flex: '0 0 auto', padding: '12px 16px', backgroundColor: '#fdecea', color: '#b71c1c', borderBottom: '1px solid #f5c6cb', fontSize: 13 }}>{iframeError}</div> : null}
        <iframe ref={iframeRef} title={t('timeline.viewIssueDialogTitle')} src={issueUrl} className={`absolute inset-0 w-full h-full border-0 bg-white ${iframeReady ? 'opacity-100' : 'opacity-0'}`} onLoad={(e) => {
          try {
            const doc = (e.target as HTMLIFrameElement).contentDocument;
            if (!doc) return;
            const iframeErrorMessage = getEmbeddedIssueDialogErrorMessage(doc);
            applyEmbeddedIssueDialogStyles(doc, {
              contentPadding: '16px',
              extraCss: EMBEDDED_ISSUE_VIEW_EXTRA_CSS,
              styleId: `${ISSUE_DIALOG_STYLE_ID}-view`
            });
            applyEmbeddedLinkTargetBlank(doc);
            setIframeError(iframeErrorMessage);
            bindIframeSizeObservers(doc);

            const pathname = doc.location?.pathname || '';
            if (!handledSaveRef.current && awaitingRedirectRef.current && new RegExp(`^/issues/${issueId}(?:[/?#]|$)`).test(pathname) && !iframeErrorMessage) {
              handledSaveRef.current = true;
              awaitingRedirectRef.current = false;
              onSaved?.(issueId);
              onClose();
              return;
            }

            try {
              syncEmbeddedIssueHeaderState(doc, setIframeHeader, setIframeSubject);
            } catch {
              // Ignore iframe parsing failures.
            }
            cleanupIframeEscRef.current?.();
            cleanupIframeEscRef.current = bindIframeEscapeHandler(doc, onClose);
          } catch {
            setIframeError(null);
          }
          requestAnimationFrame(() => {
            setIframeReady(true);
            measureDialogHeight();
          });
        }} />
        {!iframeReady ? <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600"></div></div> : null}
      </div>
      <div ref={sectionRef} className="border-t border-slate-200 bg-white flex-shrink-0" style={{ padding: '8px 12px 0 12px' }}>
        <button type="button" className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold bg-transparent border-0 p-0 hover:text-blue-600 transition-colors" onClick={() => setBulkOpen(!bulkOpen)}>
          <span className="inline-block transition-transform duration-200 text-xs" style={{ transform: bulkOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          <span className="text-[13px]">{t('subIssueDialog.bulkSectionTitle')}</span>
        </button>
        {bulkOpen ? <div className="mt-3"><textarea className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[13px] bg-white text-slate-800 resize-y" placeholder={t('subIssueDialog.bulkPlaceholder')} value={bulkText} onChange={(e) => setBulkText(e.target.value)} /></div> : null}
      </div>
      <div ref={footerRef} data-testid="view-issue-dialog-footer" className="bg-white flex justify-start gap-[6px] flex-shrink-0 items-center border-t border-slate-200" style={{ padding: '8px 12px 12px 12px' }}>
        <button type="button" className="rounded-[6px] border bg-white text-[13px] transition-colors cursor-pointer flex items-center justify-center antialiased" style={{ fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY, height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`, minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`, borderColor: '#cbd5e1', color: '#334155' }} onClick={onClose}>{t('common.close')}</button>
        <button type="button" className="rounded-[6px] border text-[13px] transition-colors cursor-pointer flex items-center justify-center antialiased" style={{ fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY, height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`, minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`, borderColor: '#2563eb', backgroundColor: '#1b69e3', color: '#fff' }} disabled={isSubmitting || !iframeReady} onClick={handleSave}>{isSubmitting ? t('common.saving') : t('common.save')}</button>
      </div>
    </CompactDialogFrame>
  );
}
