import { useEffect, useMemo, useState } from 'react';
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

  const dialogTitle = useMemo(() => {
    if (!issueTitle) return t('timeline.ticketTitle', { id: issueId, suffix: '' });
    return t('timeline.ticketTitle', { id: issueId, suffix: `: ${issueTitle}` });
  }, [issueId, issueTitle]);

  const setDateValue = (rowIssueId: number, key: 'start_date' | 'due_date', value: string) => {
    setIssues((prev) =>
      prev.map((row) => (row.issue_id === rowIssueId ? { ...row, [key]: value || null } : row))
    );
  };

  const isRowDirty = (row: TaskDetailIssue) => {
    const baseline = baselineById[row.issue_id];
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
    const nextRow = { ...row, [key]: value || null };
    setDateValue(row.issue_id, key, value);
    if (!isRowDirty(nextRow) || savingIssueIds[row.issue_id]) return;
    void saveRow(nextRow);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 transition-all" onClick={onClose}>
      <div
        className="bg-white w-full max-w-5xl max-h-full rounded-2xl shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden transition-all transform"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <h3 className="text-base font-semibold text-slate-900 truncate pr-4">{dialogTitle}</h3>
          <button
            aria-label={t('timeline.closeDialogAria')}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0"
            onClick={onClose}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-slate-700">{t('timeline.detailsDialogTitle')}</h4>
          </div>

          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {!loading && errorMessage && (
            <div className="rounded-md bg-red-50 p-4 mb-4">
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
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <p className="text-sm text-slate-500">{t('timeline.detailsNoRows')}</p>
            </div>
          )}

          {!loading && issues.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('timeline.subjectHeader')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-48">{t('timeline.startDateHeader')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-48">{t('timeline.dueDateHeader')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {issues.map((row) => {
                      const saving = Boolean(savingIssueIds[row.issue_id]);
                      return (
                        <tr key={row.issue_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <a
                              href={row.issue_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-baseline text-indigo-600 hover:text-indigo-900 group"
                            >
                              <span className="text-slate-400 text-xs font-medium mr-1.5 group-hover:text-indigo-400 transition-colors">#{row.issue_id}</span>
                              <span className="text-sm font-medium group-hover:underline">{row.subject}</span>
                            </a>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="date"
                              value={row.start_date || ''}
                              onChange={(event) => handleDateChange(row, 'start_date', event.target.value)}
                              disabled={saving}
                              className="block w-full rounded-md border-0 py-1.5 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 disabled:bg-slate-50 disabled:text-slate-500 disabled:ring-slate-200 transition-all cursor-pointer"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="date"
                              value={row.due_date || ''}
                              onChange={(event) => handleDateChange(row, 'due_date', event.target.value)}
                              disabled={saving}
                              className="block w-full rounded-md border-0 py-1.5 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 disabled:bg-slate-50 disabled:text-slate-500 disabled:ring-slate-200 transition-all cursor-pointer"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
