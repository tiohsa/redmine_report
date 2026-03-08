import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import {
  fetchTaskDetails,
  fetchTaskMasters,
  TaskDetailIssue,
  TaskMasters,
  updateTaskDates,
  updateTaskFields,
  WeeklyApiError
} from '../../services/scheduleReportApi';
import { createIssue, BulkIssuePayload } from '../bulkIssueRegistration/bulkIssueApi';
import { buildTimelineAxis, createDateToX, createRangeToWidth } from './timelineAxis';

type TaskDetailsDialogProps = {
  open: boolean;
  projectIdentifier: string;
  issueId: number;
  issueTitle?: string;
  projectName?: string;
  versionName?: string;
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
  onEditIssue: (issue: TaskDetailIssue) => void;
  onSelectIssue?: (node: TreeNodeType) => void;
  selectedIssueId?: number | null;
  masters: TaskMasters | null;
  onFieldUpdate: (issueId: number, field: string, value: string | number | null) => Promise<void>;
};

type EditingCell = { field: string; value: string };

type ProcessFlowStep = {
  id: number;
  title: string;
  rangeLabel: string;
  startDate: string;
  dueDate: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  progress: number;
};

const processStatusStyles: Record<ProcessFlowStep['status'], { fill: string; text: string; stroke: string }> = {
  COMPLETED: { fill: '#1e3a8a', text: '#ffffff', stroke: '#1e3a8a' },
  IN_PROGRESS: { fill: '#2563eb', text: '#1e3a8a', stroke: '#2563eb' },
  PENDING: { fill: '#f1f5f9', text: '#475569', stroke: '#94a3b8' }
};

const PROCESS_FLOW_MIN_WIDTH = 640;
const PROCESS_FLOW_YEAR_ROW_HEIGHT = 24;
const PROCESS_FLOW_MONTH_ROW_HEIGHT = 24;
const PROCESS_FLOW_HEADER_HEIGHT = PROCESS_FLOW_YEAR_ROW_HEIGHT + PROCESS_FLOW_MONTH_ROW_HEIGHT;
const PROCESS_FLOW_LANE_HEIGHT = 70;
const PROCESS_FLOW_BAR_HEIGHT = 36;
const PROCESS_FLOW_BAR_Y = 12;
const PROCESS_FLOW_POINT_DEPTH = 18;
const PROCESS_FLOW_RANGE_LABEL_Y = PROCESS_FLOW_BAR_Y + PROCESS_FLOW_BAR_HEIGHT + 16;
const PROCESS_FLOW_SVG_HEIGHT = PROCESS_FLOW_HEADER_HEIGHT + PROCESS_FLOW_LANE_HEIGHT;

const ProcessChevron = ({
  x,
  y,
  width,
  height,
  pointDepth,
  isFirst,
  fill,
  stroke,
  progress,
  id
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  pointDepth: number;
  isFirst: boolean;
  fill: string;
  stroke: string;
  progress: number;
  id: number;
}) => {
  const hasLeftNotch = !isFirst;
  const leftShape = !hasLeftNotch
    ? `M ${x} ${y} L ${x} ${y + height}`
    : `M ${x} ${y} L ${x + pointDepth} ${y + height / 2} L ${x} ${y + height}`;
  const rightBaseX = x + Math.max(width - pointDepth, 0);
  const rightTipX = x + width;
  const rightShape = `L ${rightBaseX} ${y + height} L ${rightTipX} ${y + height / 2} L ${rightBaseX} ${y}`;
  const pathData = `${leftShape} ${rightShape} Z`;

  if (progress > 0 && progress < 100) {
    const gradientId = `task-details-grad-${id}`;
    return (
      <g>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset={`${progress}%`} stopColor={fill} />
            <stop offset={`${progress}%`} stopColor="#cbd5e1" />
          </linearGradient>
        </defs>
        <path d={pathData} fill={`url(#${gradientId})`} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
        {hasLeftNotch && <path d={leftShape} stroke="#ffffff" strokeWidth="2" fill="none" />}
      </g>
    );
  }

  return (
    <g>
      <path d={pathData} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {hasLeftNotch && <path d={leftShape} stroke="#ffffff" strokeWidth="2" fill="none" />}
    </g>
  );
};

const shiftIsoDate = (isoDate: string, deltaDays: number) => format(addDays(parseISO(isoDate), deltaDays), 'yyyy-MM-dd');

type ProcessDragMode = 'move' | 'resize-left' | 'resize-right';

type ProcessDragSession = {
  issueId: number;
  pointerId: number;
  mode: ProcessDragMode;
  startClientX: number;
  originalStartDate: string;
  originalDueDate: string;
  currentStartDate: string;
  currentDueDate: string;
};

