import React, { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n';

const EMBEDDED_DIALOG_BUTTON_FONT_FAMILY = "'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif";
const EMBEDDED_DIALOG_FOOTER_BUTTON_STYLE = {
    fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY,
    height: '28px'
} as const;
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
    onClose
}: CreateDestinationIssueDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [iframeReady, setIframeReady] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const handledCreationRef = useRef(false);

    // Pre-fill description
    const descriptionText = t('embeddedIssueForm.descriptionForAiResponse');

    const issueQuery = new URLSearchParams();
    issueQuery.set('issue[description]', descriptionText);

    const iframeUrl = `/projects/${projectIdentifier}/issues/new?${issueQuery.toString()}`;
    const externalUrl = `/projects/${projectIdentifier}/issues/new?${issueQuery.toString()}`;

    useEffect(() => {
        setIframeReady(false);
        handledCreationRef.current = false;
    }, [iframeUrl]);

    const submitDefaultIssueForm = () => {
        try {
            const doc = iframeRef.current?.contentDocument;
            if (!doc) throw new Error(t('embeddedIssueForm.formNotLoaded'));
            const form =
                doc.querySelector<HTMLFormElement>('form#issue-form') ||
                doc.querySelector<HTMLFormElement>('form#new_issue') ||
                doc.querySelector<HTMLFormElement>('#issue-form form') ||
                doc.querySelector<HTMLFormElement>('form.new_issue');

            if (!form) throw new Error(t('embeddedIssueForm.formNotFound'));

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
            if (form.dispatchEvent(submitEvent)) {
                form.submit();
            }
        } catch (err: any) {
            alert(t('common.alertError', { message: err.message }));
        }
    };

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
            body: formData
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
        <div className="fixed inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
            <div className="bg-white w-full max-w-[95vw] h-[95vh] rounded-2xl shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 py-1.5 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="p-1 bg-indigo-100 rounded-md">
                            <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800">
                            {t('destinationIssueDialog.title')}
                        </h4>
                    </div>
                    <div className="flex items-center gap-1">
                        <a
                            href={externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                            title={t('common.openInNewTab')}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" />
                            </svg>
                        </a>
                        <button
                            type="button"
                            aria-label={t('destinationIssueDialog.closeAria')}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
                            onClick={onClose}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Iframe */}
                <div className="relative flex-1 min-h-[400px] bg-white">
                    <iframe
                        ref={iframeRef}
                        title={t('destinationIssueDialog.iframeTitle')}
                        src={iframeUrl}
                        className={`absolute inset-0 w-full h-full border-0 bg-white ${iframeReady ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={(e) => {
                            try {
                                const doc = (e.target as HTMLIFrameElement).contentDocument;
                                if (!doc) return;

                                // Hide typical redmine chrome completely so we only see the form area
                                const style = doc.createElement('style');
                                style.textContent = `
                  #header,
                  #top-menu,
                  #main-menu,
                  #sidebar,
                  #footer,
                  #redmine-report-bulk-issue-creation-root {
                    display: none !important;
                  }
                  html,
                  body {
                    overflow-x: hidden !important;
                    background-color: white !important;
                  }
                  #wrapper,
                  #main,
                  #content {
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                    background-color: white !important;
                  }
	                  #content {
	                    padding: 24px 32px !important;
	                  }
${EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS}
                  
                  /* Hide default redmine submit buttons, to replace with our custom dialog buttons */
                  #issue-form input[name="commit"],
                  #issue-form button[name="commit"],
                  #issue-form input[name="continue"],
                  #issue-form button[name="continue"],
                  #new_issue input[name="commit"],
                  #new_issue button[name="commit"],
                  #new_issue input[name="continue"],
                  #new_issue button[name="continue"],
                  #issue-form input[type="submit"] {
                    display: none !important;
                  }
                  #new_issue input[type="submit"] {
                    display: none !important;
                  }
                                `;
                                doc.head.appendChild(style);
                                normalizeEmbeddedFormActions(doc);

                                const pathname = doc.location?.pathname || '';
                                // If the URL becomes like /issues/1234, creation must be completed!
                                if (!handledCreationRef.current && /^\/issues\/\d+(?:\/)?$/.test(pathname)) {
                                    handledCreationRef.current = true;
                                    const createdIssueId = Number(pathname.split('/').pop());
                                    onCreated?.(Number.isFinite(createdIssueId) ? createdIssueId : undefined);
                                    onClose();
                                    return;
                                }
                            } catch { /* cross origin fallback */ }

                            requestAnimationFrame(() => setIframeReady(true));
                        }}
                    />
                    {!iframeReady && (
                        <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none">
                            <div className="flex flex-col items-center gap-3">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                <div className="text-xs text-slate-500 font-medium tracking-wide">{t('embeddedIssueForm.dialogLoading')}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="border-t border-slate-200 px-6 py-1.5 flex-shrink-0 bg-slate-50 border-t-1">
                    <div className="flex justify-start gap-2">
                        <button
                            type="button"
                            className="rounded-[6px] border bg-white px-4 text-[12px] font-medium transition-colors cursor-pointer flex items-center justify-center antialiased hover:bg-slate-50"
                            style={{
                                ...EMBEDDED_DIALOG_FOOTER_BUTTON_STYLE,
                                width: '88px',
                                borderColor: '#cbd5e1',
                                color: '#334155'
                            }}
                            onClick={onClose}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            className="rounded-[6px] px-4 text-[12px] font-bold text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center antialiased hover:bg-blue-700"
                            style={{
                                ...EMBEDDED_DIALOG_FOOTER_BUTTON_STYLE,
                                width: '86px',
                                backgroundColor: '#1b69e3',
                                color: '#fff'
                            }}
                            disabled={isSubmitting || !iframeReady}
                            onClick={handleSave}
                        >
                            {isSubmitting ? t('common.saving') : t('common.save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
