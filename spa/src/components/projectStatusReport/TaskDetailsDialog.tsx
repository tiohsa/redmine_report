import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import {
  fetchTaskDetails,
  TaskDetailIssue,
  updateTaskDates,
  WeeklyApiError
} from '../../services/scheduleReportApi';
import { createIssue, BulkIssuePayload } from '../bulkIssueRegistration/bulkIssueApi';

type TaskDetailsDialogProps = {
  open: boolean;
  projectIdentifier: string;
  issueId: number;
  issueTitle?: string;
  onTaskDatesUpdated?: () => void;
  onClose: () => void;
};

type TreeNodeType = TaskDetailIssue & { children: TreeNodeType[] };

type IssueTreeNodeProps = {
  node: TreeNodeType;
  depth: number;
  activeLines: boolean[];
  isLast: boolean;
  rootIssueId: number;
  savingIssueIds: Record<number, boolean>;
  handleDateChange: (row: TaskDetailIssue, key: 'start_date' | 'due_date', value: string) => void;
  onAddSubIssue: (parentIssue: TaskDetailIssue) => void;
};

const IssueTreeNode = ({
  node,
  depth,
  activeLines,
  isLast,
  rootIssueId,
  savingIssueIds,
  handleDateChange,
  onAddSubIssue
}: IssueTreeNodeProps) => {
  const saving = Boolean(savingIssueIds[node.issue_id]);
  const progressRatio = Math.max(0, Math.min(100, Number(node.done_ratio ?? 0)));
  const isDone = progressRatio === 100;

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center py-2 hover:bg-slate-50 transition-colors relative group px-6">
        {/* Vertical lines from ancestors */}
        {activeLines.map((isActive, level) => (
          isActive ? (
            <div
              key={level}
              className="absolute top-0 bottom-0 border-l border-slate-200 pointer-events-none"
              style={{ left: `${level * 24 + 40}px` }}
            />
          ) : null
        ))}

        {/* L-shape/T-shape for current node */}
        {depth > 0 && (
          <>
            {/* Vertical */}
            <div
              className="absolute border-l border-slate-200 pointer-events-none"
              style={{
                left: `${(depth - 1) * 24 + 40}px`,
                top: 0,
                bottom: isLast ? 'calc(100% - 24px)' : 0
              }}
            />
            {/* Horizontal */}
            <div
              className="absolute border-b border-slate-200 pointer-events-none"
              style={{
                left: `${(depth - 1) * 24 + 40}px`,
                top: 0,
                height: '24px',
                width: '16px'
              }}
            />
          </>
        )}

        {/* TASK Column */}
        <div className="w-full md:flex-1 flex items-center min-w-0" style={{ paddingLeft: `${depth * 24}px` }}>
          <div className="flex items-center min-w-0 pr-4 z-10 w-full relative">
            <span className="flex-shrink-0 bg-slate-100 text-slate-500 text-xs font-[700] px-2 py-1 rounded mr-3">
              #{node.issue_id}
            </span>

            <div className="min-w-0 flex items-center flex-1">
              <a href={node.issue_url} target="_blank" rel="noreferrer" className={`text-sm ${depth === 0 ? 'font-bold' : 'font-medium'} text-slate-800 truncate hover:underline hover:text-indigo-600 block mr-2`}>
                {node.subject}
              </a>

              {/* Add Sub-ticket Icon (visible on row hover) */}
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all cursor-pointer flex-shrink-0"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAddSubIssue(node);
                }}
                title="子チケットを追加"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* DURATION Column */}
        <div className="flex flex-row items-center justify-center gap-2 mt-3 md:mt-0 w-[240px] flex-shrink-0 md:mr-4">
          <div className="relative w-[110px]">
            <div className="absolute inset-0 flex items-center px-2 pointer-events-none z-0">
              <span className="text-slate-300 text-[11px] font-mono tracking-tighter">{node.start_date ? '' : 'yyyy/mm/dd'}</span>
            </div>
            <input
              type="date"
              value={node.start_date || ''}
              onChange={(event) => handleDateChange(node, 'start_date', event.target.value)}
              disabled={saving}
              className={`block w-full rounded-md border border-slate-200 py-1.5 pl-2 pr-6 text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 cursor-pointer appearance-none bg-transparent font-mono transition-colors z-10 relative ${node.start_date ? 'text-slate-700 font-bold' : 'text-transparent'}`}
              style={{ colorScheme: 'light' }}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none z-20">
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>
          <span className="text-slate-300 font-medium text-sm flex-shrink-0">-</span>
          <div className="relative w-[110px]">
            <div className="absolute inset-0 flex items-center px-2 pointer-events-none z-0">
              <span className="text-slate-300 text-[11px] font-mono tracking-tighter">{node.due_date ? '' : 'yyyy/mm/dd'}</span>
            </div>
            <input
              type="date"
              value={node.due_date || ''}
              onChange={(event) => handleDateChange(node, 'due_date', event.target.value)}
              disabled={saving}
              className={`block w-full rounded-md border border-slate-200 py-1.5 pl-2 pr-6 text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 cursor-pointer appearance-none bg-transparent font-mono transition-colors z-10 relative ${node.due_date ? 'text-slate-700 font-bold' : 'text-transparent'}`}
              style={{ colorScheme: 'light' }}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none z-20">
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>
        </div>

        {/* PROG Column */}
        <div className="flex items-center w-[120px] flex-shrink-0 mt-3 md:mt-0 gap-3 justify-end pr-2">
          <div className="h-4 flex-1 max-w-[50px] flex-shrink-0 overflow-hidden rounded-[2px] bg-slate-100 border border-slate-200 box-border relative">
            <div className={`absolute left-0 top-0 bottom-0 transition-all ${isDone ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progressRatio}%` }} />
          </div>
          <span className={`w-8 text-right text-xs font-bold ${isDone ? 'text-emerald-600' : 'text-slate-600'}`}>
            {Math.round(progressRatio)}%
          </span>
        </div>
      </div>

      {node.children.map((child, idx) => (
        <IssueTreeNode
          key={child.issue_id}
          node={child}
          depth={depth + 1}
          activeLines={[...activeLines, !isLast]}
          isLast={idx === node.children.length - 1}
          rootIssueId={rootIssueId}
          savingIssueIds={savingIssueIds}
          handleDateChange={handleDateChange}
          onAddSubIssue={onAddSubIssue}
        />
      ))}
    </>
  );
};

