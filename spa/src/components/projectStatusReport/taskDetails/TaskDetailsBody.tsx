import { t } from '../../../i18n';
import { type TaskDetailIssue, type TaskIssueEditOptions, type TaskMasters } from '../../../services/scheduleReportApi';
import { type InlineDateRangeValue } from '../InlineDateRangeEditor';
import {
  type ProcessFlowDragMode,
  type ProcessFlowRenderStep,
  type ProcessFlowScaleMetrics
} from './processFlowGeometry';
import { IssueTreeTable } from './IssueTreeTable';
import { ProcessFlowCanvas } from './ProcessFlowCanvas';
import { type TableDensity, type TreeNodeType } from './shared';

type TaskDetailsBodyProps = {
  loading: boolean;
  issues: TaskDetailIssue[];
  detailsLayoutRef: React.RefObject<HTMLDivElement>;
  topPaneHeight: number;
  verticalResizeSession: unknown;
  startVerticalResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  startVerticalResizeWithMouse: (event: React.MouseEvent<HTMLDivElement>) => void;
  updateVerticalResize: (clientY: number, pointerId?: number) => void;
  stopVerticalResize: (pointerId?: number) => void;
  handleVerticalResizeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  processFlowAxis: ReturnType<typeof import('../timelineAxis').buildTimelineAxis> | null;
  processFlowRenderSteps: ProcessFlowRenderStep[];
  processFlowChartHeight: number;
  processFlowLaneHeight: number;
  processFlowBaseTopPadding: number;
  processFlowScaleMetrics: ProcessFlowScaleMetrics;
  selectedIssueId: number | null;
  activeIssueId: number | null;
  savingIssueIds: Record<number, boolean>;
  processFlowContainerRef: React.RefObject<HTMLDivElement>;
  startProcessFlowDrag: (event: React.PointerEvent<SVGRectElement>, step: ProcessFlowRenderStep, mode: ProcessFlowDragMode) => void;
  handleProcessStepClick: (step: ProcessFlowRenderStep) => void;
  handleProcessStepDoubleClick: (step: ProcessFlowRenderStep) => void;
  selectIssue: (issue: TaskDetailIssue | null) => void;
  selectIssueFromTable: (issue: TaskDetailIssue) => void;
  treeRoots: TreeNodeType[];
  rootIssueId: number;
  editingDateRange: InlineDateRangeValue | null;
  onStartDateRangeEdit: (row: TaskDetailIssue, field: 'start_date' | 'due_date', event?: React.MouseEvent) => void;
  onCommitDateRangeEdit: (row: TaskDetailIssue, next: InlineDateRangeValue) => void;
  onCancelDateRangeEdit: () => void;
  onAddSubIssue: (issue: TaskDetailIssue) => void;
  onEditIssue: (issue: TaskDetailIssue) => void;
  onViewIssue: (issue: TaskDetailIssue) => void;
  registerIssueRowRef: (issueId: number, element: HTMLDivElement | null) => void;
  masters: TaskMasters | null;
  editOptionsByIssueId: Record<number, TaskIssueEditOptions>;
  onFieldUpdate: (targetIssueId: number, field: string, value: string | number | null) => Promise<void>;
  columnWidths: Record<string, number>;
  onColumnResize: (columnKey: string, deltaX: number) => void;
  density: TableDensity;
};