const IssueTreeNode = ({
  node,
  depth,
  activeLines,
  isLast,
  rootIssueId,
  savingIssueIds,
  handleDateChange,
  onAddSubIssue,
  onEditIssue,
  onSelectIssue,
  selectedIssueId,
  masters,
  onFieldUpdate
}: IssueTreeNodeProps) => {
  const progressRatio = Math.max(0, Math.min(100, Number(node.done_ratio ?? 0)));
  const isDone = progressRatio === 100;
  const isSelected = selectedIssueId === node.issue_id;
  const [collapsed, setCollapsed] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [isSavingField, setIsSavingField] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.type === 'text' || inputRef.current.type === 'number') {
        inputRef.current.select();
      }
    }
  }, [editingCell]);

  const statusLabel = node.status_name || t('status.pending');
  const isClosed = node.status_is_closed ?? false;
  const isInProgress = !isClosed && progressRatio > 0;
  const statusBg = isClosed ? 'bg-emerald-500' : isInProgress ? 'bg-blue-500' : 'bg-slate-300';
  const statusText = isClosed ? 'text-white' : isInProgress ? 'text-white' : 'text-slate-600';

  const dateRange = (() => {
    const s = node.start_date ? node.start_date.replace(/-/g, '/') : '';
    const d = node.due_date ? node.due_date.replace(/-/g, '/') : '';
    if (s && d) return `${s} - ${d}`;
    if (s) return s;
    if (d) return d;
    return '';
  })();
  const hasBothDates = Boolean(node.start_date && node.due_date);
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

  const startEdit = (field: string, currentValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCell({ field, value: currentValue });
  };

  const cancelEdit = () => setEditingCell(null);

  const commitEdit = async (field: string, rawValue: string) => {
    setEditingCell(null);
    let value: string | number | null = rawValue;
    if (['tracker_id', 'status_id', 'priority_id', 'done_ratio'].includes(field)) {
      value = rawValue === '' ? null : Number(rawValue);
    } else if (field === 'assigned_to_id') {
      value = rawValue === '' || rawValue === '0' ? null : Number(rawValue);
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
      void commitEdit(editingCell!.field, editingCell!.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const isEditing = (field: string) => editingCell?.field === field;
  const isSaving = savingIssueIds[node.issue_id] || isSavingField;

  const cellClass = 'group/cell cursor-text';

  return (
    <>
      <div
        className={`flex items-center min-h-[44px] transition-colors relative group px-4 border-b border-slate-100/90 ${isSelected ? 'bg-slate-100/90' : 'hover:bg-slate-50/80'}`}
      >
        {/* Tree connectors */}
        <div className="absolute left-4 top-0 bottom-0 flex pointer-events-none" style={{ width: `${depth * 20}px` }}>
          {activeLines.map((isActive, level) => (
            <svg key={level} width="20" height="100%" className="flex-shrink-0 overflow-visible">
              {isActive && (
                <line x1="10" y1="0" x2="10" y2="100%" stroke="#cbd5e1" strokeWidth="1.5" />
              )}
            </svg>
          ))}
          {depth > 0 && (
            <svg width="20" height="100%" className="flex-shrink-0 overflow-visible">
              <line x1="10" y1="0" x2="10" y2={isLast ? '50%' : '100%'} stroke="#cbd5e1" strokeWidth="1.5" />
              <line x1="10" y1="50%" x2="20" y2="50%" stroke="#cbd5e1" strokeWidth="1.5" />
            </svg>
          )}
        </div>

        {node.children.length > 0 && (
          <div className="absolute pointer-events-none" style={{ left: `${16 + depth * 20}px`, top: '50%', bottom: 0, width: '20px' }}>
            {!collapsed && (
              <svg width="20" height="100%" className="overflow-visible">
                <line x1="10" y1="0" x2="10" y2="100%" stroke="#cbd5e1" strokeWidth="1.5" />
              </svg>
            )}
          </div>
        )}

        {/* TASK Column */}
        <div className="w-[280px] min-w-[280px] shrink-0 flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
          <div className="w-5 mr-1 flex-shrink-0 flex items-center justify-center">
            {node.children.length > 0 && (
              <button
                type="button"
                className="p-0.5 !border-0 ring-0 shadow-none bg-transparent appearance-none rounded-sm text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus:outline-none cursor-pointer flex-shrink-0 z-10"
                onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  {collapsed
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  }
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center min-w-0 z-10 flex-1">
            <span
              className="flex-shrink-0 text-slate-400 text-xs font-semibold mr-1.5 cursor-pointer hover:text-blue-500"
              onClick={(e) => { e.stopPropagation(); onSelectIssue?.(node); }}
            >#{node.issue_id}</span>
            {isEditing('subject') ? (
              <input
                ref={inputRef}
                type="text"
                className="flex-1 text-[13px] h-7 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700 min-w-0"
                value={editingCell!.value}
                onChange={(e) => setEditingCell({ field: 'subject', value: e.target.value })}
                onBlur={() => { void commitEdit('subject', editingCell!.value); }}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                data-testid="task-subject"
                className={`text-[13px] ${depth === 0 ? 'font-semibold' : 'font-medium'} text-slate-700 truncate hover:text-blue-600 block cursor-pointer`}
                onClick={(e) => { e.stopPropagation(); onSelectIssue?.(node); }}
                onDoubleClick={(e) => startEdit('subject', node.subject, e)}
                title={node.subject}
              >
                {node.subject}
              </span>
            )}
            {!isEditing('subject') && (
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-1 flex-shrink-0">
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-6 h-6 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded cursor-pointer"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddSubIssue(node); }}
                  title={t('timeline.addSubIssue')}
                >
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-6 h-6 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded cursor-pointer"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditIssue(node); }}
                  title={t('timeline.editIssue')}
                  aria-label={t('timeline.editIssue')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.625 2.625 0 113.712 3.713L8.25 20.524 3 21l.476-5.25L16.862 4.487z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* TRACKER Column */}
        <div
          className={`w-[90px] min-w-[90px] shrink-0 flex items-center justify-start px-2 ${cellClass}`}
          onDoubleClick={(e) => startEdit('tracker_id', String(node.tracker_id || ''), e)}
        >
          {isEditing('tracker_id') && masters ? (
            <select
              className="w-full text-[11px] h-7 px-1 border border-blue-400 rounded-md focus:outline-none bg-white text-slate-700"
              value={editingCell!.value}
              onChange={(e) => { void commitEdit('tracker_id', e.target.value); }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            >
              {masters.trackers.map((tr) => (
                <option key={tr.id} value={String(tr.id)}>{tr.name}</option>
              ))}
            </select>
          ) : (
            <span
              className={`inline-flex max-w-full items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold truncate ${trackerBadgeClass} group/cell:hover:ring-blue-300`}
              title={node.tracker_name || ''}
            >
              {node.tracker_name || '-'}
            </span>
          )}
        </div>

        {/* PRIORITY Column */}
        <div
          className={`w-[90px] min-w-[90px] shrink-0 flex items-center justify-start px-2 ${cellClass}`}
          onDoubleClick={(e) => startEdit('priority_id', String(node.priority_id || ''), e)}
        >
          {isEditing('priority_id') && masters ? (
            <select
              className="w-full text-[11px] h-7 px-1 border border-blue-400 rounded-md focus:outline-none bg-white text-slate-700"
              value={editingCell!.value}
              onChange={(e) => { void commitEdit('priority_id', e.target.value); }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            >
              {masters.priorities.filter(p => p.id !== null).map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          ) : (
            <span
              className={`inline-flex max-w-full items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold truncate ${priorityBadgeClass}`}
              title={node.priority_name || ''}
            >
              {node.priority_name || '-'}
            </span>
          )}
        </div>

        {/* STATUS Column */}
        <div
          className={`w-[80px] min-w-[80px] shrink-0 flex items-center justify-start px-2 ${cellClass}`}
          onDoubleClick={(e) => startEdit('status_id', String(node.status_id || ''), e)}
        >
          {isEditing('status_id') && masters ? (
            <select
              className="w-full text-[11px] h-7 px-1 border border-blue-400 rounded-md focus:outline-none bg-white text-slate-700"
              value={editingCell!.value}
              onChange={(e) => { void commitEdit('status_id', e.target.value); }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            >
              {masters.statuses.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          ) : (
            <span className={`inline-flex items-center justify-center min-w-[52px] text-[10px] font-bold px-2 py-[3px] rounded-full ${statusBg} ${statusText}`}>
              {statusLabel}
            </span>
          )}
        </div>

        {/* PROGRESS Column */}
        <div
          className={`w-[120px] min-w-[120px] shrink-0 flex items-center gap-2 justify-start px-2 ${cellClass}`}
          onDoubleClick={(e) => startEdit('done_ratio', String(progressRatio), e)}
        >
          {isEditing('done_ratio') ? (
            <input
              ref={inputRef}
              type="number"
              min={0}
              max={100}
              className="w-[70px] text-[11px] h-7 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700"
              value={editingCell!.value}
              onChange={(e) => setEditingCell({ field: 'done_ratio', value: e.target.value })}
              onBlur={() => { void commitEdit('done_ratio', editingCell!.value); }}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <div className="h-1.5 w-full max-w-[70px] overflow-hidden rounded-full bg-slate-200 relative">
                <div className={`absolute left-0 top-0 bottom-0 rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progressRatio}%` }} />
              </div>
              <span className="text-[10px] text-slate-500 font-medium tabular-nums" data-testid="progress-text">{progressRatio}%</span>
            </>
          )}
        </div>

        {/* DATE RANGE Column */}
        <div className="w-[260px] min-w-[260px] shrink-0 flex items-center gap-1.5 px-2 justify-start">
          <input
            type="date"
            data-testid="start-date-input"
            className="w-[110px] text-[11px] h-7 px-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 tabular-nums text-slate-600 bg-white"
            value={node.start_date || ''}
            onChange={(e) => handleDateChange(node, 'start_date', e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-slate-400 text-[10px]">-</span>
          <input
            type="date"
            data-testid="due-date-input"
            className="w-[110px] text-[11px] h-7 px-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 tabular-nums text-slate-600 bg-white"
            value={node.due_date || ''}
            onChange={(e) => handleDateChange(node, 'due_date', e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          {isSaving && (
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 ml-1"></div>
          )}
        </div>

        {/* ASSIGNEE Column */}
        <div
          className={`w-[120px] min-w-[120px] shrink-0 flex items-center justify-start gap-1.5 px-2 ${cellClass}`}
          onDoubleClick={(e) => startEdit('assigned_to_id', String(node.assignee_id || ''), e)}
        >
          {isEditing('assigned_to_id') && masters ? (
            <select
              className="w-full text-[11px] h-7 px-1 border border-blue-400 rounded-md focus:outline-none bg-white text-slate-700"
              value={editingCell!.value}
              onChange={(e) => { void commitEdit('assigned_to_id', e.target.value); }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            >
              {masters.members.map((m) => (
                <option key={m.id ?? 'none'} value={m.id === null ? '' : String(m.id)}>{m.name}</option>
              ))}
            </select>
          ) : (
            node.assignee_name ? (
              <>
                <div className="w-6 h-6 rounded-full bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                  </svg>
                </div>
                <span className="text-[12px] text-slate-600 truncate">{node.assignee_name}</span>
              </>
            ) : (
              <span className="text-[11px] text-slate-400">-</span>
            )
          )}
        </div>
      </div>

      {!collapsed && node.children.map((child, idx) => (
        <IssueTreeNode
          key={child.issue_id}
          node={child}
          depth={depth + 1}
          activeLines={depth === 0 ? [] : [...activeLines, !isLast]}
          isLast={idx === node.children.length - 1}
          rootIssueId={rootIssueId}
          savingIssueIds={savingIssueIds}
          handleDateChange={handleDateChange}
          onAddSubIssue={onAddSubIssue}
          onEditIssue={onEditIssue}
          onSelectIssue={onSelectIssue}
          selectedIssueId={selectedIssueId}
          masters={masters}
          onFieldUpdate={onFieldUpdate}
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

type IssueEditDialogProps = {
  projectIdentifier: string;
  issueId: number;
  issueUrl: string;
  onSaved?: (updatedIssueId?: number) => void;
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
  const cleanupIframeEscRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setIframeReady(false);
    handledCreationRef.current = false;
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
  }, [iframeUrl]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  useEffect(() => () => {
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
  }, []);

  const createBulkIssues = async (newParentIssueId: number, lines: string[]) => {
    for (const subject of lines) {
      const payload: BulkIssuePayload = { subject };
      await createIssue(projectIdentifier, newParentIssueId, payload);
    }
  };

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

  const createParentIssueFromEmbeddedForm = async (): Promise<number> => {
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
      throw new Error(t('embeddedIssueForm.createParentIssueFailed', { status: res.status }));
    }

    const locationCandidates = [res.url, res.headers.get('x-response-url') || '', res.headers.get('location') || ''];
    const createdIssueId = locationCandidates
      .map((url) => url.match(/\/issues\/(\d+)(?:[/?#]|$)/))
      .find((match): match is RegExpMatchArray => Boolean(match && match[1]));

    if (!createdIssueId) {
      throw new Error(t('embeddedIssueForm.createdParentIssueIdNotFound'));
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
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="bg-white w-full max-w-[95vw] h-[95vh] rounded-2xl shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              #{parentIssueId}
            </span>
            <span className="text-[13px] font-semibold text-slate-700">{t('subIssueDialog.iframeTitle')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 shadow-sm transition-colors"
              title={t('common.openInNewTab')}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" />
              </svg>
            </a>
            <button
              type="button"
              aria-label={t('timeline.closeCreateIssueDialogAria')}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 shadow-sm transition-colors cursor-pointer"
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
            title={t('subIssueDialog.iframeTitle')}
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
                  #issue-form input[name="commit"],
                  #issue-form button[name="commit"],
                  #issue-form input[name="continue"],
                  #issue-form button[name="continue"],
                  #new_issue input[name="commit"],
                  #new_issue button[name="commit"],
                  #new_issue input[name="continue"],
                  #new_issue button[name="continue"],
                  #issue-form input[type="submit"][value="作成"],
                  #issue-form input[type="submit"][value="連続作成"],
                  #issue-form input[type="submit"][value="Create"],
                  #issue-form input[type="submit"][value="Create and continue"],
                  #new_issue input[type="submit"][value="作成"],
                  #new_issue input[type="submit"][value="連続作成"],
                  #new_issue input[type="submit"][value="Create"],
                  #new_issue input[type="submit"][value="Create and continue"] {
                    display: none !important;
                  }
                `;
                doc.head.appendChild(style);
                cleanupIframeEscRef.current?.();
                const onIframeEsc = (event: KeyboardEvent) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose();
                  }
                };
                doc.addEventListener('keydown', onIframeEsc);
                cleanupIframeEscRef.current = () => {
                  doc.removeEventListener('keydown', onIframeEsc);
                };
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
            <span className="text-[13px]">{t('subIssueDialog.bulkSectionTitle')}</span>
          </button>

          {bulkOpen && (
            <div className="mt-3">
              <textarea
                className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[13px] bg-white text-slate-800 resize-y"
                placeholder={t('subIssueDialog.bulkPlaceholder')}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-3">
            <button
              type="button"
              className="rounded-[6px] border bg-white px-6 text-[14px] font-medium transition-colors cursor-pointer flex items-center justify-center antialiased"
              style={{
                width: '118px',
                height: '40px',
                borderColor: '#cbd5e1',
                color: '#334155',
                fontFamily: "'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif"
              }}
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="rounded-[6px] px-6 text-[14px] font-bold text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center antialiased"
              style={{
                width: '114px',
                height: '40px',
                backgroundColor: '#1b69e3',
                color: '#fff',
                fontFamily: "'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif"
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

function IssueEditDialog({
  projectIdentifier,
  issueId,
  issueUrl,
  onSaved,
  onClose
}: IssueEditDialogProps) {
  const iframeUrl = `${issueUrl}/edit`;
  const externalUrl = iframeUrl;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const handledSaveRef = useRef(false);
  const cleanupIframeEscRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setIframeReady(false);
    handledSaveRef.current = false;
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
  }, [iframeUrl]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  useEffect(() => () => {
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
  }, []);

  const createBulkIssues = async (parentIssueId: number, lines: string[]) => {
    for (const subject of lines) {
      const payload: BulkIssuePayload = { subject };
      await createIssue(projectIdentifier, parentIssueId, payload);
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
        form.setAttribute('action', `${actionUrl.pathname}${actionUrl.search}${actionUrl.hash}`);
      } catch {
        // Ignore invalid URL and keep original action.
      }
    });
  };

  const findEmbeddedIssueForm = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) throw new Error(t('embeddedIssueForm.formNotLoaded'));
    const form =
      doc.querySelector<HTMLFormElement>('form#issue-form') ||
      doc.querySelector<HTMLFormElement>('form#edit_issue') ||
      doc.querySelector<HTMLFormElement>('form#new_issue') ||
      doc.querySelector<HTMLFormElement>('#issue-form form') ||
      doc.querySelector<HTMLFormElement>('form.edit_issue') ||
      doc.querySelector<HTMLFormElement>('form.new_issue');
    if (!form) throw new Error(t('embeddedIssueForm.formNotFound'));
    return { doc, form };
  };

  const hasEmbeddedIssueForm = (doc: Document): boolean =>
    Boolean(
      doc.querySelector<HTMLFormElement>('form#issue-form') ||
      doc.querySelector<HTMLFormElement>('form#edit_issue') ||
      doc.querySelector<HTMLFormElement>('form#new_issue') ||
      doc.querySelector<HTMLFormElement>('#issue-form form') ||
      doc.querySelector<HTMLFormElement>('form.edit_issue') ||
      doc.querySelector<HTMLFormElement>('form.new_issue')
    );

  const submitDefaultIssueForm = () => {
    try {
      const { form } = findEmbeddedIssueForm();
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
      if (form.dispatchEvent(submitEvent)) form.submit();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    }
  };

  const saveEditedIssueFromEmbeddedForm = async (): Promise<number> => {
    const { form } = findEmbeddedIssueForm();
    const action = form.getAttribute('action') || `/issues/${issueId}`;
    const method = (form.getAttribute('method') || 'post').toUpperCase();
    const formData = new FormData(form);
    const res = await fetch(action, {
      method,
      credentials: 'same-origin',
      body: formData
    });
    if (!res.ok) {
      throw new Error(t('common.alertError', { message: `status=${res.status}` }));
    }

    const locationCandidates = [res.url, res.headers.get('x-response-url') || '', res.headers.get('location') || '', action];
    const matched = locationCandidates
      .map((url) => url.match(/\/issues\/(\d+)(?:[/?#]|$)/))
      .find((match): match is RegExpMatchArray => Boolean(match && match[1]));
    if (!matched) return issueId;
    return Number(matched[1]);
  };

  const handleSave = async () => {
    const lines = bulkText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    if (lines.length === 0) {
      submitDefaultIssueForm();
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedIssueId = await saveEditedIssueFromEmbeddedForm();
      await createBulkIssues(updatedIssueId, lines);
      setBulkText('');
      setBulkOpen(false);
      onSaved?.(updatedIssueId);
      onClose();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="bg-white w-full max-w-[95vw] h-[95vh] rounded-2xl shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              #{issueId}
            </span>
            <span className="text-[13px] font-semibold text-slate-700">{t('timeline.editIssueDialogTitle')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 shadow-sm transition-colors"
              title={t('timeline.editIssue')}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 4h6v6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 14L20 4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h4" />
              </svg>
            </a>
            <button
              type="button"
              aria-label={t('timeline.closeEditIssueDialogAria')}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 shadow-sm transition-colors cursor-pointer"
              onClick={onClose}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-[400px] bg-white">
          <iframe
            ref={iframeRef}
            title={t('timeline.editIssueDialogTitle')}
            src={iframeUrl}
            className={`absolute inset-0 w-full h-full border-0 bg-white ${iframeReady ? 'opacity-100' : 'opacity-0'}`}
            onLoad={(e) => {
              try {
                const doc = (e.target as HTMLIFrameElement).contentDocument;
                if (!doc) return;

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
                  #issue-form input[name="commit"],
                  #issue-form button[name="commit"],
                  #issue-form input[name="continue"],
                  #issue-form button[name="continue"],
                  #edit_issue input[name="commit"],
                  #edit_issue button[name="commit"],
                  #new_issue input[name="commit"],
                  #new_issue button[name="commit"],
                  input[type="submit"][value="保存"],
                  input[type="submit"][value="Save"] {
                    display: none !important;
                  }
                `;
                doc.head.appendChild(style);
                cleanupIframeEscRef.current?.();
                const onIframeEsc = (event: KeyboardEvent) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose();
                  }
                };
                doc.addEventListener('keydown', onIframeEsc);
                cleanupIframeEscRef.current = () => doc.removeEventListener('keydown', onIframeEsc);
                normalizeEmbeddedFormActions(doc);

                const pathname = doc.location?.pathname || '';
                if (
                  !handledSaveRef.current &&
                  new RegExp(`^/issues/${issueId}(?:/)?$`).test(pathname) &&
                  !hasEmbeddedIssueForm(doc)
                ) {
                  handledSaveRef.current = true;
                  onSaved?.(issueId);
                  onClose();
                  return;
                }
              } catch {
                // Ignore cross-origin / iframe access issues.
              }
              requestAnimationFrame(() => setIframeReady(true));
            }}
          />
          {!iframeReady && (
            <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600"></div>
            </div>
          )}
        </div>

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
            <span className="text-[13px]">{t('subIssueDialog.bulkSectionTitle')}</span>
          </button>

          {bulkOpen && (
            <div className="mt-3">
              <textarea
                className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[13px] bg-white text-slate-800 resize-y"
                placeholder={t('subIssueDialog.bulkPlaceholder')}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-3">
            <button
              type="button"
              className="rounded-[6px] border bg-white px-6 text-[14px] font-medium transition-colors cursor-pointer flex items-center justify-center antialiased"
              style={{
                width: '118px',
                height: '40px',
                borderColor: '#cbd5e1',
                color: '#334155',
                fontFamily: "'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif"
              }}
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="rounded-[6px] px-6 text-[14px] font-bold text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center antialiased"
              style={{
                width: '114px',
                height: '40px',
                backgroundColor: '#1b69e3',
                color: '#fff',
                fontFamily: "'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif"
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

export function TaskDetailsDialog({
  open,
  projectIdentifier,
  issueId,
  issueTitle,
  projectName,
  versionName,
  onTaskDatesUpdated,
  onClose
}: TaskDetailsDialogProps) {
  const [issues, setIssues] = useState<TaskDetailIssue[]>([]);
  const [baselineById, setBaselineById] = useState<Record<number, TaskDetailIssue>>({});
  const [savingIssueIds, setSavingIssueIds] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [masters, setMasters] = useState<import('../../services/scheduleReportApi').TaskMasters | null>(null);
  const [createIssueContext, setCreateIssueContext] = useState<{
    issueId: number;
    startDate: string | null;
    dueDate: string | null;
  } | null>(null);
  const [editIssueContext, setEditIssueContext] = useState<{
    issueId: number;
    issueUrl: string;
  } | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<TreeNodeType | null>(null);
  const [editingDescription, setEditingDescription] = useState<boolean>(false);
  const [descriptionDraft, setDescriptionDraft] = useState<string>('');
  const [newCommentDraft, setNewCommentDraft] = useState<string>('');
  const [isSavingComment, setIsSavingComment] = useState<boolean>(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState<string>('');
  const issuesRef = useRef<TaskDetailIssue[]>([]);
  const baselineByIdRef = useRef<Record<number, TaskDetailIssue>>({});
  const savingIssueIdsRef = useRef<Record<number, boolean>>({});
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const hasDateChangesRef = useRef(false);
  const [processDragSession, setProcessDragSession] = useState<ProcessDragSession | null>(null);
  const processDragRef = useRef<ProcessDragSession | null>(null);
  const processFlowContainerRef = useRef<HTMLDivElement | null>(null);
  const [processFlowContainerWidth, setProcessFlowContainerWidth] = useState(0);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Load master data when dialog opens
  useEffect(() => {
    if (!open) return;
    fetchTaskMasters(projectIdentifier).then(setMasters).catch(() => { /* best-effort */ });
  }, [open, projectIdentifier]);

  useLayoutEffect(() => {
    if (!open || loading || issues.length === 0 || !processFlowContainerRef.current) return;

    const element = processFlowContainerRef.current;
    const updateWidth = () => {
      setProcessFlowContainerWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, [open, loading, issues.length]);

  const reloadTaskDetails = useCallback(async (expectedIssueId?: number) => {
    setLoading(true);
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
      setSelectedIssue((prev) => {
        const targetIssueId = expectedIssueId ?? prev?.issue_id;
        if (!targetIssueId) return prev;
        const found = latestRows.find((row) => row.issue_id === targetIssueId);
        return found ? { ...found, children: [] } : prev;
      });
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : t('timeline.detailsLoadFailed'));
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
    setEditIssueContext(null);
    setEditingDescription(false);
    setNewCommentDraft('');
    setEditingCommentId(null);
    setEditingCommentDraft('');
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

  useEffect(() => {
    processDragRef.current = processDragSession;
  }, [processDragSession]);

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

  const processFlowSteps = useMemo<ProcessFlowStep[]>(() => {
    const parentIds = new Set<number>(issues.filter((issue) => issue.parent_id).map((issue) => issue.parent_id as number));

    return issues
      .filter((issue) => Boolean(issue.start_date && issue.due_date))
      .filter((issue) => issue.issue_id !== issueId)
      .filter((issue) => !parentIds.has(issue.issue_id))
      .map((issue) => {
        const progress = Math.max(0, Math.min(100, Number(issue.done_ratio ?? 0)));
        const status: ProcessFlowStep['status'] = issue.status_is_closed || progress === 100
          ? 'COMPLETED'
          : progress > 0
            ? 'IN_PROGRESS'
            : 'PENDING';
        return {
          id: issue.issue_id,
          title: issue.subject,
          startDate: issue.start_date as string,
          dueDate: issue.due_date as string,
          rangeLabel: `${issue.start_date} - ${issue.due_date}`,
          status,
          progress
        };
      })
      .sort((left, right) =>
        left.startDate.localeCompare(right.startDate) ||
        left.dueDate.localeCompare(right.dueDate) ||
        left.id - right.id
      );
  }, [issues, issueId]);

  const processFlowTimelineWidth = processFlowContainerWidth > 0
    ? Math.max(processFlowContainerWidth, PROCESS_FLOW_MIN_WIDTH)
    : Math.max(PROCESS_FLOW_MIN_WIDTH, processFlowSteps.length * 180);

  const processFlowAxis = useMemo(() => {
    if (processFlowSteps.length === 0) return null;

    return buildTimelineAxis({
      items: processFlowSteps.map((step) => ({
        start_date: step.startDate,
        end_date: step.dueDate
      })),
      containerWidth: processFlowTimelineWidth,
      defaultTimelineWidth: processFlowTimelineWidth
    });
  }, [processFlowSteps, processFlowTimelineWidth]);

  const processFlowPixelsPerDay = processFlowAxis?.pixelsPerDay ?? 1;

  const processFlowRenderSteps = useMemo(() => {
    if (!processFlowAxis) return [];

    const getX = createDateToX(processFlowAxis.minDate, processFlowAxis.pixelsPerDay);
    const getWidth = createRangeToWidth(processFlowAxis.pixelsPerDay);

    const positionedSteps = processFlowSteps
      .map((step) => {
        const currentSession = processDragSession?.issueId === step.id ? processDragSession : null;
        const startDate = currentSession?.currentStartDate ?? step.startDate;
        const dueDate = currentSession?.currentDueDate ?? step.dueDate;

        return {
          ...step,
          startDate,
          dueDate,
          rangeLabel: `${startDate} - ${dueDate}`,
          hitX: getX(startDate),
          hitWidth: getWidth(startDate, dueDate)
        };
      })
      .sort((left, right) =>
        left.startDate.localeCompare(right.startDate) ||
        left.dueDate.localeCompare(right.dueDate) ||
        left.id - right.id
      );

    return positionedSteps.map((step, index) => {
      const previousStep = index > 0 ? positionedSteps[index - 1] : null;
      const joinsPrevious = Boolean(
        previousStep &&
        differenceInCalendarDays(parseISO(step.startDate), parseISO(previousStep.dueDate)) === 1
      );
      const x = joinsPrevious ? step.hitX - PROCESS_FLOW_POINT_DEPTH : step.hitX;
      const width = joinsPrevious ? step.hitWidth + PROCESS_FLOW_POINT_DEPTH : step.hitWidth;

      return {
        ...step,
        isFirst: index === 0,
        joinsPrevious,
        x,
        width,
        textX: x + width / 2 + (index === 0 ? 0 : PROCESS_FLOW_POINT_DEPTH / 2)
      };
    });
  }, [processFlowAxis, processFlowSteps, processDragSession]);

  const titleContext = useMemo(
    () => [versionName, projectName].filter(Boolean).join(' / '),
    [projectName, versionName]
  );
  const dialogHeaderTitle = titleContext || issueTitle || `#${issueId}`;

  const isRowDirty = (row: TaskDetailIssue) => {
    const baseline = baselineByIdRef.current[row.issue_id];
    if (!baseline) return false;
    return baseline.start_date !== row.start_date || baseline.due_date !== row.due_date;
  };

  const saveRow = async (row: TaskDetailIssue) => {
    setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: true }));
    try {
      const updated = await updateTaskDates(projectIdentifier, row.issue_id, {
        start_date: row.start_date,
        due_date: row.due_date
      });
      // Preserve parent_id in the updated row
      updated.parent_id = row.parent_id;
      setIssues((prev) => prev.map((item) => (item.issue_id === updated.issue_id ? { ...item, ...updated } : item)));
      setBaselineById((prev) => ({ ...prev, [updated.issue_id]: updated }));
      hasDateChangesRef.current = true;
    } catch (error: unknown) {
      const message =
        error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : t('api.updateTaskDates', { status: 500 });
      alert(message);

      const baseline = baselineByIdRef.current[row.issue_id];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === row.issue_id ? { ...item, ...baseline } : item)));
        hasDateChangesRef.current = true; // Need to refresh Gantt chart if they actually saved previously, but for now we just revert our local list
      }
    } finally {
      setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: false }));
    }
  };

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
      setBaselineById((prev) => ({ ...prev, [updated.issue_id]: updated }));
      setSelectedIssue((prev) => (
        prev?.issue_id === updated.issue_id ? { ...prev, ...updated, children: prev.children } : prev
      ));
      hasDateChangesRef.current = true;
    } catch (error: unknown) {
      const message =
        error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : t('api.updateTaskDates', { status: 500 });
      alert(message);
      const baseline = baselineByIdRef.current[row.issue_id];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === row.issue_id ? { ...item, ...baseline } : item)));
      }
    } finally {
      setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: false }));
    }
  }, [projectIdentifier]);

  useEffect(() => {
    if (!processDragSession) return;

    const onPointerMove = (event: PointerEvent) => {
      const current = processDragRef.current;
      if (!current) return;
      if (typeof event.pointerId === 'number' && current.pointerId !== event.pointerId) return;
      if (!Number.isFinite(processFlowPixelsPerDay) || processFlowPixelsPerDay <= 0) return;

      const deltaDays = Math.round((event.clientX - current.startClientX) / processFlowPixelsPerDay);
      if (!Number.isFinite(deltaDays)) return;

      let nextStart = current.originalStartDate;
      let nextDue = current.originalDueDate;

      if (current.mode === 'move') {
        nextStart = shiftIsoDate(current.originalStartDate, deltaDays);
        nextDue = shiftIsoDate(current.originalDueDate, deltaDays);
      } else if (current.mode === 'resize-left') {
        const candidateStart = shiftIsoDate(current.originalStartDate, deltaDays);
        nextStart = candidateStart > current.originalDueDate ? current.originalDueDate : candidateStart;
      } else {
        const candidateDue = shiftIsoDate(current.originalDueDate, deltaDays);
        nextDue = candidateDue < current.originalStartDate ? current.originalStartDate : candidateDue;
      }

      if (nextStart === current.currentStartDate && nextDue === current.currentDueDate) return;

      const updated = { ...current, currentStartDate: nextStart, currentDueDate: nextDue };
      processDragRef.current = updated;
      setProcessDragSession(updated);
    };

    const onPointerUp = (event: PointerEvent) => {
      const current = processDragRef.current;
      if (!current) return;
      if (typeof event.pointerId === 'number' && current.pointerId !== event.pointerId) return;

      const issue = issuesRef.current.find((item) => item.issue_id === current.issueId);
      const hasChanged = current.currentStartDate !== current.originalStartDate || current.currentDueDate !== current.originalDueDate;
      if (issue && hasChanged) {
        void saveProcessFlowDates(issue, current.currentStartDate, current.currentDueDate);
      }

      processDragRef.current = null;
      setProcessDragSession(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [processDragSession, processFlowPixelsPerDay, saveProcessFlowDates]);

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

  const handleFieldUpdate = useCallback(async (issueId: number, field: string, value: string | number | null) => {
    const payload: Record<string, unknown> = { [field]: value };
    try {
      const updated = await updateTaskFields(projectIdentifier, issueId, payload as import('../../services/scheduleReportApi').TaskUpdatePayload);
      setIssues(prev => prev.map(item => item.issue_id === updated.issue_id ? { ...item, ...updated } : item));
      setBaselineById(prev => ({ ...prev, [updated.issue_id]: { ...prev[updated.issue_id], ...updated } }));
      setSelectedIssue(prev => prev?.issue_id === updated.issue_id ? { ...prev, ...updated, children: prev.children } : prev);
    } catch (error: unknown) {
      const message = error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : 'Update failed';
      alert(message);

      const baseline = baselineByIdRef.current[issueId];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === issueId ? { ...item, ...baseline } : item)));
        setSelectedIssue((prev) => (prev?.issue_id === issueId ? { ...prev, ...baseline, children: prev.children } : prev));
      }

      throw error;
    }
  }, [projectIdentifier, issues]);

  const handleSaveDescription = async () => {
    if (!selectedIssue) return;
    try {
      await handleFieldUpdate(selectedIssue.issue_id, 'description', descriptionDraft);
      setEditingDescription(false);
    } catch (error) {
      // Error is handled in handleFieldUpdate
    }
  };

  const handleAddComment = async () => {
    if (!selectedIssue || !newCommentDraft.trim()) return;
    setIsSavingComment(true);
    try {
      await handleFieldUpdate(selectedIssue.issue_id, 'notes', newCommentDraft.trim());
      setNewCommentDraft('');
    } catch (error) {
      // Error is handled in handleFieldUpdate
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleUpdateComment = async (journalId: number, notes: string) => {
    if (!selectedIssue) return;
    try {
      await import('../../services/scheduleReportApi').then(m => m.updateTaskJournal(projectIdentifier, journalId, notes));
      void reloadTaskDetails(selectedIssue.issue_id);
    } catch (error: unknown) {
      const message = error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : 'Update failed';
      alert(message);
    }
  };

  const startProcessFlowDrag = (
    event: React.PointerEvent<SVGRectElement>,
    step: ProcessFlowStep,
    mode: ProcessDragMode
  ) => {
    if (savingIssueIdsRef.current[step.id]) return;
    event.preventDefault();
    event.stopPropagation();

    const session: ProcessDragSession = {
      issueId: step.id,
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      originalStartDate: step.startDate,
      originalDueDate: step.dueDate,
      currentStartDate: step.startDate,
      currentDueDate: step.dueDate
    };

    processDragRef.current = session;
    setProcessDragSession(session);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4 transition-all" onClick={handleClose}>
      <div
        className="bg-white w-full max-w-[98vw] h-[94vh] rounded-md shadow-[0_18px_60px_rgba(15,23,42,0.22)] ring-1 ring-slate-200/70 flex flex-col overflow-hidden transition-all transform"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-2.5 flex items-center justify-between gap-3 bg-white relative z-10 border-b border-slate-200 flex-shrink-0 min-h-12 box-border">
          <div className="flex flex-row items-center gap-2.5 min-w-0">
            <div className="min-w-0">
              <h3 className="text-[16px] font-semibold text-slate-800 flex items-center gap-2 min-w-0" data-testid="task-details-title">
                <span className="truncate">{dialogHeaderTitle}</span>
                {dialogHeaderTitle !== `#${issueId}` && (
                  <span className="text-slate-300 font-semibold text-sm shrink-0">#{issueId}</span>
                )}
              </h3>
            </div>
            <button
              onClick={() => void reloadTaskDetails(issueId)}
              title={t('timeline.reloadTasks')}
              className="inline-flex items-center justify-center w-8 h-8 ml-1 border border-slate-200 bg-white text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400 shrink min-w-0">
            <div className="text-[12px] text-slate-500 font-semibold whitespace-nowrap">
              {t('timeline.totalTasks', { count: issues.length })}
            </div>
            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
              <div className="w-2.5 h-2.5 bg-blue-400 rounded-sm"></div>
              {t('timeline.legendWip')}
            </div>
            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
              <div className="w-2.5 h-2.5 bg-emerald-400 rounded-sm"></div>
              {t('timeline.legendDone')}
            </div>
          </div>

          <button
            aria-label={t('timeline.closeDialogAria')}
            className="inline-flex items-center justify-center w-8 h-8 border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg shadow-sm transition-colors flex-shrink-0 cursor-pointer"
            onClick={handleClose}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Split Panel Body */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-100 relative">
          {loading && (
            <div className="flex justify-center items-center py-12 absolute inset-0 bg-white/80 z-30">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {!loading && issues.length === 0 && (
            <div className="text-center py-12 m-6 bg-white rounded-xl border border-dashed border-slate-300 flex-shrink-0 w-full">
              <p className="text-sm text-slate-500">{t('timeline.detailsNoRows')}</p>
            </div>
          )}

          {!loading && issues.length > 0 && (
            <>
              <div className="mx-6 mt-5 mb-3 rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="px-4 py-2.5 text-[12px] font-semibold text-slate-600 border-b border-slate-100">
                  {t('timeline.processMode', { defaultValue: 'Process Flow' })}
                </div>
                <div className="overflow-x-auto px-4 py-3" data-testid="task-details-process-flow" ref={processFlowContainerRef}>
                  {processFlowAxis && processFlowRenderSteps.length > 0 ? (
                    <svg
                      data-testid="task-details-process-flow-svg"
                      width={processFlowAxis.timelineWidth}
                      height={PROCESS_FLOW_SVG_HEIGHT}
                      role="img"
                      aria-label={t('timeline.processMode', { defaultValue: 'Process Flow' })}
                    >
                      <rect
                        x={0}
                        y={0}
                        width={processFlowAxis.timelineWidth}
                        height={PROCESS_FLOW_YEAR_ROW_HEIGHT}
                        fill="#f8fafc"
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                      <rect
                        x={0}
                        y={PROCESS_FLOW_YEAR_ROW_HEIGHT}
                        width={processFlowAxis.timelineWidth}
                        height={PROCESS_FLOW_MONTH_ROW_HEIGHT}
                        fill="#f8fafc"
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                      {processFlowAxis.headerYears.map((year, index) => (
                        <g key={`process-year-${year.year}-${index}`} transform={`translate(${year.x}, 0)`}>
                          <rect x={0} y={0} width={year.width} height={PROCESS_FLOW_YEAR_ROW_HEIGHT} fill="none" stroke="#e2e8f0" strokeWidth="1" />
                          <text
                            data-testid={`task-details-process-year-${index}`}
                            x={year.width / 2}
                            y={PROCESS_FLOW_YEAR_ROW_HEIGHT / 2}
                            fill="#334155"
                            fontSize="11"
                            fontWeight="700"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {year.year}
                          </text>
                        </g>
                      ))}
                      {processFlowAxis.headerMonths.map((month, index) => (
                        <g key={`process-month-${month.label}-${index}`} transform={`translate(${month.x}, ${PROCESS_FLOW_YEAR_ROW_HEIGHT})`}>
                          <rect x={0} y={0} width={month.width} height={PROCESS_FLOW_MONTH_ROW_HEIGHT} fill="none" stroke="#e2e8f0" strokeWidth="1" />
                          <text
                            data-testid={`task-details-process-month-${index}`}
                            x={month.width / 2}
                            y={PROCESS_FLOW_MONTH_ROW_HEIGHT / 2}
                            fill="#334155"
                            fontSize="11"
                            fontWeight="700"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {month.label}
                          </text>
                        </g>
                      ))}

                      <g transform={`translate(0, ${PROCESS_FLOW_HEADER_HEIGHT})`}>
                        <rect
                          x={0}
                          y={0}
                          width={processFlowAxis.timelineWidth}
                          height={PROCESS_FLOW_LANE_HEIGHT}
                          fill="#ffffff"
                        />
                        {processFlowAxis.headerMonths.map((month, index) => (
                          <line
                            key={`process-month-line-${index}`}
                            x1={month.x}
                            y1={0}
                            x2={month.x}
                            y2={PROCESS_FLOW_LANE_HEIGHT}
                            stroke="#e2e8f0"
                            strokeDasharray="4 3"
                          />
                        ))}
                        <line
                          x1={0}
                          y1={PROCESS_FLOW_LANE_HEIGHT}
                          x2={processFlowAxis.timelineWidth}
                          y2={PROCESS_FLOW_LANE_HEIGHT}
                          stroke="#e2e8f0"
                          strokeWidth="1"
                        />

                        {processFlowRenderSteps.map((step) => {
                          const style = processStatusStyles[step.status];

                          return (
                            <g key={step.id} data-testid="task-details-process-step" opacity={savingIssueIds[step.id] ? 0.6 : 1}>
                              <ProcessChevron
                                x={step.x}
                                y={PROCESS_FLOW_BAR_Y}
                                width={step.width}
                                height={PROCESS_FLOW_BAR_HEIGHT}
                                pointDepth={PROCESS_FLOW_POINT_DEPTH}
                                isFirst={step.isFirst}
                                fill={style.fill}
                                stroke={style.stroke}
                                progress={step.progress}
                                id={step.id}
                              />
                              <rect
                                x={step.hitX}
                                y={PROCESS_FLOW_BAR_Y}
                                width={step.hitWidth}
                                height={PROCESS_FLOW_BAR_HEIGHT}
                                fill="transparent"
                                style={{ cursor: savingIssueIds[step.id] ? 'not-allowed' : 'grab' }}
                                onPointerDown={(event) => startProcessFlowDrag(event, step, 'move')}
                                data-testid={`task-details-process-step-hit-${step.id}`}
                              />
                              <rect
                                x={step.hitX}
                                y={PROCESS_FLOW_BAR_Y}
                                width={10}
                                height={PROCESS_FLOW_BAR_HEIGHT}
                                fill="transparent"
                                style={{ cursor: savingIssueIds[step.id] ? 'not-allowed' : 'ew-resize' }}
                                onPointerDown={(event) => startProcessFlowDrag(event, step, 'resize-left')}
                                data-testid={`task-details-process-step-left-${step.id}`}
                              />
                              <rect
                                x={Math.max(step.hitX + step.hitWidth - 10, step.hitX)}
                                y={PROCESS_FLOW_BAR_Y}
                                width={10}
                                height={PROCESS_FLOW_BAR_HEIGHT}
                                fill="transparent"
                                style={{ cursor: savingIssueIds[step.id] ? 'not-allowed' : 'ew-resize' }}
                                onPointerDown={(event) => startProcessFlowDrag(event, step, 'resize-right')}
                                data-testid={`task-details-process-step-right-${step.id}`}
                              />
                              <text
                                x={step.textX}
                                y={PROCESS_FLOW_BAR_Y + PROCESS_FLOW_BAR_HEIGHT / 2 + 1}
                                fill={style.text}
                                fontSize="11"
                                fontWeight="700"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                pointerEvents="none"
                              >
                                {step.title.length > 24 ? `${step.title.slice(0, 24)}…` : step.title}
                              </text>
                              <text
                                x={step.textX}
                                y={PROCESS_FLOW_RANGE_LABEL_Y}
                                fill="#64748b"
                                fontSize="10"
                                fontWeight="600"
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                {step.rangeLabel}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    </svg>
                  ) : (
                    <p className="text-sm text-slate-500">{t('timeline.detailsNoRows')}</p>
                  )}
                </div>
              </div>

              {/* Left Panel - Task List */}
              <div className="flex-1 flex min-h-0 px-6 pb-6">
                <div className={`flex flex-col min-h-0 border border-slate-200 rounded-xl bg-white ${selectedIssue ? 'w-[68%]' : 'w-full'} transition-all`}>
                {/* Column Headers */}
                  <div className="overflow-auto flex-1 bg-white rounded-l-xl">
                  <div className="flex items-center py-2 px-4 bg-slate-50 z-20 border-b border-slate-200 text-[11px] font-semibold text-slate-500 flex-shrink-0 h-11 box-border sticky top-0">
                    <div className="w-[280px] min-w-[280px] shrink-0 flex items-center">
                      <div className="w-5 mr-1" /> {/* Spacer for expand button */}
                      {t('timeline.task', { defaultValue: 'Task' })}
                    </div>
                    <div className="w-[90px] min-w-[90px] shrink-0 text-left px-2">{t('timeline.trackerCol', { defaultValue: 'Tracker' })}</div>
                    <div className="w-[90px] min-w-[90px] shrink-0 text-left px-2">{t('timeline.priorityCol', { defaultValue: 'Priority' })}</div>
                    <div className="w-[80px] min-w-[80px] shrink-0 text-left px-2">{t('timeline.statusCol', { defaultValue: 'Status' })}</div>
                    <div className="w-[120px] min-w-[120px] shrink-0 text-left px-2">{t('timeline.progressCol', { defaultValue: 'Progress' })}</div>
                    <div className="w-[260px] min-w-[260px] shrink-0 text-left px-2">{t('timeline.dateRangeCol', { defaultValue: 'Date Range' })}</div>
                    <div className="w-[120px] min-w-[120px] shrink-0 text-left px-2">{t('timeline.assigneeCol', { defaultValue: 'Assignee' })}</div>
                  </div>
                  {/* Task Tree */}
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
                      onEditIssue={(issue) => setEditIssueContext({
                        issueId: issue.issue_id,
                        issueUrl: issue.issue_url
                      })}
                      onSelectIssue={(issue) => {
                        setSelectedIssue(issue);
                        setEditingDescription(false);
                        setDescriptionDraft(issue.description || '');
                        setNewCommentDraft('');
                        setEditingCommentId(null);
                        setEditingCommentDraft('');
                      }}
                      selectedIssueId={selectedIssue?.issue_id}
                      masters={masters}
                      onFieldUpdate={handleFieldUpdate}
                    />
                  ))}
                  </div>
                </div>
              

              {/* Right Panel - Detail View */}
              {selectedIssue && (
                <div className="w-[34%] min-w-[340px] flex flex-col min-h-0 overflow-auto bg-[#f4f6fb] border border-slate-200 rounded-xl ml-3">
                  {/* Detail Header */}
                  <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-3 flex-shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-sm sticky top-0 z-10">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="text-[11px] leading-none font-semibold text-slate-400 shrink-0">
                          #{selectedIssue.issue_id}
                        </span>
                        <h4 className="text-[14px] leading-5 font-semibold text-slate-800 truncate">
                          {selectedIssue.subject}
                        </h4>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={selectedIssue.issue_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 shadow-sm cursor-pointer transition-colors"
                        title={t('common.openInNewTab', { defaultValue: 'Open in Redmine' })}
                        aria-label={t('common.openInNewTab', { defaultValue: 'Open in Redmine' })}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" />
                        </svg>
                      </a>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 shadow-sm cursor-pointer transition-colors"
                        title={t('timeline.editIssue')}
                        aria-label={t('timeline.editIssue')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditIssueContext({
                            issueId: selectedIssue.issue_id,
                            issueUrl: selectedIssue.issue_url
                          });
                        }}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.625 2.625 0 113.712 3.713L8.25 20.524 3 21l.476-5.25L16.862 4.487z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 shadow-sm cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedIssue(null);
                          setEditingDescription(false);
                          setNewCommentDraft('');
                          setEditingCommentId(null);
                          setEditingCommentDraft('');
                        }}
                        title={t('common.close', { defaultValue: 'Close' })}
                        aria-label={t('common.close', { defaultValue: 'Close' })}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Detail Fields removed */}

                  {/* Description */}
                  <div className="px-4 pb-3">
                    <div className="flex items-center mb-2">
                      <h5 className="text-[12px] font-semibold tracking-wide text-slate-500">{t('timeline.descriptionTab')}</h5>
                    </div>
                    {editingDescription ? (
                      <div className="bg-white rounded-xl border border-blue-400 shadow-sm overflow-hidden flex flex-col focus-within:ring-1 focus-within:ring-blue-500">
                        <textarea
                          className="w-full p-3 text-[13px] leading-[1.45] text-slate-700 bg-transparent border-none resize-y min-h-[120px] focus:outline-none focus:ring-0"
                          value={descriptionDraft}
                          onChange={(e) => setDescriptionDraft(e.target.value)}
                          placeholder={t('timeline.noDescription')}
                          autoFocus
                        />
                        <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 flex justify-end gap-2">
                          <button
                            type="button"
                            className="px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => {
                              setEditingDescription(false);
                              setDescriptionDraft(selectedIssue.description || '');
                            }}
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors cursor-pointer"
                            onClick={() => { void handleSaveDescription(); }}
                          >
                            {t('common.save')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm text-[13px] leading-[1.45] text-slate-600 min-h-[80px] whitespace-pre-wrap cursor-pointer hover:border-blue-300 transition-colors group relative"
                        onClick={() => {
                          setDescriptionDraft(selectedIssue.description || '');
                          setEditingDescription(true);
                        }}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex-1 min-w-0">
                            {selectedIssue.description || <span className="text-slate-400 italic">{t('timeline.noDescription')}</span>}
                          </div>
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDescriptionDraft(selectedIssue.description || '');
                              setEditingDescription(true);
                            }}
                            title={t('common.edit', { defaultValue: 'Edit' })}
                          >
                            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.625 2.625 0 113.712 3.713L8.25 20.524 3 21l.476-5.25L16.862 4.487z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Comments */}
                  <div className="px-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-[12px] font-semibold tracking-wide text-slate-500">{t('timeline.commentsTab')}</h5>
                      <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-500 shadow-sm">
                        {selectedIssue.comments?.length ?? 0}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {(selectedIssue.comments && selectedIssue.comments.length > 0) ? selectedIssue.comments.map((comment) => (
                        <div key={comment.id ?? `${comment.created_on}-${comment.author_name}-${comment.notes.slice(0, 12)}`} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col group">
                          {editingCommentId === comment.id && comment.id !== undefined ? (
                            <div className="flex flex-col focus-within:ring-1 focus-within:ring-blue-500">
                              <textarea
                                className="w-full p-3 text-[13px] leading-[1.45] text-slate-700 bg-transparent border-none resize-y min-h-[80px] focus:outline-none focus:ring-0"
                                value={editingCommentDraft}
                                onChange={(e) => setEditingCommentDraft(e.target.value)}
                                autoFocus
                              />
                              <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                                  onClick={() => {
                                    setEditingCommentId(null);
                                    setEditingCommentDraft('');
                                  }}
                                >
                                  {t('common.cancel')}
                                </button>
                                <button
                                  type="button"
                                  className="px-3 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-1"
                                  onClick={() => {
                                    void handleUpdateComment(comment.id!, editingCommentDraft);
                                    setEditingCommentId(null);
                                  }}
                                >
                                  {t('common.save')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="px-3 py-2.5 relative cursor-pointer hover:bg-slate-50/50 transition-colors"
                              onClick={() => {
                                setEditingCommentId(comment.id!);
                                setEditingCommentDraft(comment.notes || '');
                              }}
                            >
                              <div className="flex items-center justify-end gap-2 mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-slate-400 shrink-0">
                                    {comment.created_on ? comment.created_on.replace('T', ' ').slice(0, 16).replace(/-/g, '/') : ''}
                                  </span>
                                  {comment.id !== undefined && (
                                    <button
                                      type="button"
                                      className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCommentId(comment.id!);
                                        setEditingCommentDraft(comment.notes || '');
                                      }}
                                      title={t('common.edit', { defaultValue: 'Edit' })}
                                    >
                                      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.625 2.625 0 113.712 3.713L8.25 20.524 3 21l.476-5.25L16.862 4.487z" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="text-[12px] leading-[1.45] text-slate-600 whitespace-pre-wrap break-words">
                                {comment.notes}
                              </div>
                            </div>
                          )}
                        </div>
                      )) : (
                        <div className="p-3 bg-white rounded-xl border border-dashed border-slate-300 shadow-sm text-[12px] text-slate-400 text-center">
                          {t('timeline.noComments', { defaultValue: 'No comments' })}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col focus-within:ring-1 focus-within:ring-blue-500">
                      <textarea
                        className="w-full p-3 text-[13px] leading-[1.45] text-slate-700 bg-transparent border-none resize-y min-h-[80px] focus:outline-none focus:ring-0"
                        placeholder={t('timeline.addCommentPlaceholder', { defaultValue: 'Add a comment...' })}
                        value={newCommentDraft}
                        onChange={(e) => setNewCommentDraft(e.target.value)}
                        disabled={isSavingComment}
                      />
                      <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 flex justify-end">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1"
                          onClick={() => { void handleAddComment(); }}
                          disabled={!newCommentDraft.trim() || isSavingComment}
                        >
                          {isSavingComment && (
                            <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          )}
                          {t('common.add', { defaultValue: 'Add' })}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pb-2" />
                </div>
              )}
              </div>
            </>
          )}
        </div>

      </div>
      {
        createIssueContext !== null && (
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
        )
      }
      {
        editIssueContext !== null && (
          <IssueEditDialog
            projectIdentifier={projectIdentifier}
            issueId={editIssueContext.issueId}
            issueUrl={editIssueContext.issueUrl}
            onSaved={(updatedIssueId) => {
              void reloadTaskDetails(updatedIssueId ?? editIssueContext.issueId);
            }}
            onClose={() => setEditIssueContext(null)}
          />
        )
      }
    </div >
  );
}
