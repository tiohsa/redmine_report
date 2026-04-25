import React from 'react';
import { t } from '../../../i18n';
import type { TreeNodeType } from './shared';

const REDMINE_DIALOG_ACTION_CLASS = 'inline-flex items-center justify-center h-8 min-w-8 px-4 rounded-full border border-gray-200 bg-[#f0f0f0] text-[13px] font-medium font-sans text-[#222222] hover:bg-gray-200 transition-colors cursor-pointer shadow-subtle';
const REDMINE_DIALOG_ICON_ACTION_CLASS = 'inline-flex items-center justify-center h-9 w-9 rounded-[8px] border border-gray-200 bg-white text-[#222222] hover:bg-gray-50 transition-all duration-300 cursor-pointer';
const REDMINE_DIALOG_PRIMARY_ACTION_CLASS = 'inline-flex items-center justify-center h-8 min-w-[80px] px-5 rounded-full bg-[#181e25] text-[13px] font-semibold font-sans text-[#ffffff] hover:bg-black transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm';
const REDMINE_DIALOG_SECTION_TITLE_CLASS = 'text-[12px] font-display font-medium uppercase text-[#8e8e93] tracking-wider';
const REDMINE_DIALOG_TEXTAREA_CLASS = 'w-full min-h-[100px] resize-y border border-gray-200 rounded-[12px] bg-white px-4 py-3 text-[16px] leading-[1.50] font-sans text-[#222222] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-200)] focus:border-[var(--color-primary-500)] transition-all';
const REDMINE_DIALOG_SECTION_CLASS = 'border-b border-gray-100 px-6 py-5';

type TaskDetailsSidePanelProps = {
  issue: TreeNodeType;
  editingDescription: boolean;
  descriptionDraft: string;
  newCommentDraft: string;
  isSavingComment: boolean;
  editingCommentId: number | null;
  editingCommentDraft: string;
  onClose: () => void;
  onEditIssue: () => void;
  onStartDescriptionEdit: () => void;
  onCancelDescriptionEdit: () => void;
  onDescriptionDraftChange: (value: string) => void;
  onSaveDescription: () => void;
  onNewCommentDraftChange: (value: string) => void;
  onAddComment: () => void;
  onStartCommentEdit: (commentId: number, notes: string) => void;
  onCancelCommentEdit: () => void;
  onEditingCommentDraftChange: (value: string) => void;
  onSaveComment: (commentId: number, notes: string) => void;
};

