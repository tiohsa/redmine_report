import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n';
import {
  fetchTaskDetails,
  fetchTaskMasters,
  updateTaskDates,
  updateTaskFields,
  updateTaskJournal,
  type TaskDetailIssue,
  type TaskMasters,
  type TaskUpdatePayload,
  WeeklyApiError
} from '../../../services/scheduleReportApi';

type ReloadOptions = {
  expectedIssueId?: number;
};

type FieldUpdateOptions = {
  rootIssueId?: number;
  selectedIssueId?: number | null;
};

export function useTaskDetailsData(projectIdentifier: string, open: boolean) {
  const [issues, setIssues] = useState<TaskDetailIssue[]>([]);
  const [savingIssueIds, setSavingIssueIds] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [masters, setMasters] = useState<TaskMasters | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const baselineByIdRef = useRef<Record<number, TaskDetailIssue>>({});
  const issuesRef = useRef<TaskDetailIssue[]>([]);
  const savingIssueIdsRef = useRef<Record<number, boolean>>({});
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const hasAnyChangesRef = useRef(false);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const showFeedback = useCallback((type: 'error' | 'info', text: string) => {
    setFeedback({ type, text });
  }, []);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const resetData = useCallback(() => {
    setIssues([]);
    baselineByIdRef.current = {};
    setSavingIssueIds({});
    issuesRef.current = [];
    savingIssueIdsRef.current = {};
    setFeedback(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchTaskMasters(projectIdentifier).then(setMasters).catch(() => {
      // Best effort.
    });
  }, [open, projectIdentifier]);

  useEffect(() => {
    issuesRef.current = issues;
  }, [issues]);

  useEffect(() => {
    savingIssueIdsRef.current = savingIssueIds;
  }, [savingIssueIds]);

  useEffect(() => () => {
    Object.values(saveTimersRef.current).forEach((timer) => clearTimeout(timer));
    saveTimersRef.current = {};
  }, []);

  const reloadTaskDetails = useCallback(async (
    targetIssueId: number,
    options: ReloadOptions = {}
  ) => {
    setLoading(true);
    try {
      let latestRows: TaskDetailIssue[] = [];
      const maxAttempts = options.expectedIssueId ? 3 : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        latestRows = await fetchTaskDetails(projectIdentifier, targetIssueId);
        const found = !options.expectedIssueId || latestRows.some((row) => row.issue_id === options.expectedIssueId);
        if (found) break;
        if (attempt < maxAttempts - 1) {
          await sleep(250);
        }
      }

      setIssues(latestRows);
      baselineByIdRef.current = latestRows.reduce<Record<number, TaskDetailIssue>>((acc, row) => {
        acc[row.issue_id] = row;
        return acc;
      }, {});
      return latestRows;
    } catch (error: unknown) {
      showFeedback('error', error instanceof Error ? error.message : t('timeline.detailsLoadFailed'));
      return [];
    } finally {
      setLoading(false);
    }
  }, [projectIdentifier, showFeedback]);

  const isRowDirty = useCallback((row: TaskDetailIssue) => {
    const baseline = baselineByIdRef.current[row.issue_id];
    if (!baseline) return false;
    return baseline.start_date !== row.start_date || baseline.due_date !== row.due_date;
  }, []);

  const saveRow = useCallback(async (row: TaskDetailIssue) => {
    setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: true }));
    try {
      const updated = await updateTaskDates(projectIdentifier, row.issue_id, {
        start_date: row.start_date,
        due_date: row.due_date
      });
      updated.parent_id = row.parent_id;
      setIssues((prev) => prev.map((item) => (item.issue_id === updated.issue_id ? { ...item, ...updated } : item)));
      baselineByIdRef.current = { ...baselineByIdRef.current, [updated.issue_id]: updated };
      hasAnyChangesRef.current = true;
    } catch (error: unknown) {
      const message =
        error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : t('api.updateTaskDates', { status: 500 });
      showFeedback('error', message);
      const baseline = baselineByIdRef.current[row.issue_id];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === row.issue_id ? { ...item, ...baseline } : item)));
      }
    } finally {
      setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: false }));
    }
  }, [projectIdentifier, showFeedback]);

  const saveProcessFlowDates = useCallback(async (row: TaskDetailIssue, startDate: string, dueDate: string) => {
    if (saveTimersRef.current[row.issue_id]) {
      clearTimeout(saveTimersRef.current[row.issue_id]);
      delete saveTimersRef.current[row.issue_id];
    }

    setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: true }));
    setIssues((prev) => prev.map((item) => (
      item.issue_id === row.issue_id ? { ...item, start_date: startDate, due_date: dueDate } : item
    )));

    try {
      const updated = await updateTaskDates(projectIdentifier, row.issue_id, {
        start_date: startDate,
        due_date: dueDate
      });
      updated.parent_id = row.parent_id;
      setIssues((prev) => prev.map((item) => (item.issue_id === updated.issue_id ? { ...item, ...updated } : item)));
      baselineByIdRef.current = { ...baselineByIdRef.current, [updated.issue_id]: updated };
      hasAnyChangesRef.current = true;
      return updated;
    } catch (error: unknown) {
      const message =
        error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : t('api.updateTaskDates', { status: 500 });
      showFeedback('error', message);
      const baseline = baselineByIdRef.current[row.issue_id];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === row.issue_id ? { ...item, ...baseline } : item)));
      }
      return null;
    } finally {
      setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: false }));
    }
  }, [projectIdentifier, showFeedback]);

  const handleDateChange = useCallback((row: TaskDetailIssue, key: 'start_date' | 'due_date', value: string) => {
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
  }, [isRowDirty, saveRow]);

  const handleFieldUpdate = useCallback(async (
    issueId: number,
    field: string,
    value: string | number | null,
    options: FieldUpdateOptions = {}
  ) => {
    const payload: Record<string, unknown> = { [field]: value };
    try {
      const updated = await updateTaskFields(projectIdentifier, issueId, payload as TaskUpdatePayload);
      setIssues((prev) => prev.map((item) => (item.issue_id === updated.issue_id ? { ...item, ...updated } : item)));
      baselineByIdRef.current = {
        ...baselineByIdRef.current,
        [updated.issue_id]: { ...baselineByIdRef.current[updated.issue_id], ...updated }
      };
      hasAnyChangesRef.current = true;

      if (field === 'done_ratio' && options.rootIssueId) {
        void reloadTaskDetails(options.rootIssueId, { expectedIssueId: options.selectedIssueId ?? undefined });
      }
      return updated;
    } catch (error: unknown) {
      const message = error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : 'Update failed';
      showFeedback('error', message);

      const baseline = baselineByIdRef.current[issueId];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === issueId ? { ...item, ...baseline } : item)));
      }

      throw error;
    }
  }, [projectIdentifier, reloadTaskDetails, showFeedback]);

  const handleUpdateComment = useCallback(async (
    journalId: number,
    notes: string,
    rootIssueId: number,
    selectedIssueId?: number | null
  ) => {
    try {
      await updateTaskJournal(projectIdentifier, journalId, notes);
      const latestRows = await reloadTaskDetails(rootIssueId, { expectedIssueId: selectedIssueId ?? undefined });
      hasAnyChangesRef.current = true;
      return latestRows;
    } catch (error: unknown) {
      const message = error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : 'Update failed';
      showFeedback('error', message);
      return undefined;
    }
  }, [projectIdentifier, reloadTaskDetails, showFeedback]);

  return {
    issues,
    setIssues,
    loading,
    masters,
    savingIssueIds,
    feedback,
    clearFeedback,
    showFeedback,
    resetData,
    reloadTaskDetails,
    handleDateChange,
    handleFieldUpdate,
    handleUpdateComment,
    saveProcessFlowDates,
    issuesRef,
    savingIssueIdsRef,
    hasAnyChangesRef
  };
}
