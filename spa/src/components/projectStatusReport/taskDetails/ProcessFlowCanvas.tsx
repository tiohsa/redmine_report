import React, { useLayoutEffect, useRef } from 'react';
import { t } from '../../../i18n';
import {
  drawChevron,
  drawDiamond,
  drawStrokeText,
  drawTriangle,
  prepareHiDPICanvas,
  truncateCanvasText
} from '../canvasTimelineRenderer';
import { drawExecutiveBar } from '../executiveTimelineRenderer';
import { getProgressFillColor, getProgressTrackColor } from '../constants';
import { type TimelineAxis } from '../timelineAxis';
import {
  buildProcessChevronPathData,
  extractProcessFlowMonthDayLabel,
  getProcessStepY,
  PROCESS_FLOW_DATE_LABEL_INSET,
  PROCESS_FLOW_HEADER_HEIGHT,
  PROCESS_FLOW_MONTH_ROW_HEIGHT,
  PROCESS_FLOW_YEAR_ROW_HEIGHT,
  type ProcessFlowDragMode,
  type ProcessFlowRenderStep,
  type ProcessFlowScaleMetrics,
  type ProcessFlowStatus
} from './processFlowGeometry';

type ProcessFlowCanvasProps = {
  axis: TimelineAxis | null;
  renderSteps: ProcessFlowRenderStep[];
  chartHeight: number;
  laneHeight: number;
  baseTopPadding: number;
  scaleMetrics: ProcessFlowScaleMetrics;
  selectedIssueId: number | null;
  savingIssueIds: Record<number, boolean>;
  containerRef: React.Ref<HTMLDivElement>;
  onStepClick: (step: ProcessFlowRenderStep) => void;
  onStepDoubleClick: (step: ProcessFlowRenderStep) => void;
  onStepPointerDown: (
    event: React.PointerEvent<SVGRectElement>,
    step: ProcessFlowRenderStep,
    mode: ProcessFlowDragMode
  ) => void;
  showTitles: boolean;
};

const processStatusStyles: Record<ProcessFlowStatus, {
  stroke: string;
  dateText: string;
}> = {
  COMPLETED: { stroke: '#94a3b8', dateText: '#475569' },
  IN_PROGRESS: { stroke: '#94a3b8', dateText: '#475569' },
  PENDING: { stroke: '#94a3b8', dateText: '#475569' }
};

const drawSelectedProcessOutline = (
  context: CanvasRenderingContext2D,
  step: {
    shapeKind: ProcessFlowRenderStep['shapeKind'];
    stepY: number;
    x: number;
    width: number;
    hasLeftNotch: boolean;
    shapeX: number;
    visualWidth: number;
    textX: number;
    barHeight: number;
    pointDepth: number;
  }
) => {
  context.save();
  context.strokeStyle = '#2563eb';
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.shadowColor = 'rgba(37, 99, 235, 0.18)';
  context.shadowBlur = 6;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 1;

  if (step.shapeKind === 'due-only') {
    const halfWidth = step.visualWidth / 2;
    const halfHeight = step.barHeight / 2;
    context.beginPath();
    context.moveTo(step.textX, step.stepY - 3);
    context.lineTo(step.textX + halfWidth + 3, step.stepY + halfHeight);
    context.lineTo(step.textX, step.stepY + step.barHeight + 3);
    context.lineTo(step.textX - halfWidth - 3, step.stepY + halfHeight);
    context.closePath();
    context.stroke();
    context.restore();
    return;
  }

  if (step.shapeKind === 'start-only') {
    context.beginPath();
    context.moveTo(step.shapeX - 3, step.stepY - 3);
    context.lineTo(step.shapeX + step.visualWidth + 4, step.stepY + step.barHeight / 2);
    context.lineTo(step.shapeX - 3, step.stepY + step.barHeight + 3);
    context.closePath();
    context.stroke();
    context.restore();
    return;
  }

  const leftEdgeX = step.x - 3;
  const topY = step.stepY - 3;
  const bottomY = step.stepY + step.barHeight + 3;
  const radius = step.barHeight / 2;

  context.beginPath();
  context.roundRect(leftEdgeX, topY, Math.max(step.visualWidth, 1) + 6, step.barHeight + 6, radius + 3);
  context.stroke();
  context.restore();
};

