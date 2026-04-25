import { useCallback, useState } from 'react';
import type { TaskDetailIssue } from '../../../services/scheduleReportApi';
import {
  TABLE_DENSITY_STORAGE_KEY,
  type InheritedSubIssueFields,
  type TableDensity,
  type TreeNodeType
} from './shared';

export type CreateIssueContext = {
  issueId: number;
  inheritedFields: InheritedSubIssueFields;
};

export type IssueDialogContext = {
  issueId: number;
  issueUrl: string;
};

export function useTaskDetailsDialogState() {
  const [createIssueContext, setCreateIssueContext] = useState<CreateIssueContext | null>(null);
  const [editIssueContext, setEditIssueContext] = useState<IssueDialogContext | null>(null);
  const [viewIssueContext, setViewIssueContext] = useState<IssueDialogContext | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<TreeNodeType | null>(null);
  const [density, setDensity] = useState<TableDensity>(() => {
    const saved = localStorage.getItem(TABLE_DENSITY_STORAGE_KEY);
    if (saved && (saved === 'compact' || saved === 'standard' || saved === 'relaxed')) {
      return saved as TableDensity;
    }
    return 'standard';
  });
  const [densityMenuOpen, setDensityMenuOpen] = useState(false);

  const selectIssue = useCallback((issue: TaskDetailIssue | TreeNodeType | null) => {
    const nextIssue = issue
      ? { ...issue, children: 'children' in issue ? issue.children : [] }
      : null;
    setSelectedIssue(nextIssue);
  }, []);

  const resetDialogState = useCallback(() => {
    setCreateIssueContext(null);
    setEditIssueContext(null);
    setViewIssueContext(null);
    setSelectedIssue(null);
    setDensityMenuOpen(false);
  }, []);

  const handleDensityChange = useCallback((next: TableDensity) => {
    setDensity(next);
    localStorage.setItem(TABLE_DENSITY_STORAGE_KEY, next);
    setDensityMenuOpen(false);
  }, []);

  return {
    createIssueContext,
    setCreateIssueContext,
    editIssueContext,
    setEditIssueContext,
    viewIssueContext,
    setViewIssueContext,
    selectedIssue,
    setSelectedIssue,
    selectIssue,
    density,
    densityMenuOpen,
    setDensityMenuOpen,
    handleDensityChange,
    resetDialogState
  };
}
