import React, { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n';
import {
  type TaskDetailIssue,
  type TaskEditableField,
  type TaskIssueEditOptions,
  type TaskMasters
} from '../../../services/scheduleReportApi';
import { InlineDateRangeEditor, type InlineDateRangeValue } from '../InlineDateRangeEditor';
import { getProgressFillColor } from '../constants';
import {
  DENSITY_CONFIG,
  type TableDensity,
  type TreeNodeType
} from './shared';
import { Icon } from '../../ui/Icon';

type EditingCell = { field: string; value: string };

type IssueTreeNodeProps = {
  node: TreeNodeType;
  depth: number;
  activeLines: boolean[];
  isLast: boolean;
  rootIssueId: number;
  savingIssueIds: Record<number, boolean>;
  editingDateRange: InlineDateRangeValue | null;
  onStartDateRangeEdit: (row: TaskDetailIssue, field: 'start_date' | 'due_date', event?: React.MouseEvent) => void;
  onCommitDateRangeEdit: (row: TaskDetailIssue, next: InlineDateRangeValue) => void;
  onCancelDateRangeEdit: () => void;
  onAddSubIssue: (parentIssue: TaskDetailIssue) => void;
  onEditIssue: (issue: TaskDetailIssue) => void;
  onViewIssue: (issue: TaskDetailIssue) => void;
  selectedIssueId?: number | null;
  onSelectIssue: (issue: TaskDetailIssue) => void;
  registerRowRef?: (issueId: number, element: HTMLDivElement | null) => void;
  masters: TaskMasters | null;
  editOptionsByIssueId: Record<number, TaskIssueEditOptions>;
  onFieldUpdate: (issueId: number, field: string, value: string | number | null) => Promise<void>;
  columnWidths: Record<string, number>;
  density: TableDensity;
};

type IssueTreeTableProps = {
  treeRoots: TreeNodeType[];
  rootIssueId: number;
  savingIssueIds: Record<number, boolean>;
  editingDateRange: InlineDateRangeValue | null;
  onStartDateRangeEdit: (row: TaskDetailIssue, field: 'start_date' | 'due_date', event?: React.MouseEvent) => void;
  onCommitDateRangeEdit: (row: TaskDetailIssue, next: InlineDateRangeValue) => void;
  onCancelDateRangeEdit: () => void;
  onAddSubIssue: (parentIssue: TaskDetailIssue) => void;
  onEditIssue: (issue: TaskDetailIssue) => void;
  onViewIssue: (issue: TaskDetailIssue) => void;
  selectedIssueId?: number | null;
  onSelectIssue: (issue: TaskDetailIssue) => void;
  registerRowRef?: (issueId: number, element: HTMLDivElement | null) => void;
  masters: TaskMasters | null;
  editOptionsByIssueId: Record<number, TaskIssueEditOptions>;
  onFieldUpdate: (issueId: number, field: string, value: string | number | null) => Promise<void>;
  columnWidths: Record<string, number>;
  onColumnResize: (columnKey: string, deltaX: number) => void;
  density: TableDensity;
};

const ColumnResizer = ({ onResize }: { onResize: (deltaX: number) => void }) => {
  const [resizing, setResizing] = useState(false);
  const startXRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    startXRef.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!resizing) return;
    const deltaX = e.clientX - startXRef.current;
    if (deltaX !== 0) {
      onResize(deltaX);
      startXRef.current = e.clientX;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setResizing(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className={`absolute right-0 top-0 bottom-0 w-1 border-r border-slate-300 cursor-ew-resize z-30 transition-colors ${resizing ? 'bg-blue-500 border-blue-500' : 'hover:bg-blue-400 group-hover:bg-slate-300'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
};

const IssueTreeNode = ({
  node,
  depth,
  activeLines,
  isLast,
  rootIssueId,
  savingIssueIds,
  editingDateRange,
  onStartDateRangeEdit,
  onCommitDateRangeEdit,
  onCancelDateRangeEdit,
  onAddSubIssue,
  onEditIssue,
  onViewIssue,
  selectedIssueId,
  onSelectIssue,
  registerRowRef,
  masters,
  editOptionsByIssueId,
  onFieldUpdate,
  columnWidths,
  density
}: IssueTreeNodeProps) => {
  const progressRatio = Math.max(0, Math.min(100, Number(node.done_ratio ?? 0)));
  const isSelected = selectedIssueId === node.issue_id;
  const [collapsed, setCollapsed] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [isSavingField, setIsSavingField] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isSaving = savingIssueIds[node.issue_id] || isSavingField;

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.type === 'text') {
        inputRef.current.select();
      }
    }
  }, [editingCell]);

  const statusLabel = node.status_name || t('status.pending');
  const isClosed = node.status_is_closed ?? false;
  const isInProgress = !isClosed && progressRatio > 0;
  const statusBg = isClosed ? 'bg-blue-600' : isInProgress ? 'bg-blue-500' : 'bg-slate-300';
  const statusText = isClosed ? 'text-white' : isInProgress ? 'text-white' : 'text-slate-600';
  const commentCount = node.comments?.length ?? 0;
  const hasComments = commentCount > 0;
  const trackerBadgeClass = node.tracker_name
    ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
    : 'bg-slate-50 text-slate-400 ring-1 ring-slate-200/70';
  const priorityBadgeClass = (() => {
    const priorityId = Number(node.priority_id ?? 0);
    if (!node.priority_name) return 'bg-slate-50 text-slate-400 ring-1 ring-slate-200/70';
    if (priorityId >= 5) return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
    if (priorityId >= 4) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
    if (priorityId >= 3) return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200';
    return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
  })();

  const fallbackEditOptions: TaskIssueEditOptions | null = masters ? {
    editable: true,
    fields: {
      tracker_id: true,
      priority_id: true,
      status_id: true,
      assigned_to_id: true
    },
    trackers: masters.trackers,
    priorities: masters.priorities,
    statuses: masters.statuses,
    members: masters.members
  } : null;
  const issueEditOptions = editOptionsByIssueId[node.issue_id] ?? fallbackEditOptions;
  const canEditField = (field: TaskEditableField) => Boolean(issueEditOptions?.editable && issueEditOptions.fields[field] && !isSaving);
  const fieldCellClass = (field: TaskEditableField) => canEditField(field)
    ? 'group/cell cursor-pointer'
    : 'group/cell cursor-default';

  const startEdit = (field: string, currentValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectIssue(node);
    if (isSaving) return;
    if (['tracker_id', 'priority_id', 'status_id', 'assigned_to_id'].includes(field) && !canEditField(field as TaskEditableField)) return;
    setEditingCell({ field, value: currentValue });
    onCancelDateRangeEdit();
  };

  const cancelEdit = () => setEditingCell(null);

  const startDateRangeEdit = (field: 'start_date' | 'due_date', e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onStartDateRangeEdit(node, field, e);
    setEditingCell(null);
  };

  const commitDateRangeEdit = (field: 'start_date' | 'due_date', value: string) => {
    if (!editingDateRange) return;
    const nextDraft = field === 'start_date'
      ? { ...editingDateRange, startDate: value }
      : { ...editingDateRange, dueDate: value };
    onCommitDateRangeEdit(node, nextDraft);
  };

  const commitEdit = async (field: string, rawValue: string) => {
    setEditingCell(null);
    let value: string | number | null = rawValue;
    if (field === 'done_ratio') {
      if (rawValue === '') {
        await onFieldUpdate(node.issue_id, field, progressRatio);
        return;
      }
      value = Math.max(0, Math.min(100, Number(rawValue)));
    } else if (['tracker_id', 'status_id', 'priority_id'].includes(field)) {
      value = rawValue === '' ? null : Number(rawValue);
    } else if (field === 'assigned_to_id') {
      value = rawValue === '' || rawValue === '0' ? null : Number(rawValue);
    }
    const currentValueByField: Record<string, string | number | null | undefined> = {
      tracker_id: node.tracker_id,
      status_id: node.status_id,
      priority_id: node.priority_id,
      assigned_to_id: node.assignee_id ?? null,
      done_ratio: progressRatio,
      subject: node.subject
    };
    if (currentValueByField[field] === value) {
      return;
    }
    setIsSavingField(true);
    try {
      await onFieldUpdate(node.issue_id, field, value);
    } finally {
      setIsSavingField(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitEdit(editingCell!.field, e.currentTarget.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const isEditing = (field: string) => editingCell?.field === field;
  const isEditingDateRange = editingDateRange?.issueId === node.issue_id;
  const dateRangeDraft = isEditingDateRange ? editingDateRange : null;
  const displayStartDate = dateRangeDraft?.startDate || node.start_date || '';
  const displayDueDate = dateRangeDraft?.dueDate || node.due_date || '';
  const cellClass = 'group/cell cursor-pointer';

  return (
    <>
      <div
        ref={(element) => registerRowRef?.(node.issue_id, element)}
        data-testid={`task-row-${node.issue_id}`}
        data-selected={isSelected ? 'true' : 'false'}
        className={`flex items-center ${DENSITY_CONFIG[density].rowHeight} transition-all duration-200 relative group px-6 border-b border-gray-100 font-sans text-[var(--color-text-04)] ${isSelected ? 'bg-[rgba(20,86,240,0.04)] shadow-[inset_0_0_0_1px_rgba(20,86,240,0.1)]' : 'bg-white hover:bg-slate-50'}`}
        onClick={() => onSelectIssue(node)}
      >
        <div className="absolute left-4 top-0 bottom-0 flex pointer-events-none" style={{ width: `${depth * 20}px` }}>
          {activeLines.map((isActive, level) => (
            <svg key={level} width="20" height="100%" className="flex-shrink-0 overflow-visible">
              {isActive ? <line x1="10" y1="0" x2="10" y2="100%" stroke="#cbd5e1" strokeWidth="1.5" /> : null}
            </svg>
          ))}
          {depth > 0 ? (
            <svg width="20" height="100%" className="flex-shrink-0 overflow-visible">
              <line x1="10" y1="0" x2="10" y2={isLast ? '50%' : '100%'} stroke="#cbd5e1" strokeWidth="1.5" />
              <line x1="10" y1="50%" x2="20" y2="50%" stroke="#cbd5e1" strokeWidth="1.5" />
            </svg>
          ) : null}
        </div>

        {node.children.length > 0 ? (
          <div className="absolute pointer-events-none" style={{ left: `${16 + depth * 20}px`, top: '50%', bottom: 0, width: '20px' }}>
            {!collapsed ? (
              <svg width="20" height="100%" className="overflow-visible">
                <line x1="10" y1="0" x2="10" y2="100%" stroke="#cbd5e1" strokeWidth="1.5" />
              </svg>
            ) : null}
          </div>
        ) : null}

        <div
          className="shrink-0 flex items-center border-r border-slate-200/80 self-stretch overflow-hidden"
          style={{ paddingLeft: `${depth * 20}px`, width: `${columnWidths.task}px`, minWidth: `${columnWidths.task}px` }}
          data-testid={`task-title-cell-${node.issue_id}`}
        >
          <div className="w-5 mr-1 flex-shrink-0 flex items-center justify-center">
            {node.children.length > 0 ? (
              <button
                type="button"
                className="p-0.5 !border-0 ring-0 shadow-none bg-transparent appearance-none rounded-sm text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 focus:outline-none cursor-pointer flex-shrink-0 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed(!collapsed);
                }}
              >
                <svg className={DENSITY_CONFIG[density].iconSize} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  {collapsed
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />}
                </svg>
              </button>
            ) : null}
          </div>
          <div className="flex items-center min-w-0 z-10 flex-1">
            <span className={`flex-shrink-0 text-slate-400 ${DENSITY_CONFIG[density].idSize} font-semibold mr-1.5`}>
              #{node.issue_id}
            </span>
            {isEditing('subject') ? (
              <input
                ref={inputRef}
                type="text"
                className={`flex-1 ${DENSITY_CONFIG[density].subjectSize} h-8 px-2 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-800 min-w-0 shadow-sm`}
                value={editingCell!.value}
                onChange={(e) => setEditingCell({ field: 'subject', value: e.target.value })}
                onBlur={() => {
                  void commitEdit('subject', editingCell!.value);
                }}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                data-testid="task-subject"
                className={`${DENSITY_CONFIG[density].subjectSize} leading-5 ${depth === 0 ? 'font-semibold text-slate-800' : 'font-medium text-slate-700'} truncate hover:text-blue-700 block cursor-pointer`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectIssue(node);
                  onViewIssue(node);
                }}
                title={depth === 0 ? t('timeline.viewIssue') : `${node.subject} (${t('timeline.viewIssue')})`}
              >
                {node.subject}
              </span>
            )}
            {!isEditing('subject') ? (
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-1 flex-shrink-0">
                <button
                  type="button"
                  className="report-icon-button-muted !h-6 !w-6 !rounded-[6px] opacity-70 hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAddSubIssue(node);
                  }}
                  title={t('timeline.addSubIssue')}
                >
                  <svg className={DENSITY_CONFIG[density].iconSize} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="report-icon-button-muted !h-6 !w-6 !rounded-[6px] opacity-70 hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEditIssue(node);
                  }}
                  title={t('timeline.editIssue')}
                  aria-label={t('timeline.editIssue')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.625 2.625 0 113.712 3.713L8.25 20.524 3 21l.476-5.25L16.862 4.487z" />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-center px-2 border-r border-slate-200/80 self-stretch" style={{ width: `${columnWidths.comments}px`, minWidth: `${columnWidths.comments}px` }}>
          {hasComments ? (
            <span
              data-testid="task-comment-indicator"
              role="img"
              className="inline-flex items-center justify-center text-blue-600"
              title={t('timeline.hasCommentsCount', { count: commentCount, defaultValue: `${commentCount} comments` })}
              aria-label={t('timeline.hasCommentsCount', { count: commentCount, defaultValue: `${commentCount} comments` })}
            >
              <Icon name="file-text" className="h-[17px] w-[17px]" />
            </span>
          ) : null}
        </div>

        <div
          className={`shrink-0 flex items-center justify-start px-2 border-r border-slate-200/80 self-stretch overflow-hidden ${fieldCellClass('tracker_id')}`}
          style={{ width: `${columnWidths.tracker}px`, minWidth: `${columnWidths.tracker}px` }}
          data-testid={`tracker-cell-${node.issue_id}`}
          onClick={(e) => { e.stopPropagation(); onSelectIssue(node); }}
          onDoubleClick={(e) => startEdit('tracker_id', String(node.tracker_id || ''), e)}
        >
          {isEditing('tracker_id') && issueEditOptions ? (
            <select
              data-testid={`tracker-select-${node.issue_id}`}
              aria-label={t('timeline.trackerCol', { defaultValue: 'Tracker' })}
              className={`w-full ${DENSITY_CONFIG[density].badgeSize} h-8 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 shadow-sm`}
              value={editingCell!.value}
              onChange={(e) => {
                void commitEdit('tracker_id', e.target.value);
              }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              disabled={isSaving}
              autoFocus
            >
              {issueEditOptions.trackers.map((tr) => (
                <option key={tr.id} value={String(tr.id)}>{tr.name}</option>
              ))}
            </select>
          ) : (
            <span data-testid={`tracker-display-${node.issue_id}`} className={`inline-flex max-w-full items-center justify-center rounded-[9999px] px-3 py-1 ${DENSITY_CONFIG[density].badgeSize} font-semibold font-sans truncate transition-all duration-300 ${trackerBadgeClass} group/cell:hover:ring-1 group/cell:hover:ring-blue-300`} title={node.tracker_name || ''}>
              {node.tracker_name || '-'}
            </span>
          )}
        </div>

        <div
          className={`shrink-0 flex items-center justify-start px-2 border-r border-slate-200/80 self-stretch overflow-hidden ${fieldCellClass('priority_id')}`}
          style={{ width: `${columnWidths.priority}px`, minWidth: `${columnWidths.priority}px` }}
          data-testid={`priority-cell-${node.issue_id}`}
          onClick={(e) => { e.stopPropagation(); onSelectIssue(node); }}
          onDoubleClick={(e) => startEdit('priority_id', String(node.priority_id || ''), e)}
        >
          {isEditing('priority_id') && issueEditOptions ? (
            <select
              data-testid={`priority-select-${node.issue_id}`}
              aria-label={t('timeline.priorityCol', { defaultValue: 'Priority' })}
              className={`w-full ${DENSITY_CONFIG[density].badgeSize} h-8 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 shadow-sm`}
              value={editingCell!.value}
              onChange={(e) => {
                void commitEdit('priority_id', e.target.value);
              }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              disabled={isSaving}
              autoFocus
            >
              {issueEditOptions.priorities.filter((p) => p.id !== null).map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          ) : (
            <span data-testid={`priority-display-${node.issue_id}`} className={`inline-flex max-w-full items-center justify-center rounded-[9999px] px-3 py-1 ${DENSITY_CONFIG[density].badgeSize} font-semibold font-sans truncate transition-all duration-300 ${priorityBadgeClass}`} title={node.priority_name || ''}>
              {node.priority_name || '-'}
            </span>
          )}
        </div>

        <div
          className={`shrink-0 flex items-center justify-start px-2 border-r border-slate-200/80 self-stretch overflow-hidden ${fieldCellClass('status_id')}`}
          style={{ width: `${columnWidths.status}px`, minWidth: `${columnWidths.status}px` }}
          data-testid={`status-cell-${node.issue_id}`}
          onClick={(e) => { e.stopPropagation(); onSelectIssue(node); }}
          onDoubleClick={(e) => startEdit('status_id', String(node.status_id || ''), e)}
        >
          {isEditing('status_id') && issueEditOptions ? (
            <select
              data-testid={`status-select-${node.issue_id}`}
              aria-label={t('timeline.statusCol', { defaultValue: 'Status' })}
              className={`w-full ${DENSITY_CONFIG[density].badgeSize} h-8 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 shadow-sm`}
              value={editingCell!.value}
              onChange={(e) => {
                void commitEdit('status_id', e.target.value);
              }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              disabled={isSaving}
              autoFocus
            >
              {issueEditOptions.statuses.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          ) : (
            <span data-testid={`status-display-${node.issue_id}`} className={`inline-flex items-center justify-center min-w-[56px] ${DENSITY_CONFIG[density].badgeSize} font-bold px-2.5 py-1 rounded-full ${statusBg} ${statusText} shadow-sm`}>
              {statusLabel}
            </span>
          )}
        </div>

        <div className={`shrink-0 flex items-center gap-2 justify-start px-2 border-r border-slate-200/80 self-stretch overflow-hidden ${cellClass}`} style={{ width: `${columnWidths.progress}px`, minWidth: `${columnWidths.progress}px` }} onDoubleClick={(e) => startEdit('done_ratio', String(progressRatio), e)}>
          {isEditing('done_ratio') ? (
            <input
              ref={inputRef}
              type="number"
              min={0}
              max={100}
              step={10}
              className={`w-[72px] ${DENSITY_CONFIG[density].progressTextSize} h-8 px-2 border border-[var(--color-brand-6)] rounded-[9999px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-200)] bg-white text-slate-700 shadow-sm font-sans font-medium`}
              defaultValue={editingCell!.value}
              onBlur={(e) => {
                void commitEdit('done_ratio', e.currentTarget.value);
              }}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className={`flex items-center ${DENSITY_CONFIG[density].progressGap}`}>
              <div className="h-2 w-full max-w-[80px] overflow-hidden rounded-[9999px] relative cursor-help bg-gray-100" title={`${progressRatio}% ${t('timeline.progress')}`}>
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-[9999px] transition-all duration-700 ease-out"
                  style={{
                    width: progressRatio === 0 ? '100%' : `${progressRatio}%`,
                    backgroundColor: getProgressFillColor(progressRatio)
                  }}
                />
              </div>
              <span className={`${DENSITY_CONFIG[density].progressTextSize} text-[#45515e] font-semibold tabular-nums min-w-[32px]`} data-testid="progress-text">
                {progressRatio}%
              </span>
            </div>
          )}
        </div>

        <InlineDateRangeEditor
          issueId={node.issue_id}
          focusField={editingDateRange?.issueId === node.issue_id ? editingDateRange.focusField : null}
          startDate={displayStartDate}
          dueDate={displayDueDate}
          startColumnWidth={columnWidths.startDate ?? 130}
          dueColumnWidth={columnWidths.dueDate ?? 130}
          isSaving={isSaving}
          onActivate={startDateRangeEdit}
          onCommit={commitDateRangeEdit}
          onCancel={onCancelDateRangeEdit}
        />

        <div
          className={`shrink-0 flex items-center justify-start gap-1.5 px-2 overflow-hidden ${fieldCellClass('assigned_to_id')}`}
          style={{ width: `${columnWidths.assignee}px`, minWidth: `${columnWidths.assignee}px` }}
          data-testid={`assignee-cell-${node.issue_id}`}
          onClick={(e) => { e.stopPropagation(); onSelectIssue(node); }}
          onDoubleClick={(e) => startEdit('assigned_to_id', String(node.assignee_id || ''), e)}
        >
          {isEditing('assigned_to_id') && issueEditOptions ? (
            <select
              data-testid={`assignee-select-${node.issue_id}`}
              aria-label={t('timeline.assigneeCol', { defaultValue: 'Assignee' })}
              className={`w-full ${DENSITY_CONFIG[density].dateSize} h-7 px-1 border border-blue-400 rounded-md focus:outline-none bg-white text-slate-700`}
              value={editingCell!.value}
              onChange={(e) => {
                void commitEdit('assigned_to_id', e.target.value);
              }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              disabled={isSaving}
              autoFocus
            >
              {issueEditOptions.members.map((m) => (
                <option key={m.id ?? 'none'} value={m.id === null ? '' : String(m.id)}>{m.name}</option>
              ))}
            </select>
          ) : node.assignee_name ? (
            <>
              <div className={`${DENSITY_CONFIG[density].idSize === 'text-sm' ? 'w-7 h-7' : 'w-6 h-6'} rounded-full bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0`}>
                <svg className={DENSITY_CONFIG[density].iconSize} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                </svg>
              </div>
              <span data-testid={`assignee-display-${node.issue_id}`} className={`${DENSITY_CONFIG[density].subjectSize} font-medium text-slate-700 truncate`}>{node.assignee_name}</span>
            </>
          ) : (
            <span data-testid={`assignee-display-${node.issue_id}`} className={`${DENSITY_CONFIG[density].badgeSize} text-slate-400`}>-</span>
          )}
        </div>
      </div>

      {!collapsed ? node.children.map((child, idx) => (
        <IssueTreeNode
          key={child.issue_id}
          node={child}
          depth={depth + 1}
          activeLines={depth === 0 ? [] : [...activeLines, !isLast]}
          isLast={idx === node.children.length - 1}
          rootIssueId={rootIssueId}
          savingIssueIds={savingIssueIds}
          editingDateRange={editingDateRange}
          onStartDateRangeEdit={onStartDateRangeEdit}
          onCommitDateRangeEdit={onCommitDateRangeEdit}
          onCancelDateRangeEdit={onCancelDateRangeEdit}
          onAddSubIssue={onAddSubIssue}
          onEditIssue={onEditIssue}
          onViewIssue={onViewIssue}
          selectedIssueId={selectedIssueId}
          onSelectIssue={onSelectIssue}
          registerRowRef={registerRowRef}
          masters={masters}
          editOptionsByIssueId={editOptionsByIssueId}
          onFieldUpdate={onFieldUpdate}
          columnWidths={columnWidths}
          density={density}
        />
      )) : null}
    </>
  );
};

export function IssueTreeTable({
  treeRoots,
  rootIssueId,
  savingIssueIds,
  editingDateRange,
  onStartDateRangeEdit,
  onCommitDateRangeEdit,
  onCancelDateRangeEdit,
  onAddSubIssue,
  onEditIssue,
  onViewIssue,
  selectedIssueId,
  onSelectIssue,
  registerRowRef,
  masters,
  editOptionsByIssueId,
  onFieldUpdate,
  columnWidths,
  onColumnResize,
  density
}: IssueTreeTableProps) {
  return (
    <>
      <div className={`flex items-center py-2 px-6 bg-gray-50/80 z-20 border-b border-gray-100/50 text-slate-600 flex-shrink-0 ${DENSITY_CONFIG[density].headerHeight} box-border sticky top-0 tracking-wide font-semibold ${DENSITY_CONFIG[density].badgeSize}`}>
        <div className="shrink-0 flex items-center relative group border-r border-slate-200/60 h-full overflow-hidden" style={{ width: `${columnWidths.task}px`, minWidth: `${columnWidths.task}px` }}>
          <div className="w-5 mr-1" />
          {t('timeline.task', { defaultValue: 'Task' })}<ColumnResizer onResize={(deltaX) => onColumnResize('task', deltaX)} />
        </div>
        <div className="shrink-0 text-center px-2 relative group border-r border-slate-200/60 h-full flex items-center justify-center underline decoration-slate-300 decoration-dotted underline-offset-4 overflow-hidden" style={{ width: `${columnWidths.comments}px`, minWidth: `${columnWidths.comments}px` }}>{t('timeline.commentsCol', { defaultValue: 'Comments' })}<ColumnResizer onResize={(deltaX) => onColumnResize('comments', deltaX)} /></div>
        <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.tracker}px`, minWidth: `${columnWidths.tracker}px` }}>{t('timeline.trackerCol', { defaultValue: 'Tracker' })}<ColumnResizer onResize={(deltaX) => onColumnResize('tracker', deltaX)} /></div>
        <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.priority}px`, minWidth: `${columnWidths.priority}px` }}>{t('timeline.priorityCol', { defaultValue: 'Priority' })}<ColumnResizer onResize={(deltaX) => onColumnResize('priority', deltaX)} /></div>
        <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.status}px`, minWidth: `${columnWidths.status}px` }}>{t('timeline.statusCol', { defaultValue: 'Status' })}<ColumnResizer onResize={(deltaX) => onColumnResize('status', deltaX)} /></div>
        <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.progress}px`, minWidth: `${columnWidths.progress}px` }}>{t('timeline.progressCol', { defaultValue: 'Progress' })}<ColumnResizer onResize={(deltaX) => onColumnResize('progress', deltaX)} /></div>
        <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.startDate}px`, minWidth: `${columnWidths.startDate}px` }}>{t('timeline.startDateCol', { defaultValue: 'Start Date' })}<ColumnResizer onResize={(deltaX) => onColumnResize('startDate', deltaX)} /></div>
        <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.dueDate}px`, minWidth: `${columnWidths.dueDate}px` }}>{t('timeline.dueDateCol', { defaultValue: 'Due Date' })}<ColumnResizer onResize={(deltaX) => onColumnResize('dueDate', deltaX)} /></div>
        <div className="shrink-0 text-left px-2 relative group flex items-center h-full overflow-hidden" style={{ width: `${columnWidths.assignee}px`, minWidth: `${columnWidths.assignee}px` }}>{t('timeline.assigneeCol', { defaultValue: 'Assignee' })}<ColumnResizer onResize={(deltaX) => onColumnResize('assignee', deltaX)} /></div>
      </div>

      {treeRoots.map((rootNode) => (
        <IssueTreeNode
          key={rootNode.issue_id}
          node={rootNode}
          depth={0}
          activeLines={[]}
          isLast
          rootIssueId={rootIssueId}
          savingIssueIds={savingIssueIds}
          editingDateRange={editingDateRange}
          onStartDateRangeEdit={onStartDateRangeEdit}
          onCommitDateRangeEdit={onCommitDateRangeEdit}
          onCancelDateRangeEdit={onCancelDateRangeEdit}
          onAddSubIssue={onAddSubIssue}
          onEditIssue={onEditIssue}
          onViewIssue={onViewIssue}
          selectedIssueId={selectedIssueId}
          onSelectIssue={onSelectIssue}
          registerRowRef={registerRowRef}
          masters={masters}
          editOptionsByIssueId={editOptionsByIssueId}
          onFieldUpdate={onFieldUpdate}
          columnWidths={columnWidths}
          density={density}
        />
      ))}
    </>
  );
}