export function TaskDetailsBody({
  loading,
  issues,
  detailsLayoutRef,
  topPaneHeight,
  verticalResizeSession,
  startVerticalResize,
  startVerticalResizeWithMouse,
  updateVerticalResize,
  stopVerticalResize,
  handleVerticalResizeKeyDown,
  processFlowAxis,
  processFlowRenderSteps,
  processFlowChartHeight,
  processFlowLaneHeight,
  processFlowBaseTopPadding,
  processFlowScaleMetrics,
  selectedIssueId,
  activeIssueId,
  savingIssueIds,
  processFlowContainerRef,
  startProcessFlowDrag,
  handleProcessStepClick,
  handleProcessStepDoubleClick,
  selectIssue,
  selectIssueFromTable,
  treeRoots,
  rootIssueId,
  editingDateRange,
  onStartDateRangeEdit,
  onCommitDateRangeEdit,
  onCancelDateRangeEdit,
  onAddSubIssue,
  onEditIssue,
  onViewIssue,
  registerIssueRowRef,
  masters,
  editOptionsByIssueId,
  onFieldUpdate,
  columnWidths,
  onColumnResize,
  density
}: TaskDetailsBodyProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f7f9fc] relative" ref={detailsLayoutRef}>
      {loading && (
        <div className="flex justify-center items-center py-12 absolute inset-0 bg-white/85 z-30">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      )}

      {!loading && issues.length === 0 && (
        <div className="text-center py-12 m-6 bg-white border border-[#e0e0e0] flex-shrink-0 w-full">
          <p className="text-sm text-slate-500">{t('timeline.detailsNoRows')}</p>
        </div>
      )}

      {!loading && issues.length > 0 && (
        <>
          <div
            className="border-b border-[#e5e7eb] bg-white relative z-10 shrink-0 overflow-hidden"
            data-testid="task-details-top-pane"
            style={{ height: `${topPaneHeight}px` }}
          >
            <div className="h-full overflow-auto" onClick={() => selectIssue(null)}>
              <ProcessFlowCanvas
                axis={processFlowAxis}
                renderSteps={processFlowRenderSteps}
                chartHeight={processFlowChartHeight}
                laneHeight={processFlowLaneHeight}
                baseTopPadding={processFlowBaseTopPadding}
                scaleMetrics={processFlowScaleMetrics}
                selectedIssueId={selectedIssueId}
                savingIssueIds={savingIssueIds}
                containerRef={processFlowContainerRef}
                onStepPointerDown={startProcessFlowDrag}
                onStepClick={handleProcessStepClick}
                onStepDoubleClick={handleProcessStepDoubleClick}
              />
            </div>
          </div>

          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('timeline.resizeDetailAreasAria')}
            tabIndex={0}
            data-testid="task-details-horizontal-resizer"
            data-resizing={verticalResizeSession ? 'true' : 'false'}
            className={`relative z-20 shrink-0 cursor-ns-resize bg-[#d6deea] transition-colors ${verticalResizeSession ? 'h-2 bg-[#b8c4d4]' : 'h-1.5 hover:bg-[#b8c4d4]'}`}
            onPointerDown={startVerticalResize}
            onMouseDown={startVerticalResizeWithMouse}
            onPointerMove={(event) => updateVerticalResize(event.clientY, event.pointerId)}
            onPointerUp={(event) => stopVerticalResize(event.pointerId)}
            onMouseMove={(event) => updateVerticalResize(event.clientY)}
            onMouseUp={() => stopVerticalResize()}
            onKeyDown={handleVerticalResizeKeyDown}
          >
            <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
              <span className="h-1 w-14 rounded-full bg-[#94a3b8]/70" />
            </div>
          </div>

          <div className="flex-1 flex min-h-0 relative bg-white" data-testid="task-details-bottom-pane">
            <div className="flex flex-col min-h-0 bg-white flex-1 overflow-hidden">
              <div className="overflow-auto flex-1 bg-white">
                <IssueTreeTable
                  treeRoots={treeRoots}
                  rootIssueId={rootIssueId}
                  savingIssueIds={savingIssueIds}
                  editingDateRange={editingDateRange}
                  onStartDateRangeEdit={onStartDateRangeEdit}
                  onCommitDateRangeEdit={onCommitDateRangeEdit}
                  onCancelDateRangeEdit={onCancelDateRangeEdit}
                  onAddSubIssue={onAddSubIssue}
                  onEditIssue={onEditIssue}
                  onViewIssue={onViewIssue}
                  selectedIssueId={activeIssueId ?? undefined}
                  onSelectIssue={selectIssueFromTable}
                  registerRowRef={registerIssueRowRef}
                  masters={masters}
                  editOptionsByIssueId={editOptionsByIssueId}
                  onFieldUpdate={onFieldUpdate}
                  columnWidths={columnWidths}
                  onColumnResize={onColumnResize}
                  density={density}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
