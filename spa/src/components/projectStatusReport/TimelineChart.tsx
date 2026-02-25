import { format } from 'date-fns';
import { useState } from 'react';
import type { RefObject } from 'react';
import { t } from '../../i18n';
import { HeaderMonth, HeaderYear, TimelineLane } from './timeline';
import { TaskDetailsDialog } from './TaskDetailsDialog';

type ChevronPathProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  pointDepth: number;
  isFirst: boolean;
  joinsPrevious?: boolean;
  fill: string;
  stroke: string;
  progress?: number;
  id?: string;
  filter?: string;
  separatorColor?: string;
};

const ChevronPath = ({
  x,
  y,
  width,
  height,
  pointDepth,
  isFirst,
  joinsPrevious = false,
  fill,
  stroke,
  progress,
  id,
  filter,
  separatorColor = 'white'
}: ChevronPathProps) => {
  const hasLeftNotch = !isFirst;
  const leftShape = !hasLeftNotch
    ? `M ${x} ${y} L ${x} ${y + height}`
    : `M ${x} ${y} L ${x + pointDepth} ${y + height / 2} L ${x} ${y + height}`;

  const rightBaseX = x + Math.max(width - pointDepth, 0);
  const rightTipX = x + width;
  const rightShape = `L ${rightBaseX} ${y + height} L ${rightTipX} ${y + height / 2} L ${rightBaseX} ${y}`;
  const pathData = `${leftShape} ${rightShape} Z`;

  if (progress !== undefined && progress >= 0 && progress < 100 && id) {
    const gradientId = `grad-${id}`;
    return (
      <g filter={filter}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset={`${progress}%`} stopColor={fill} />
            <stop offset={`${progress}%`} stopColor="#cbd5e1" />
          </linearGradient>
        </defs>
        <path d={pathData} fill={`url(#${gradientId})`} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
        {hasLeftNotch && <path d={leftShape} stroke={separatorColor} strokeWidth="2" fill="none" />}
      </g>
    );
  }

  return (
    <g filter={filter}>
      <path d={pathData} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {hasLeftNotch && <path d={leftShape} stroke={separatorColor} strokeWidth="2" fill="none" />}
    </g>
  );
};

const DateLabel = ({ x, y, label }: { x: number; y: number; label: string }) => (
  <g transform={`translate(${x}, ${y})`}>
    <text
      y="1"
      fill="#374151"
      fontSize="10"
      fontWeight="bold"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {label}
    </text>
  </g>
);

type TimelineChartProps = {
  timelineData: TimelineLane[];
  timelineWidth: number;
  headerMonths: HeaderMonth[];
  headerYears: HeaderYear[];
  todayX: number;
  containerRef: RefObject<HTMLDivElement>;
  projectIdentifier: string;
  chartScale?: number;
  showAllDates?: boolean;
  showTodayLine?: boolean;
  onVersionAiClick?: (payload: { versionId: number; versionName: string; projectId: number; projectName: string }) => void;
  onVersionReportClick?: (payload: { versionId: number; versionName: string; projectId: number; projectName: string; projectIdentifier: string }) => void;
  onTaskDatesUpdated?: () => void;
  activeReportLaneKey?: string | null;
};

const BASE_LANE_HEIGHT = 80;
const BASE_POINT_DEPTH = 15;
const BASE_BAR_HEIGHT = 40;
const yearRowHeight = 25;
const monthRowHeight = 25;
const headerHeight = yearRowHeight + monthRowHeight;
const TODAY_LABEL_WIDTH = 40;
const TODAY_LABEL_HEIGHT = 16;
const TODAY_LABEL_OFFSET_Y = 2;
const TODAY_LABEL_LINE_GAP = 2;

