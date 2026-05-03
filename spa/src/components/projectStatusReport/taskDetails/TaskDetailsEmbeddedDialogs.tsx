import { type MutableRefObject } from 'react';
import { type TaskDetailIssue } from '../../../services/scheduleReportApi';
import {
  IssueEditDialog,
  IssueViewDialog,
  SubIssueCreationDialog
} from './EmbeddedIssueDialogs';
import { type InheritedSubIssueFields } from './shared';

type CreateIssueContext = {
  issueId: number;
  inheritedFields: InheritedSubIssueFields;
};

type IssueDialogContext = {
  issueId: number;
  issueUrl: string;
};

type TaskDetailsEmbeddedDialogsProps = {
  projectIdentifier: string;
  createIssueContext: CreateIssueContext | null;
  editIssueContext: IssueDialogContext | null;
  viewIssueContext: IssueDialogContext | null;
  issues: TaskDetailIssue[];
  currentRootIssueId: number;
  hasAnyChangesRef: MutableRefObject<boolean>;
  onTaskDatesUpdated?: () => void;
  onCloseCreateIssue: () => void;
  onCloseEditIssue: () => void;
  onCloseViewIssue: () => void;
  reloadTaskDetails: (issueId: number, options?: { expectedIssueId?: number }) => Promise<TaskDetailIssue[]>;
  syncSelectionAfterReload: (rows: TaskDetailIssue[], selectedIssueId?: number | null) => void;
};

export function TaskDetailsEmbeddedDialogs({
  projectIdentifier,
  createIssueContext,
  editIssueContext,
  viewIssueContext,
  issues,
  currentRootIssueId,
  hasAnyChangesRef,
  onTaskDatesUpdated,
  onCloseCreateIssue,
  onCloseEditIssue,
  onCloseViewIssue,
  reloadTaskDetails,
  syncSelectionAfterReload
}: TaskDetailsEmbeddedDialogsProps) {
  return (
    <>
      {createIssueContext !== null && (
        <SubIssueCreationDialog
          projectIdentifier={projectIdentifier}
          parentIssueId={createIssueContext.issueId}
          inheritedFields={createIssueContext.inheritedFields}
          onCreated={(createdIssueId) => {
            hasAnyChangesRef.current = true;
            void reloadTaskDetails(currentRootIssueId, {
              expectedIssueId: createdIssueId
            }).then((rows) => {
              syncSelectionAfterReload(rows, createdIssueId ?? currentRootIssueId);
              onTaskDatesUpdated?.();
              hasAnyChangesRef.current = false;
            });
          }}
          onClose={onCloseCreateIssue}
        />
      )}
      {editIssueContext !== null && (
        <IssueEditDialog
          projectIdentifier={projectIdentifier}
          issueId={editIssueContext.issueId}
          issueUrl={editIssueContext.issueUrl}
          onSaved={(updatedIssueId) => {
            hasAnyChangesRef.current = true;
            void reloadTaskDetails(currentRootIssueId, {
              expectedIssueId: updatedIssueId ?? editIssueContext.issueId
            }).then((rows) => {
              syncSelectionAfterReload(rows, updatedIssueId ?? editIssueContext.issueId);
              onTaskDatesUpdated?.();
              hasAnyChangesRef.current = false;
            });
          }}
          onClose={onCloseEditIssue}
        />
      )}
      {viewIssueContext !== null && (
        <IssueViewDialog
          projectIdentifier={projectIdentifier}
          issueId={viewIssueContext.issueId}
          issueUrl={viewIssueContext.issueUrl}
          inheritedFields={(() => {
            const issue = issues.find((i) => i.issue_id === viewIssueContext.issueId);
            return issue ? {
              tracker_id: issue.tracker_id ?? undefined,
              priority_id: issue.priority_id ?? undefined,
              assigned_to_id: issue.assignee_id ?? undefined,
              start_date: issue.start_date ?? undefined,
              due_date: issue.due_date ?? undefined
            } : {};
          })()}
          onSaved={(updatedIssueId) => {
            hasAnyChangesRef.current = true;
            void reloadTaskDetails(currentRootIssueId, {
              expectedIssueId: updatedIssueId ?? viewIssueContext.issueId
            }).then((rows) => {
              syncSelectionAfterReload(rows, updatedIssueId ?? viewIssueContext.issueId);
              onTaskDatesUpdated?.();
              hasAnyChangesRef.current = false;
            });
          }}
          onClose={onCloseViewIssue}
        />
      )}
    </>
  );
}