export function ProcessFlowCanvas({
  axis,
  renderSteps,
  chartHeight,
  laneHeight,
  baseTopPadding,
  scaleMetrics,
  selectedIssueId,
  savingIssueIds,
  containerRef,
  onStepClick,
  onStepDoubleClick,
  onStepPointerDown,
  showTitles
}: ProcessFlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    if (!axis || !canvasRef.current) {
      return;
    }

    const context = prepareHiDPICanvas(canvasRef.current, axis.timelineWidth, chartHeight);
    if (!context) {
      return;
    }

    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, axis.timelineWidth, PROCESS_FLOW_YEAR_ROW_HEIGHT);
    context.fillRect(0, PROCESS_FLOW_YEAR_ROW_HEIGHT, axis.timelineWidth, PROCESS_FLOW_MONTH_ROW_HEIGHT);
    context.strokeStyle = '#e2e8f0';
    context.lineWidth = 1;
    context.strokeRect(0, 0, axis.timelineWidth, PROCESS_FLOW_YEAR_ROW_HEIGHT);
    context.strokeRect(0, PROCESS_FLOW_YEAR_ROW_HEIGHT, axis.timelineWidth, PROCESS_FLOW_MONTH_ROW_HEIGHT);

    axis.headerYears.forEach((year) => {
      context.strokeRect(year.x, 0, year.width, PROCESS_FLOW_YEAR_ROW_HEIGHT);
      drawStrokeText(context, {
        text: year.year,
        x: year.x + year.width / 2,
        y: PROCESS_FLOW_YEAR_ROW_HEIGHT / 2,
        fill: '#334155',
        stroke: '#f8fafc',
        strokeWidth: 0,
        font: '700 11px sans-serif'
      });
    });

    axis.headerMonths.forEach((month) => {
      context.strokeRect(month.x, PROCESS_FLOW_YEAR_ROW_HEIGHT, month.width, PROCESS_FLOW_MONTH_ROW_HEIGHT);
      drawStrokeText(context, {
        text: month.label,
        x: month.x + month.width / 2,
        y: PROCESS_FLOW_YEAR_ROW_HEIGHT + PROCESS_FLOW_MONTH_ROW_HEIGHT / 2,
        fill: '#334155',
        stroke: '#f8fafc',
        strokeWidth: 0,
        font: '700 11px sans-serif'
      });
    });

    context.fillStyle = '#ffffff';
    context.fillRect(0, PROCESS_FLOW_HEADER_HEIGHT, axis.timelineWidth, laneHeight);
    axis.headerMonths.forEach((month) => {
      context.save();
      context.strokeStyle = '#e2e8f0';
      context.setLineDash([4, 3]);
      context.beginPath();
      context.moveTo(month.x, PROCESS_FLOW_HEADER_HEIGHT);
      context.lineTo(month.x, PROCESS_FLOW_HEADER_HEIGHT + laneHeight);
      context.stroke();
      context.restore();
    });
    context.beginPath();
    context.moveTo(0, PROCESS_FLOW_HEADER_HEIGHT + laneHeight);
    context.lineTo(axis.timelineWidth, PROCESS_FLOW_HEADER_HEIGHT + laneHeight);
    context.strokeStyle = '#e2e8f0';
    context.stroke();

    renderSteps.forEach((step) => {
      const style = processStatusStyles[step.status];
      const fill = getProgressFillColor(step.progress);
      const stepY = getProcessStepY(step.laneIndex, baseTopPadding, scaleMetrics);
      const rangeStartLabelX = step.shapeX + PROCESS_FLOW_DATE_LABEL_INSET;
      const rangeEndLabelX = step.shapeX + step.visualWidth - PROCESS_FLOW_DATE_LABEL_INSET;

      if (step.shapeKind === 'due-only') {
        drawDiamond(context, {
          centerX: step.textX,
          y: stepY,
          width: step.visualWidth,
          height: scaleMetrics.barHeight,
          fill,
          trackFill: getProgressTrackColor(),
          stroke: style.stroke,
          progress: step.progress
        });
      } else if (step.shapeKind === 'start-only') {
        drawTriangle(context, {
          x: step.shapeX,
          y: stepY,
          width: step.visualWidth,
          height: scaleMetrics.barHeight,
          fill,
          trackFill: getProgressTrackColor(),
          stroke: style.stroke,
          progress: step.progress
        });
      } else {
        drawExecutiveBar(context, {
          x: step.x,
          y: stepY,
          width: Math.max(step.width, 1),
          height: scaleMetrics.barHeight,
          fill,
          progress: step.progress,
          label: showTitles ? step.title : undefined,
          chartScale: 1
        });
      }

      if (selectedIssueId === step.id) {
        drawSelectedProcessOutline(context, {
          shapeKind: step.shapeKind,
          stepY,
          x: step.x,
          width: step.width,
          hasLeftNotch: step.hasLeftNotch,
          shapeX: step.shapeX,
          visualWidth: step.visualWidth,
          textX: step.textX,
          barHeight: scaleMetrics.barHeight,
          pointDepth: scaleMetrics.pointDepth
        });
      }

      if (step.shapeKind !== 'range') {
        drawStrokeText(context, {
          text: extractProcessFlowMonthDayLabel(step.anchorDate),
          x: step.textX,
          y: stepY - 6,
          fill: style.dateText,
          stroke: '#ffffff',
          strokeWidth: 2,
          font: '700 10px sans-serif'
        });
      } else {
        if (step.startDate) {
          drawStrokeText(context, {
            text: extractProcessFlowMonthDayLabel(step.startDate),
            x: rangeStartLabelX,
            y: stepY - 6,
            fill: style.dateText,
            stroke: '#ffffff',
            strokeWidth: 2,
            font: '700 10px sans-serif',
            textAlign: 'start'
          });
        }
        if (step.dueDate) {
          drawStrokeText(context, {
            text: extractProcessFlowMonthDayLabel(step.dueDate),
            x: rangeEndLabelX,
            y: stepY - 6,
            fill: style.dateText,
            stroke: '#ffffff',
            strokeWidth: 2,
            font: '700 10px sans-serif',
            textAlign: 'end'
          });
        }
      }

      // Labels and progress are now handled by drawExecutiveBar
    });
  }, [axis, baseTopPadding, chartHeight, laneHeight, renderSteps, scaleMetrics, selectedIssueId, showTitles]);

  return (
    <div className="overflow-x-auto" data-testid="task-details-process-flow" ref={containerRef}>
      {axis && renderSteps.length > 0 ? (
        <div
          className="relative"
          style={{ width: axis.timelineWidth, height: chartHeight }}
        >
          <canvas
            ref={canvasRef}
            data-testid="task-details-process-flow-canvas"
            width={axis.timelineWidth}
            height={chartHeight}
            className="absolute inset-0 block"
            style={{ width: `${axis.timelineWidth}px`, height: `${chartHeight}px`, pointerEvents: 'none' }}
            aria-hidden="true"
          />
          <svg
            width={axis.timelineWidth}
            height={chartHeight}
          >
            {renderSteps.map((step) => {
              const stepY = getProcessStepY(step.laneIndex, baseTopPadding, scaleMetrics);
              const isInteractive = !savingIssueIds[step.id];
              const isRangeStep = step.shapeKind === 'range';
              const isSelected = selectedIssueId === step.id;

              return (
                <g
                  key={step.id}
                  data-testid="task-details-process-step"
                  data-selected={isSelected ? 'true' : 'false'}
                  opacity={savingIssueIds[step.id] ? 0.6 : 1}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <rect
                    x={step.hitX}
                    y={stepY}
                    width={step.hitWidth}
                    height={scaleMetrics.barHeight}
                    fill="transparent"
                    style={{ cursor: isInteractive && isRangeStep ? 'move' : 'pointer' }}
                    onPointerDown={isRangeStep ? (event) => onStepPointerDown(event, step, 'move') : undefined}
                    onClick={() => onStepClick(step)}
                    onDoubleClick={() => onStepDoubleClick(step)}
                    data-selected={isSelected ? 'true' : 'false'}
                    data-testid={`task-details-process-step-hit-${step.id}`}
                  >
                    <title>{step.title}</title>
                  </rect>
                  {isRangeStep && (
                    <>
                      <rect
                        x={step.hitX}
                        y={stepY}
                        width={10}
                        height={scaleMetrics.barHeight}
                        fill="transparent"
                        style={{ cursor: savingIssueIds[step.id] ? 'not-allowed' : 'ew-resize' }}
                        onPointerDown={(event) => onStepPointerDown(event, step, 'resize-left')}
                        data-testid={`task-details-process-step-left-${step.id}`}
                      />
                      <rect
                        x={Math.max(step.hitX + step.hitWidth - 10, step.hitX)}
                        y={stepY}
                        width={10}
                        height={scaleMetrics.barHeight}
                        fill="transparent"
                        style={{ cursor: savingIssueIds[step.id] ? 'not-allowed' : 'ew-resize' }}
                        onPointerDown={(event) => onStepPointerDown(event, step, 'resize-right')}
                        data-testid={`task-details-process-step-right-${step.id}`}
                      />
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t('timeline.detailsNoRows')}</p>
      )}
    </div>
  );
}