export function TimelineChart({
  timelineData,
  timelineWidth,
  headerMonths,
  headerYears,
  todayX,
  containerRef,
  projectIdentifier,
  chartScale = 1,
  showAllDates = false,
  showTodayLine = true,
  onVersionAiClick,
  onVersionReportClick,
  onTaskDatesUpdated,
  activeReportLaneKey
}: TimelineChartProps) {
  const laneHeight = Math.round(BASE_LANE_HEIGHT * chartScale);
  const [activeIssue, setActiveIssue] = useState<{ id: number; title: string } | null>(null);

  const handleStepClick = (issueId?: number, title?: string) => {
    if (!issueId) return;
    setActiveIssue({ id: issueId, title: title || '' });
  };

  return (
    <>
      <div className="flex border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex-none min-w-max bg-white border-r border-gray-200 flex flex-col">
          <div className="flex items-center px-6 font-bold text-gray-600 text-xs bg-gray-50 border-b border-gray-200" style={{ height: headerHeight }}>
            {t('timeline.laneHeader')}
          </div>
          {timelineData.map((project) => (
            <div
              key={project.laneKey}
              className={`flex flex-col justify-center px-6 border-b border-gray-100 box-border whitespace-nowrap transition-colors duration-300 ${project.laneKey === activeReportLaneKey ? 'bg-blue-50/70' : ''}`}
              style={{ height: laneHeight, minHeight: 60 }}
            >
              {project.versionId ? (
                <div className="flex items-center gap-2">
                  <a
                    href={`/versions/${project.versionId}`}
                    className="text-sm font-bold text-blue-700 hover:text-blue-900 hover:underline"
                    title={project.versionName}
                  >
                    {project.versionName}
                  </a>
                  <button
                    type="button"
                    aria-label={t('timeline.startAiAria', { versionName: project.versionName })}
                    className="group h-7 w-7 flex items-center justify-center rounded-lg border border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-300 shadow-sm hover:shadow-indigo-100/50 cursor-pointer overflow-hidden relative"
                    onClick={() =>
                      onVersionAiClick?.({
                        versionId: project.versionId as number,
                        versionName: project.versionName,
                        projectId: project.projectId,
                        projectName: project.projectName
                      })
                    }
                  >
                    <svg
                      className="w-4 h-4 relative z-10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <defs>
                        <linearGradient id={`ai-grad-${project.versionId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M12 3L14.5 9L21 11.5L14.5 14L12 21L9.5 14L3 11.5L9.5 9L12 3Z"
                        fill={`url(#ai-grad-${project.versionId})`}
                      />
                      <path
                        d="M6 4L7 5M17 19L18 20M4 6L6 7M18 4L20 5M6 20L4 18M20 18L18 19"
                        stroke={`url(#ai-grad-${project.versionId})`}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        opacity="0.5"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label={t('timeline.showDetailAria', { versionName: project.versionName })}
                    className="group h-7 w-7 flex items-center justify-center rounded-lg border border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 transition-all duration-300 shadow-sm hover:shadow-blue-100/50 cursor-pointer overflow-hidden relative"
                    onClick={() =>
                      onVersionReportClick?.({
                        versionId: project.versionId as number,
                        versionName: project.versionName,
                        projectId: project.projectId,
                        projectName: project.projectName,
                        projectIdentifier: project.projectIdentifier
                      })
                    }
                  >
                    <svg
                      className="w-4 h-4 relative z-10 transition-transform duration-300 group-hover:scale-110"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        stroke="#3b82f6"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="text-sm font-bold text-gray-800" title={project.versionName}>
                  {project.versionName}
                </div>
              )}
              {project.projectIdentifier ? (
                <a
                  href={`/projects/${project.projectIdentifier}`}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1"
                  title={project.projectName}
                >
                  {project.projectName}
                </a>
              ) : (
                <div className="text-xs text-gray-500 mt-1" title={project.projectName}>
                  {project.projectName}
                </div>
              )}
            </div>
          ))}
          {timelineData.length === 0 && <div className="h-32"></div>}
        </div>

        <div className="flex-1 overflow-x-auto bg-white relative" ref={containerRef}>
          <TimelineSvg
            timelineData={timelineData}
            timelineWidth={timelineWidth}
            headerMonths={headerMonths}
            headerYears={headerYears}
            todayX={todayX}
            onStepClick={handleStepClick}
            activeReportLaneKey={activeReportLaneKey}
            laneHeight={laneHeight}
            chartScale={chartScale}
            showAllDates={showAllDates}
            showTodayLine={showTodayLine}
          />
        </div>
      </div>

      {activeIssue && (
        <TaskDetailsDialog
          open
          projectIdentifier={projectIdentifier}
          issueId={activeIssue.id}
          issueTitle={activeIssue.title}
          onTaskDatesUpdated={onTaskDatesUpdated}
          onClose={() => setActiveIssue(null)}
        />
      )}
    </>
  );
}

function TimelineSvg({
  timelineData,
  timelineWidth,
  headerMonths,
  headerYears,
  todayX,
  onStepClick,
  activeReportLaneKey,
  laneHeight,
  chartScale = 1,
  showAllDates,
  showTodayLine = true
}: {
  timelineData: TimelineLane[];
  timelineWidth: number;
  headerMonths: HeaderMonth[];
  headerYears: HeaderYear[];
  todayX: number;
  onStepClick: (issueId?: number, title?: string) => void;
  activeReportLaneKey?: string | null;
  laneHeight: number;
  chartScale?: number;
  showAllDates?: boolean;
  showTodayLine?: boolean;
}) {
  const svgHeight = headerHeight + timelineData.length * laneHeight;
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);

  if (timelineData.length === 0) {
    return <div className="flex items-center justify-center h-32 text-gray-400">{t('common.noData')}</div>;
  }

  return (
    <svg viewBox={`0 0 ${timelineWidth} ${svgHeight}`} className="w-full" style={{ minHeight: svgHeight, minWidth: `${timelineWidth}px` }}>
      <defs>
        <pattern id="gridPattern" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#f3f4f6" strokeWidth="1" />
        </pattern>
        <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur" />
          <feOffset in="blur" dx="0" dy="1" result="offsetBlur" />
          <feFlood floodColor="rgba(0,0,0,0.2)" result="colorBlur" />
          <feComposite in="colorBlur" in2="offsetBlur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id="stripePattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#f8fafc" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#e2e8f0" strokeWidth="2" />
        </pattern>
      </defs>

      <g transform="translate(0, 0)">
        {/* Year Row Background */}
        <rect x={0} y={0} width={timelineWidth} height={yearRowHeight} fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1" />
        {/* Month Row Background */}
        <rect x={0} y={yearRowHeight} width={timelineWidth} height={monthRowHeight} fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1" />
        {headerYears.map((year, idx) => (
          <g key={`year-${year.year}-${idx}`} transform={`translate(${year.x}, 0)`}>
            <rect x={0} y={0} width={year.width} height={yearRowHeight} fill="none" stroke="#e5e7eb" strokeWidth="1" />
            <text
              x={year.width / 2}
              y={yearRowHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="12"
              fontWeight="bold"
              fill="#374151"
            >
              {year.year}
            </text>
          </g>
        ))}

        {headerMonths.map((month, idx) => (
          <g key={`month-${month.label}-${idx}`} transform={`translate(${month.x}, ${yearRowHeight})`}>
            <rect x={0} y={0} width={month.width} height={monthRowHeight} fill="none" stroke="#e5e7eb" strokeWidth="1" />
            <text
              x={month.width / 2}
              y={monthRowHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="12"
              fontWeight="bold"
              fill="#374151"
            >
              {month.label}
            </text>
          </g>
        ))}

        {showTodayLine && todayX >= 0 && todayX <= timelineWidth && (
          <g transform={`translate(${todayX}, 0)`}>
            <rect
              x={-TODAY_LABEL_WIDTH / 2}
              y={headerHeight + TODAY_LABEL_OFFSET_Y}
              width={TODAY_LABEL_WIDTH}
              height={TODAY_LABEL_HEIGHT}
              fill="#ef4444"
            />
            <text
              x={0}
              y={headerHeight + TODAY_LABEL_OFFSET_Y + 12}
              textAnchor="middle"
              fontSize="10"
              fontWeight="bold"
              fill="#ffffff"
            >
              {format(new Date(), 'M/d')}
            </text>
          </g>
        )}
      </g>

      {timelineData.map((project, projectIndex) => {
        const yOffset = headerHeight + projectIndex * laneHeight;

        return (
          <g key={project.laneKey} transform={`translate(0, ${yOffset})`}>
            {project.laneKey === activeReportLaneKey && (
              <rect x={0} y={0} width={timelineWidth} height={laneHeight} fill="#eff6ff" opacity="0.7" />
            )}
            <line x1={0} y1={laneHeight} x2={timelineWidth} y2={laneHeight} stroke="#f3f4f6" strokeWidth="1" />
            {headerMonths.map((month, monthIndex) => (
              <line
                key={`${project.laneKey}-month-${monthIndex}`}
                x1={month.x}
                y1={0}
                x2={month.x}
                y2={laneHeight}
                stroke="#f3f4f6"
                strokeDasharray="4 2"
              />
            ))}

            {project.steps
              .map((step, stepIndex) => {
                const isFirst = stepIndex === 0;
                const pointDepth = BASE_POINT_DEPTH * chartScale;
                const barHeight = BASE_BAR_HEIGHT * chartScale;
                const verticalOffset = (laneHeight - barHeight) / 2;
                const fontSize = Math.max(10, Math.round(12 * chartScale));

                const isPending = step.status.code === 'PENDING';
                const isInProgress = step.status.code === 'IN_PROGRESS';
                const fill = isPending ? 'url(#stripePattern)' : step.status.fill;
                const barX = step.joinsPrevious ? step.x - pointDepth : step.x;
                const barWidth = step.joinsPrevious ? step.width + pointDepth : step.width;
                const taskCenterX = barX + barWidth / 2 + (isFirst ? 0 : pointDepth / 2);
                const startLabelX = barX + (isFirst ? 12 : pointDepth + 12);
                const endLabelX = step.startDateStr === step.endDateStr
                  ? taskCenterX
                  : barX + barWidth - 12;

                return {
                  zIndex: isInProgress ? 1 : 0,
                  element: (
                    <g
                      key={step.id}
                      transform={`translate(0, ${verticalOffset})`}
                      onMouseEnter={() => setHoveredStepId(step.id)}
                      onMouseLeave={() => setHoveredStepId(null)}
                    >
                      <g
                        style={{ cursor: step.issueId ? 'pointer' : 'default' }}
                        onClick={() => onStepClick(step.issueId, step.name)}
                      >
                        <title>{step.name}</title>
                        <ChevronPath
                          x={barX}
                          y={0}
                          width={barWidth}
                          height={barHeight}
                          pointDepth={pointDepth}
                          isFirst={isFirst}
                          joinsPrevious={step.joinsPrevious}
                          fill={fill}
                          stroke={step.status.stroke}
                          progress={step.progress}
                          id={step.id}
                          filter="url(#dropShadow)"
                          separatorColor={isPending ? 'transparent' : 'white'}
                        />
                      </g>

                      {/* Task Name */}
                      {step.width > 30 && (
                        <text
                          x={taskCenterX}
                          y={barHeight / 2}
                          fill={step.status.text}
                          fontSize={fontSize}
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          style={{
                            pointerEvents: 'none',
                            paintOrder: 'stroke',
                            stroke: step.status.textStroke || '#ffffff',
                            strokeWidth: step.status.textStrokeWidth || '3px',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round'
                          }}
                        >
                          {step.name}
                        </text>
                      )}

                      {/* Start Date Label */}
                      {step.startDateStr && (showAllDates || hoveredStepId === step.id) && step.startDateStr !== step.endDateStr && (
                        <DateLabel
                          x={startLabelX}
                          y={-12}
                          label={step.startDateStr}
                        />
                      )}

                      {/* End Date Label */}
                      {step.endDateStr && (showAllDates || hoveredStepId === step.id) && (
                        <DateLabel
                          x={endLabelX}
                          y={-12}
                          label={step.endDateStr}
                        />
                      )}
                    </g>
                  )
                };
              })
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((item) => item.element)}

            {showTodayLine && todayX >= 0 && todayX <= timelineWidth && (
              <line
                x1={todayX}
                y1={projectIndex === 0 ? TODAY_LABEL_OFFSET_Y + TODAY_LABEL_HEIGHT + TODAY_LABEL_LINE_GAP : 0}
                x2={todayX}
                y2={laneHeight}
                stroke="#ef4444"
                strokeWidth="1"
                strokeDasharray="4 2"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
