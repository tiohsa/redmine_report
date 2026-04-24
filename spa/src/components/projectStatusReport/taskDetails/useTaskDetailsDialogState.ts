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
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [newCommentDraft, setNewCommentDraft] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState('');
  const [density, setDensity] = useState<TableDensity>(() => {
    const saved = localStorage.getItem(TABLE_DENSITY_STORAGE_KEY);
    if (saved && (saved === 'compact' || saved === 'standard' || saved === 'relaxed')) {
      return saved as TableDensity;
    }
    return 'standard';
  });
  const [densityMenuOpen, setDensityMenuOpen] = useState(false);

  const resetSelectionDrafts = useCallback(() => {
    setEditingDescription(false);
    setDescriptionDraft('');
    setNewCommentDraft('');
    setEditingCommentId(null);
    setEditingCommentDraft('');
    setIsSavingComment(false);
  }, []);

  const selectIssue = useCallback((issue: TaskDetailIssue | TreeNodeType | null) => {
    const nextIssue = issue
      ? { ...issue, children: 'children' in issue ? issue.children : [] }
      : null;
    setSelectedIssue(nextIssue);
    setEditingDescription(false);
    setDescriptionDraft(nextIssue?.description || '');
    setNewCommentDraft('');
    setEditingCommentId(null);
    setEditingCommentDraft('');
  }, []);

  const resetDialogState = useCallback(() => {
    setCreateIssueContext(null);
    setEditIssueContext(null);
    setViewIssueContext(null);
    setSelectedIssue(null);
    setDensityMenuOpen(false);
    resetSelectionDrafts();
  }, [resetSelectionDrafts]);

  const handleDensityChange = useCallback((next: TableDensity) => {
    setDensity(next);
    localStorage.setItem(TABLE_DENSITY_STORAGE_KEY, next);
    setDensityMenuOpen(false);
  }, []);

  const startDescriptionEdit = useCallback(() => {
    setDescriptionDraft(selectedIssue?.description || '');
    setEditingDescription(true);
  }, [selectedIssue]);

  const cancelDescriptionEdit = useCallback(() => {
    setEditingDescription(false);
    setDescriptionDraft(selectedIssue?.description || '');
  }, [selectedIssue]);

  const startCommentEdit = useCallback((commentId: number, notes: string) => {
    setEditingCommentId(commentId);
    setEditingCommentDraft(notes);
  }, []);

  const cancelCommentEdit = useCallback(() => {
    setEditingCommentId(null);
    setEditingCommentDraft('');
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
    editingDescription,
    setEditingDescription,
    descriptionDraft,
    setDescriptionDraft,
    newCommentDraft,
    setNewCommentDraft,
    isSavingComment,
    setIsSavingComment,
    editingCommentId,
    setEditingCommentId,
    editingCommentDraft,
    setEditingCommentDraft,
    density,
    densityMenuOpen,
    setDensityMenuOpen,
    handleDensityChange,
    startDescriptionEdit,
    cancelDescriptionEdit,
    startCommentEdit,
    cancelCommentEdit,
    resetSelectionDrafts,
    resetDialogState
  };
}