export function TaskDetailsSidePanel({
  issue,
  editingDescription,
  descriptionDraft,
  newCommentDraft,
  isSavingComment,
  editingCommentId,
  editingCommentDraft,
  onClose,
  onEditIssue,
  onStartDescriptionEdit,
  onCancelDescriptionEdit,
  onDescriptionDraftChange,
  onSaveDescription,
  onNewCommentDraftChange,
  onAddComment,
  onStartCommentEdit,
  onCancelCommentEdit,
  onEditingCommentDraftChange,
  onSaveComment
}: TaskDetailsSidePanelProps) {
  return (
    <div className="absolute inset-y-0 right-0 z-30 flex min-h-0 w-[50%] min-w-[360px] flex-col overflow-auto border-l border-slate-300 bg-white">
      <div className="sticky top-0 z-10 flex flex-shrink-0 items-start justify-between gap-3 border-b border-gray-100 bg-white px-6 py-5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-[11px] leading-none font-semibold text-slate-500">
              #{issue.issue_id}
            </span>
            <h4
              className="truncate text-[14px] leading-5 font-semibold text-slate-900"
              data-testid="task-details-selected-title"
            >
              {issue.subject}
            </h4>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={issue.issue_url}
            target="_blank"
            rel="noreferrer"
            className={REDMINE_DIALOG_ICON_ACTION_CLASS}
            title={t('common.openInNewTab', { defaultValue: 'Open in Redmine' })}
            aria-label={t('common.openInNewTab', { defaultValue: 'Open in Redmine' })}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" />
            </svg>
          </a>
          <button
            type="button"
            className={REDMINE_DIALOG_ICON_ACTION_CLASS}
            title={t('timeline.editIssue')}
            aria-label={t('timeline.editIssue')}
            onClick={onEditIssue}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.625 2.625 0 113.712 3.713L8.25 20.524 3 21l.476-5.25L16.862 4.487z" />
            </svg>
          </button>
          <button
            type="button"
            className={REDMINE_DIALOG_ICON_ACTION_CLASS}
            onClick={onClose}
            title={t('common.close', { defaultValue: 'Close' })}
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className={REDMINE_DIALOG_SECTION_CLASS}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h5 className={REDMINE_DIALOG_SECTION_TITLE_CLASS}>{t('timeline.descriptionTab')}</h5>
          {!editingDescription ? (
            <button
              type="button"
              className={REDMINE_DIALOG_ACTION_CLASS}
              onClick={onStartDescriptionEdit}
              title={t('common.edit', { defaultValue: 'Edit' })}
            >
              {t('common.edit', { defaultValue: 'Edit' })}
            </button>
          ) : null}
        </div>
        {editingDescription ? (
          <div className="flex flex-col gap-2">
            <textarea
              className={`${REDMINE_DIALOG_TEXTAREA_CLASS} min-h-[120px]`}
              value={descriptionDraft}
              onChange={(event) => onDescriptionDraftChange(event.target.value)}
              placeholder={t('timeline.noDescription')}
              autoFocus
            />
            <div className="flex justify-start gap-2">
              <button
                type="button"
                className={REDMINE_DIALOG_ACTION_CLASS}
                onClick={onCancelDescriptionEdit}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className={REDMINE_DIALOG_PRIMARY_ACTION_CLASS}
                onClick={onSaveDescription}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="min-h-[72px] cursor-pointer whitespace-pre-wrap border border-slate-200 bg-white px-3 py-2 text-[13px] leading-6 text-slate-700 transition-colors hover:bg-slate-50"
            onClick={onStartDescriptionEdit}
            data-testid="task-details-description"
          >
            {issue.description || <span className="italic text-slate-500">{t('timeline.noDescription')}</span>}
          </div>
        )}
      </div>

      <div className="px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h5 className={REDMINE_DIALOG_SECTION_TITLE_CLASS}>{t('timeline.commentsTab')}</h5>
          <span className="text-[12px] font-medium text-slate-500">
            {issue.comments?.length ?? 0}
          </span>
        </div>
        <div className="border border-slate-200 bg-white">
          {issue.comments && issue.comments.length > 0 ? issue.comments.map((comment) => (
            <div key={comment.id ?? `${comment.created_on}-${comment.author_name}-${comment.notes.slice(0, 12)}`} className="group border-b border-slate-200 last:border-b-0">
              {editingCommentId === comment.id && comment.id !== undefined ? (
                <div className="flex flex-col gap-2 p-3">
                  <textarea
                    className={REDMINE_DIALOG_TEXTAREA_CLASS}
                    value={editingCommentDraft}
                    onChange={(event) => onEditingCommentDraftChange(event.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-start gap-2">
                    <button
                      type="button"
                      className={REDMINE_DIALOG_ACTION_CLASS}
                      onClick={onCancelCommentEdit}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      className={REDMINE_DIALOG_PRIMARY_ACTION_CLASS}
                      onClick={() => onSaveComment(comment.id!, editingCommentDraft)}
                    >
                      {t('common.save')}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="relative cursor-pointer px-3 py-2.5 transition-colors hover:bg-slate-50"
                  onClick={() => {
                    if (comment.id !== undefined) {
                      onStartCommentEdit(comment.id, comment.notes || '');
                    }
                  }}
                >
                  {comment.id !== undefined ? (
                    <button
                      type="button"
                      className="absolute right-2 top-2 inline-flex h-6 min-w-6 items-center justify-center border border-slate-300 bg-white px-1.5 text-[11px] font-medium text-slate-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                      onClick={(event) => {
                        event.stopPropagation();
                        onStartCommentEdit(comment.id!, comment.notes || '');
                      }}
                      title={t('common.edit', { defaultValue: 'Edit' })}
                    >
                      {t('common.edit', { defaultValue: 'Edit' })}
                    </button>
                  ) : null}
                  <div className="mb-2 flex items-center justify-between gap-3 pr-14">
                    <span className="text-[12px] font-semibold text-slate-700">
                      {comment.author_name || t('common.unknown', { defaultValue: 'Unknown' })}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {comment.created_on ? comment.created_on.replace('T', ' ').slice(0, 16).replace(/-/g, '/') : ''}
                    </span>
                  </div>
                  <div className="break-words whitespace-pre-wrap text-[13px] leading-6 text-slate-700">
                    {comment.notes}
                  </div>
                </div>
              )}
            </div>
          )) : (
            <div className="px-3 py-4 text-center text-[12px] text-slate-500" data-testid="task-details-no-comments">
              {t('timeline.noComments', { defaultValue: 'No comments' })}
            </div>
          )}
        </div>

        <div className="mt-4 border border-slate-200 bg-white p-3">
          <textarea
            className={REDMINE_DIALOG_TEXTAREA_CLASS}
            placeholder={t('timeline.addCommentPlaceholder', { defaultValue: 'Add a comment...' })}
            value={newCommentDraft}
            onChange={(event) => onNewCommentDraftChange(event.target.value)}
            disabled={isSavingComment}
            data-testid="task-details-new-comment"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className={`${REDMINE_DIALOG_PRIMARY_ACTION_CLASS} flex items-center gap-1`}
              onClick={onAddComment}
              disabled={!newCommentDraft.trim() || isSavingComment}
            >
              {isSavingComment ? (
                <svg className="-ml-1 mr-1 h-3 w-3 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : null}
              {t('common.add', { defaultValue: 'Add' })}
            </button>
          </div>
        </div>
      </div>

      <div className="pb-2" />
    </div>
  );
}
