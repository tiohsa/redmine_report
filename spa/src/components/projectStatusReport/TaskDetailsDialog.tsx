import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import {
  fetchTaskDetails,
  TaskDetailIssue,
  updateTaskDates,
  WeeklyApiError
} from '../../services/scheduleReportApi';

type TaskDetailsDialogProps = {
  open: boolean;
  projectIdentifier: string;
  issueId: number;
  issueTitle?: string;
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
};

const IssueTreeNode = ({
  node,
  depth,
  activeLines,
  isLast,
  rootIssueId,
  savingIssueIds,
  handleDateChange
}: IssueTreeNodeProps) => {
  const saving = Boolean(savingIssueIds[node.issue_id]);
  const isRoot = node.issue_id === rootIssueId;

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center py-2.5 hover:bg-slate-50 transition-colors relative group px-6">
        {/* Vertical lines from ancestors */}
        {activeLines.map((isActive, level) => (
          isActive ? (
            <div
              key={level}
              className="absolute top-0 bottom-0 border-l border-slate-300 pointer-events-none"
              style={{ left: `${level * 28 + 24}px` }}
            />
          ) : null
        ))}

        {/* T-shape for current node */}
        {depth > 0 && (
          <>
            {/* Vertical */}
            <div
              className="absolute border-l border-slate-300 pointer-events-none"
              style={{
                left: `${(depth - 1) * 28 + 24}px`,
                top: 0,
                bottom: isLast ? 'calc(100% - 20px)' : 0
              }}
            />
            {/* Horizontal */}
            <div
              className="absolute border-t border-slate-300 pointer-events-none"
              style={{
                left: `${(depth - 1) * 28 + 24}px`,
                top: '20px',
                width: '14px'
              }}
            />
          </>
        )}

        <div className="w-full md:flex-1 flex items-center min-w-0" style={{ paddingLeft: `${depth * 28 + 12}px` }}>
          <div className="flex items-center min-w-0 pr-4 z-10 w-full relative">
            {isRoot ? (
              <a href={node.issue_url} target="_blank" rel="noreferrer" className="flex-shrink-0 bg-blue-50 text-blue-600 border border-blue-200 text-xs font-semibold px-2 py-0.5 rounded mr-3 hover:bg-blue-100 transition-colors">
                #{node.issue_id}
              </a>
            ) : (
              <a href={node.issue_url} target="_blank" rel="noreferrer" className="flex-shrink-0 text-slate-400 text-xs font-semibold mr-3 hover:text-indigo-500 transition-colors text-right px-2 min-w-[36px]">
                #{node.issue_id}
              </a>
            )}
            <a href={node.issue_url} target="_blank" rel="noreferrer" className="text-sm font-bold text-slate-800 truncate hover:underline hover:text-indigo-600">
              {node.subject}
            </a>
          </div>
        </div>

        <div className="flex flex-row gap-3 md:gap-4 mt-3 md:mt-0 md:ml-auto w-full md:w-auto pr-2">
          <div className="flex-1 md:w-[130px] md:flex-shrink-0">
            <span className="text-xs font-semibold text-slate-500 mb-1 block md:hidden">{t('timeline.startDateHeader')}</span>
            <input
              type="date"
              value={node.start_date || ''}
              onChange={(event) => handleDateChange(node, 'start_date', event.target.value)}
              disabled={saving}
              className="block w-full rounded-md border-0 py-1.5 text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 disabled:bg-slate-50 cursor-pointer"
            />
          </div>
          <div className="flex-1 md:w-[130px] md:flex-shrink-0">
            <span className="text-xs font-semibold text-slate-500 mb-1 block md:hidden">{t('timeline.dueDateHeader')}</span>
            <input
              type="date"
              value={node.due_date || ''}
              onChange={(event) => handleDateChange(node, 'due_date', event.target.value)}
              disabled={saving}
              className="block w-full rounded-md border-0 py-1.5 text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 disabled:bg-slate-50 cursor-pointer"
            />
          </div>
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
        />
      ))}
    </>
  );
};

export function TaskDetailsDialog({
  open,
  projectIdentifier,
  issueId,
  issueTitle,
  onClose
}: TaskDetailsDialogProps) {
  const [issues, setIssues] = useState<TaskDetailIssue[]>([]);
  const [baselineById, setBaselineById] = useState<Record<number, TaskDetailIssue>>({});
  const [savingIssueIds, setSavingIssueIds] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const issuesRef = useRef<TaskDetailIssue[]>([]);
  const baselineByIdRef = useRef<Record<number, TaskDetailIssue>>({});
  const savingIssueIdsRef = useRef<Record<number, boolean>>({});
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!open) return;

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    fetchTaskDetails(projectIdentifier, issueId)
      .then((rows) => {
        if (cancelled) return;
        setIssues(rows);
        setBaselineById(rows.reduce<Record<number, TaskDetailIssue>>((acc, row) => {
          acc[row.issue_id] = row;
          return acc;
        }, {}));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : t('timeline.detailsLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, projectIdentifier, issueId]);

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
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 transition-all" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden transition-all transform"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-5 flex items-center justify-between bg-white relative z-10">
          <h3 className="text-lg font-bold text-slate-800 truncate pr-4">{dialogTitle}</h3>
          <button
            aria-label={t('timeline.closeDialogAria')}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0"
            onClick={onClose}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-white border-t border-slate-100 relative">
          {loading && (
            <div className="flex justify-center items-center py-12 absolute inset-0 bg-white/80 z-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {!loading && errorMessage && (
            <div className="rounded-md bg-red-50 p-4 m-6 relative z-10">
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
            <div className="text-center py-12 m-6 bg-white rounded-xl border border-dashed border-slate-300">
              <p className="text-sm text-slate-500">{t('timeline.detailsNoRows')}</p>
            </div>
          )}

          {!loading && issues.length > 0 && (
            <div className="pb-8">
              <div className="hidden md:flex border-b border-slate-100 py-3 px-6 sticky top-0 bg-white/95 backdrop-blur-sm z-20">
                <div className="flex-1 text-sm font-semibold text-slate-500">{t('timeline.subjectHeader')}</div>
                <div className="flex gap-4 md:ml-auto w-auto pr-2">
                  <div className="w-[130px] text-sm font-semibold text-slate-500">{t('timeline.startDateHeader')}</div>
                  <div className="w-[130px] text-sm font-semibold text-slate-500">{t('timeline.dueDateHeader')}</div>
                </div>
              </div>
              <div className="pt-2">
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
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
