import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { HeaderMonth, HeaderYear, TimelineLane } from './timeline';

type ChevronPathProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  pointDepth: number;
  isFirst: boolean;
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
  fill,
  stroke,
  progress,
  id,
  filter,
  separatorColor = 'white'
}: ChevronPathProps) => {
  const leftShape = isFirst
    ? `M ${x} ${y} L ${x} ${y + height}`
    : `M ${x} ${y} L ${x + pointDepth} ${y + height / 2} L ${x} ${y + height}`;

  const rightShape = `L ${x + width} ${y + height} L ${x + width + pointDepth} ${y + height / 2} L ${x + width} ${y}`;
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
        {!isFirst && <path d={leftShape} stroke={separatorColor} strokeWidth="2" fill="none" />}
      </g>
    );
  }

  return (
    <g filter={filter}>
      <path d={pathData} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {!isFirst && <path d={leftShape} stroke={separatorColor} strokeWidth="2" fill="none" />}
    </g>
  );
};

type TimelineChartProps = {
  timelineData: TimelineLane[];
  timelineWidth: number;
  headerMonths: HeaderMonth[];
  headerYears: HeaderYear[];
  todayX: number;
  containerRef: RefObject<HTMLDivElement>;
  chartScale?: number;
  onVersionAiClick?: (payload: { versionId: number; versionName: string; projectId: number; projectName: string }) => void;
  onVersionReportClick?: (payload: { versionId: number; versionName: string; projectId: number; projectName: string; projectIdentifier: string }) => void;
  activeReportLaneKey?: string | null;
};

const BASE_LANE_HEIGHT = 130;
const BASE_POINT_DEPTH = 15;
const BASE_BAR_HEIGHT = 40;
const BASE_DATE_SECTION_HEIGHT = 25;
const yearRowHeight = 25;
const monthRowHeight = 25;
const headerHeight = yearRowHeight + monthRowHeight;