type SubIssueCreationDialogProps = {
  projectIdentifier: string;
  parentIssueId: number;
  parentStartDate?: string | null;
  parentDueDate?: string | null;
  onCreated?: (createdIssueId?: number) => void;
  onClose: () => void;
};

function SubIssueCreationDialog({
  projectIdentifier,
  parentIssueId,
  parentStartDate,
  parentDueDate,
  onCreated,
  onClose
}: SubIssueCreationDialogProps) {
  const issueQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('issue[parent_issue_id]', String(parentIssueId));
    if (parentStartDate) {
      params.set('issue[start_date]', parentStartDate);
      params.set('start_date', parentStartDate);
    }
    if (parentDueDate) {
      params.set('issue[due_date]', parentDueDate);
      params.set('due_date', parentDueDate);
    }
    return params.toString();
  }, [parentDueDate, parentIssueId, parentStartDate]);

  const iframeUrl = `/projects/${projectIdentifier}/issues/new?${issueQuery}`;
  const externalUrl = `/projects/${projectIdentifier}/issues/new?${issueQuery}`;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const handledCreationRef = useRef(false);

  useEffect(() => {
    setIframeReady(false);
    handledCreationRef.current = false;
  }, [iframeUrl]);

  const createBulkIssues = async (newParentIssueId: number, lines: string[]) => {
    for (const subject of lines) {
      const payload: BulkIssuePayload = { subject };
      await createIssue(projectIdentifier, newParentIssueId, payload);
    }
  };

  const submitDefaultIssueForm = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) throw new Error('フォームがまだ読み込まれていません。');
      const form =
        doc.querySelector<HTMLFormElement>('form#issue-form') ||
        doc.querySelector<HTMLFormElement>('form#new_issue') ||
        doc.querySelector<HTMLFormElement>('#issue-form form') ||
        doc.querySelector<HTMLFormElement>('form.new_issue');
      if (!form) throw new Error('Redmineの作成フォームが見つかりません。');
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
      alert(`エラーが発生しました: ${err.message}`);
    }
  };

  const createParentIssueFromEmbeddedForm = async (): Promise<number> => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) throw new Error('フォームがまだ読み込まれていません。');

    const form =
      doc.querySelector<HTMLFormElement>('form#issue-form') ||
      doc.querySelector<HTMLFormElement>('form#new_issue') ||
      doc.querySelector<HTMLFormElement>('#issue-form form') ||
      doc.querySelector<HTMLFormElement>('form.new_issue');
    if (!form) throw new Error('Redmineの作成フォームが見つかりません。');

    const action = form.getAttribute('action') || '/issues';
    const method = (form.getAttribute('method') || 'post').toUpperCase();
    const formData = new FormData(form);
    const res = await fetch(action, {
      method,
      credentials: 'same-origin',
      body: formData
    });
    if (!res.ok) {
      throw new Error(`親チケット作成に失敗しました (HTTP ${res.status})`);
    }

    const locationCandidates = [res.url, res.headers.get('x-response-url') || '', res.headers.get('location') || ''];
    const createdIssueId = locationCandidates
      .map((url) => url.match(/\/issues\/(\d+)(?:[/?#]|$)/))
      .find((match): match is RegExpMatchArray => Boolean(match && match[1]));

    if (!createdIssueId) {
      throw new Error('親チケットIDを取得できませんでした。入力内容に不備がないか確認してください。');
    }
    return Number(createdIssueId[1]);
  };

  const handleSave = async () => {
    const lines = bulkText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    if (lines.length === 0) {
      submitDefaultIssueForm();
      return;
    }

    setIsSubmitting(true);
    try {
      const newParentIssueId = await createParentIssueFromEmbeddedForm();
      await createBulkIssues(newParentIssueId, lines);
      setBulkText('');
      setBulkOpen(false);
      onCreated?.(newParentIssueId);
      onClose();
    } catch (err: any) {
      alert(`エラーが発生しました: ${err.message}`);
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
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="bg-white w-full max-w-[95vw] h-[95vh] rounded-2xl shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h4 className="text-base font-bold text-slate-800">
            #{parentIssueId}
          </h4>
          <div className="flex items-center gap-1">
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              title="新しいタブで開く"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" />
              </svg>
            </a>
            <button
              type="button"
              aria-label="新規チケット作成ダイアログを閉じる"
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              onClick={onClose}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Iframe showing Redmine's default new issue form */}
        <div className="relative flex-1 min-h-[400px] bg-white">
          <iframe
            ref={iframeRef}
            title="子チケット新規登録"
            src={iframeUrl}
            className={`absolute inset-0 w-full h-full border-0 bg-white ${iframeReady ? 'opacity-100' : 'opacity-0'}`}
            onLoad={(e) => {
              try {
                const doc = (e.target as HTMLIFrameElement).contentDocument;
                if (!doc) return;

                // Keep Redmine's issue form visible and hide only outer chrome.
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
                  }
                  #wrapper,
                  #main,
                  #content {
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                  }
                  #content {
                    padding: 12px 16px !important;
                  }
                  #issue-form p.buttons,
                  #new_issue p.buttons {
                    position: absolute !important;
                    width: 1px !important;
                    height: 1px !important;
                    margin: -1px !important;
                    padding: 0 !important;
                    border: 0 !important;
                    overflow: hidden !important;
                    clip: rect(0 0 0 0) !important;
                    clip-path: inset(50%) !important;
                    white-space: nowrap !important;
                  }
                `;
                doc.head.appendChild(style);
                normalizeEmbeddedFormActions(doc);

                const pathname = doc.location?.pathname || '';
                if (!handledCreationRef.current && /^\/issues\/\d+(?:\/)?$/.test(pathname)) {
                  handledCreationRef.current = true;
                  const createdIssueId = Number(pathname.split('/').pop());
                  onCreated?.(Number.isFinite(createdIssueId) ? createdIssueId : undefined);
                  onClose();
                  return;
                }
              } catch { /* cross-origin fallback: do nothing */ }
              requestAnimationFrame(() => setIframeReady(true));
            }}
          />
          {!iframeReady && (
            <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600"></div>
            </div>
          )}
        </div>

        {/* Bulk Ticket Creation Section */}
        <div className="border-t border-slate-200 px-5 py-3 flex-shrink-0">
          <button
            type="button"
            className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold bg-transparent border-0 p-0 hover:text-blue-600 transition-colors"
            onClick={() => setBulkOpen(!bulkOpen)}
          >
            <span
              className="inline-block transition-transform duration-200 text-xs"
              style={{ transform: bulkOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              ▶
            </span>
            <span className="text-[13px]">Bulk Ticket Creation</span>
          </button>

          {bulkOpen && (
            <div className="mt-3">
              <textarea
                className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[13px] bg-white text-slate-800 resize-y"
                placeholder="Enter one ticket subject per line..."
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-3">
            <button
              type="button"
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-[13px] py-1.5 px-5 rounded shadow-sm transition-colors cursor-pointer"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] py-1.5 px-5 rounded shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
              disabled={isSubmitting || !iframeReady}
              onClick={handleSave}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskDetailsDialog({
  open,
  projectIdentifier,
  issueId,
  issueTitle,
  onTaskDatesUpdated,
  onClose
}: TaskDetailsDialogProps) {
  const [issues, setIssues] = useState<TaskDetailIssue[]>([]);
  const [baselineById, setBaselineById] = useState<Record<number, TaskDetailIssue>>({});
  const [savingIssueIds, setSavingIssueIds] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createIssueContext, setCreateIssueContext] = useState<{
    issueId: number;
    startDate: string | null;
    dueDate: string | null;
  } | null>(null);
  const issuesRef = useRef<TaskDetailIssue[]>([]);
  const baselineByIdRef = useRef<Record<number, TaskDetailIssue>>({});
  const savingIssueIdsRef = useRef<Record<number, boolean>>({});
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const hasDateChangesRef = useRef(false);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const reloadTaskDetails = useCallback(async (expectedIssueId?: number) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      let latestRows: TaskDetailIssue[] = [];
      const maxAttempts = expectedIssueId ? 3 : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        latestRows = await fetchTaskDetails(projectIdentifier, issueId);
        const found = !expectedIssueId || latestRows.some((row) => row.issue_id === expectedIssueId);
        if (found) break;
        if (attempt < maxAttempts - 1) {
          await sleep(250);
        }
      }

      setIssues(latestRows);
      setBaselineById(latestRows.reduce<Record<number, TaskDetailIssue>>((acc, row) => {
        acc[row.issue_id] = row;
        return acc;
      }, {}));
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : t('timeline.detailsLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [issueId, projectIdentifier]);

  const handleClose = useCallback(() => {
    if (hasDateChangesRef.current) {
      onTaskDatesUpdated?.();
      hasDateChangesRef.current = false;
    }
    setCreateIssueContext(null);
    onClose();
  }, [onClose, onTaskDatesUpdated]);

  useEffect(() => {
    if (!open) return;
    hasDateChangesRef.current = false;

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) return;
    void reloadTaskDetails().catch(() => {
      // Errors are handled in reloadTaskDetails.
    });
  }, [open, reloadTaskDetails]);

  useEffect(() => {
    issuesRef.current = issues;
  }, [issues]);

  useEffect(() => {
    baselineByIdRef.current = baselineById;
  }, [baselineById]);

  useEffect(() => {
    savingIssueIdsRef.current = savingIssueIds;
  }, [savingIssueIds]);

  useEffect(() => () => {
    Object.values(saveTimersRef.current).forEach((timer) => clearTimeout(timer));
    saveTimersRef.current = {};
  }, []);

  const treeRoots = useMemo(() => {
    const map = new Map<number, TreeNodeType>();
    issues.forEach(issue => {
      map.set(issue.issue_id, { ...issue, children: [] });
    });

    const roots: TreeNodeType[] = [];
    issues.forEach(issue => {
      const node = map.get(issue.issue_id)!;
      if (issue.parent_id && map.has(issue.parent_id)) {
        map.get(issue.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }, [issues]);

  const dialogTitle = useMemo(() => {
    if (!issueTitle) return t('timeline.ticketTitle', { id: issueId, suffix: '' });
    return t('timeline.ticketTitle', { id: issueId, suffix: `: ${issueTitle}` });
  }, [issueId, issueTitle]);

  const isRowDirty = (row: TaskDetailIssue) => {
    const baseline = baselineByIdRef.current[row.issue_id];
    if (!baseline) return false;
    return baseline.start_date !== row.start_date || baseline.due_date !== row.due_date;
  };

  const saveRow = async (row: TaskDetailIssue) => {
    setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: true }));
    setErrorMessage(null);
    try {
      const updated = await updateTaskDates(projectIdentifier, row.issue_id, {
        start_date: row.start_date,
        due_date: row.due_date
      });
      // Preserve parent_id in the updated row
      updated.parent_id = row.parent_id;
      setIssues((prev) => prev.map((item) => (item.issue_id === updated.issue_id ? updated : item)));
      setBaselineById((prev) => ({ ...prev, [updated.issue_id]: updated }));
      hasDateChangesRef.current = true;
    } catch (error: unknown) {
      const message =
        error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : t('api.updateTaskDates', { status: 500 });
      setErrorMessage(message);
    } finally {
      setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: false }));
    }
  };

  const handleDateChange = (row: TaskDetailIssue, key: 'start_date' | 'due_date', value: string) => {
    setIssues((prev) => {
      const next = prev.map((item) => (item.issue_id === row.issue_id ? { ...item, [key]: value || null } : item));
      const updatedRow = next.find((item) => item.issue_id === row.issue_id);
      if (!updatedRow) return next;

      if (saveTimersRef.current[row.issue_id]) {
        clearTimeout(saveTimersRef.current[row.issue_id]);
      }

      if (!isRowDirty(updatedRow)) {
        delete saveTimersRef.current[row.issue_id];
        return next;
      }

      saveTimersRef.current[row.issue_id] = setTimeout(() => {
        const latestRow = issuesRef.current.find((item) => item.issue_id === row.issue_id);
        delete saveTimersRef.current[row.issue_id];
        if (!latestRow || !isRowDirty(latestRow) || savingIssueIdsRef.current[row.issue_id]) return;
        void saveRow(latestRow);
      }, 500);

      return next;
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 transition-all" onClick={handleClose}>
      <div
        className="bg-white w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden transition-all transform"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-4 flex items-center justify-between bg-white relative z-10 border-b border-slate-100 flex-shrink-0 h-16 box-border">
          <div className="flex flex-row items-center gap-3">
            <svg className="w-5 h-5 text-indigo-600 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="text-[17px] font-bold text-slate-800 flex items-center gap-2">
              {issueTitle ? <>{issueTitle} <span className="text-slate-300 font-semibold text-base">#{issueId}</span></> : `#{issueId}`}
            </h3>
          </div>
          <button
            aria-label={t('timeline.closeDialogAria')}
            className="p-1.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded-md transition-colors flex-shrink-0 cursor-pointer"
            onClick={handleClose}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0 bg-white relative">
          {loading && (
            <div className="flex justify-center items-center py-12 absolute inset-0 bg-white/80 z-30">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {!loading && errorMessage && (
            <div className="rounded-md bg-red-50 p-4 m-6 relative z-10 flex-shrink-0">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{errorMessage}</h3>
                </div>
              </div>
            </div>
          )}

          {!loading && !errorMessage && issues.length === 0 && (
            <div className="text-center py-12 m-6 bg-white rounded-xl border border-dashed border-slate-300 flex-shrink-0">
              <p className="text-sm text-slate-500">{t('timeline.detailsNoRows')}</p>
            </div>
          )}

          {!loading && issues.length > 0 && (
            <div className="flex flex-col flex-1 min-h-0 relative">
              <div className="hidden md:flex py-2.5 px-6 sticky top-0 bg-slate-50/95 backdrop-blur-sm z-20 border-b border-slate-100 shadow-sm text-[11px] font-bold text-slate-400 tracking-wider flex-shrink-0 h-10 box-border items-center">
                <div className="flex-1 uppercase">{t('timeline.task', { defaultValue: 'TASK' })}</div>
                <div className="flex gap-2">
                  <div className="w-[240px] text-center uppercase md:mr-4">{t('timeline.duration', { defaultValue: 'DURATION' })}</div>
                  <div className="w-[120px] uppercase text-right pr-2">{t('timeline.prog', { defaultValue: 'PROG' })}</div>
                </div>
              </div>
              <div className="pt-2 pb-2 overflow-auto flex-1 bg-white">
                {treeRoots.map((rootNode) => (
                  <IssueTreeNode
                    key={rootNode.issue_id}
                    node={rootNode}
                    depth={0}
                    activeLines={[]}
                    isLast={true}
                    rootIssueId={issueId}
                    savingIssueIds={savingIssueIds}
                    handleDateChange={handleDateChange}
                    onAddSubIssue={(parentIssue) => setCreateIssueContext({
                      issueId: parentIssue.issue_id,
                      startDate: parentIssue.start_date,
                      dueDate: parentIssue.due_date
                    })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50/80 flex items-center text-slate-500 justify-between flex-shrink-0 border-t border-slate-100 h-12 box-border shadow-[0_-2px_6px_rgba(0,0,0,0.02)] z-20">
          <div className="text-[13px] font-semibold">
            Total Tasks: {issues.length}
          </div>
          <div className="flex items-center gap-4 text-[11px] font-bold text-slate-400 tracking-wider">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-indigo-400 rounded-sm"></div>
              WIP
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-emerald-400 rounded-sm"></div>
              DONE
            </div>
          </div>
        </div>
      </div>
      {createIssueContext !== null && (
        <SubIssueCreationDialog
          projectIdentifier={projectIdentifier}
          parentIssueId={createIssueContext.issueId}
          parentStartDate={createIssueContext.startDate}
          parentDueDate={createIssueContext.dueDate}
          onCreated={(createdIssueId) => {
            void reloadTaskDetails(createdIssueId);
          }}
          onClose={() => setCreateIssueContext(null)}
        />
      )}
    </div>
  );
}