export function TimelineChart({
  timelineData,
  timelineWidth,
  headerMonths,
  headerYears,
  todayX,
  containerRef,
  chartScale = 1,
  onVersionAiClick,
  onVersionReportClick,
  activeReportLaneKey
}: TimelineChartProps) {
  const laneHeight = Math.round(BASE_LANE_HEIGHT * chartScale);
  const [activeIssue, setActiveIssue] = useState<{ id: number; title: string } | null>(null);

  const handleStepClick = (issueId?: number, title?: string) => {
    if (!issueId) return;
    setActiveIssue({ id: issueId, title: title || '' });
  };

  useEffect(() => {
    if (!activeIssue) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveIssue(null);
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [activeIssue]);

  return (
    <>
      <div className="flex border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex-none min-w-max bg-white border-r border-gray-200 flex flex-col">
          <div className="flex items-center px-6 font-bold text-gray-600 text-xs bg-gray-50 border-b border-gray-200" style={{ height: headerHeight }}>
            バージョン / プロジェクト
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
                    aria-label={`AI分析を開始 ${project.versionName}`}
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
                    aria-label={`詳細レポートを表示 ${project.versionName}`}
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
          />
        </div>
      </div>

      {activeIssue && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50"
          onClick={() => setActiveIssue(null)}
        >
          <div
            className="bg-white w-full h-full flex flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700 truncate">
                チケット #{activeIssue.id}{activeIssue.title ? `: ${activeIssue.title}` : ''}
              </span>
              <button
                aria-label="ダイアログを閉じる"
                className="text-slate-500 hover:text-slate-700 text-xl leading-none px-2 cursor-pointer"
                onClick={() => setActiveIssue(null)}
              >
                ×
              </button>
            </div>
            <iframe
              title={`issue-${activeIssue.id}`}
              src={`/issues/${activeIssue.id}`}
              onLoad={(e) => {
                const iframe = e.target as HTMLIFrameElement;
                if (iframe.contentDocument) {
                  const style = iframe.contentDocument.createElement('style');
                  style.textContent = `
                    #top-menu, #header, #main-menu, #sidebar, #footer { display: none !important; }
                    #content { width: 100% !important; margin: 0 !important; }
                  `;
                  iframe.contentDocument.head.appendChild(style);
                }
              }}
              className="w-full flex-1 border-0"
            />
          </div>
        </div>
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
  chartScale = 1
}: Omit<TimelineChartProps, 'containerRef'> & { onStepClick: (issueId?: number, title?: string) => void; laneHeight: number }) {
  const svgHeight = headerHeight + timelineData.length * laneHeight;

  if (timelineData.length === 0) {
    return <div className="flex items-center justify-center h-32 text-gray-400">データがありません</div>;
  }

  return (
    <svg viewBox={`0 0 ${timelineWidth} ${svgHeight}`} className="w-full" style={{ minHeight: svgHeight, minWidth: `${timelineWidth}px` }}>
      <defs>
        <pattern id="gridPattern" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#f3f4f6" strokeWidth="1" />
        </pattern>
        <marker id="arrow-start" markerWidth="10" markerHeight="10" refX="0" refY="5" orient="auto">
          <path d="M10,0 L0,5 L10,10" fill="none" stroke="#64748b" strokeWidth="1" />
        </marker>
        <marker id="arrow-end" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto">
          <path d="M0,0 L10,5 L0,10" fill="none" stroke="#64748b" strokeWidth="1" />
        </marker>
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

        {todayX >= 0 && todayX <= timelineWidth && (
          <g transform={`translate(${todayX}, 0)`}>
            <line x1={0} y1={0} x2={0} y2={headerHeight} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2" />
            <rect x={-20} y={headerHeight} width={40} height={16} fill="white" opacity="0.9" />
            <text x={0} y={headerHeight + 12} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ef4444">
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
                const dateSectionHeight = BASE_DATE_SECTION_HEIGHT * chartScale;
                const verticalOffset = (laneHeight - (barHeight + dateSectionHeight)) / 2;
                const fontSize = Math.max(10, Math.round(12 * chartScale));

                const isPending = step.status.label === '未着手';
                const isInProgress = step.status.label === '進行中';
                const fill = isPending ? 'url(#stripePattern)' : step.status.fill;

                return {
                  zIndex: isInProgress ? 1 : 0,
                  element: (
                    <g key={step.id} transform={`translate(0, ${verticalOffset})`}>
                      <g
                        style={{ cursor: step.issueId ? 'pointer' : 'default' }}
                        onClick={() => onStepClick(step.issueId, step.name)}
                      >
                        <ChevronPath
                          x={step.x}
                          y={0}
                          width={step.width}
                          height={barHeight}
                          pointDepth={pointDepth}
                          isFirst={isFirst}
                          fill={fill}
                          stroke={step.status.stroke}
                          progress={step.progress}
                          id={step.id}
                          filter="url(#dropShadow)"
                          separatorColor={isPending ? 'transparent' : 'white'}
                        />
                      </g>

                      {step.width > 30 && (
                        <text
                          x={step.x + step.width / 2 + (isFirst ? 0 : pointDepth / 2)}
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

                      {(step.startDate || step.endDate) && (
                        <g transform={`translate(${step.x + (isFirst ? 0 : pointDepth / 2)}, ${barHeight + 10 * chartScale})`}>
                          <line
                            x1={25 * chartScale}
                            y1={5 * chartScale}
                            x2={step.width - 25 * chartScale}
                            y2={5 * chartScale}
                            stroke="#94a3b8"
                            strokeWidth="0.5"
                            markerStart="url(#arrow-start)"
                            markerEnd="url(#arrow-end)"
                          />
                          <text x={0} y={8 * chartScale} fontSize={Math.max(8, Math.round(9 * chartScale))} fill="#94a3b8" textAnchor="start">
                            {step.startDate}
                          </text>
                          <text x={step.width} y={8 * chartScale} fontSize={Math.max(8, Math.round(9 * chartScale))} fill="#94a3b8" textAnchor="end">
                            {step.endDate}
                          </text>
                        </g>
                      )}
                    </g>
                  )
                };
              })
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((item) => item.element)}

            {todayX >= 0 && todayX <= timelineWidth && (
              <line x1={todayX} y1={0} x2={todayX} y2={laneHeight} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 2" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
