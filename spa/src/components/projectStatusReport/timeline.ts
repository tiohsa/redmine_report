import { differenceInDays, format, parseISO } from 'date-fns';
import { CategoryBar, ProjectInfo } from '../../services/scheduleReportApi';
import { t } from '../../i18n';
import { buildStatusStyles, StatusStyle } from './constants';
import {
  buildTimelineAxis,
  createDateToX,
  createRangeToWidth,
  DEFAULT_TIMELINE_WIDTH,
  HeaderMonth,
  HeaderYear
} from './timelineAxis';

export type { HeaderMonth, HeaderYear } from './timelineAxis';

export type TimelineStep = {
  issueId?: number;
  name: string;
  x: number;
  width: number;
  status: StatusStyle;
  progress?: number;
  id: string;
  startDateIso?: string;
  endDateIso?: string;
  startDateStr?: string;
  endDateStr?: string;
  editable?: boolean;
  joinsPrevious?: boolean;
};

export type TimelineLane = {
  laneKey: string;
  projectId: number;
  projectIdentifier: string;
  projectName: string;
  versionId?: number;
  versionName: string;
  steps: TimelineStep[];
};

export type TimelineViewModel = {
  timelineData: TimelineLane[];
  timelineWidth: number;
  headerMonths: HeaderMonth[];
  headerYears: HeaderYear[];
  totalDurationText: string;
  todayX: number;
  axisStartDateIso: string;
  axisEndDateIso: string;
  pixelsPerDay: number;
};

type TimelineCalculationInput = {
  bars: CategoryBar[];
  selectedVersions: string[];
  projectMap: Map<number, ProjectInfo>;
  containerWidth: number;
  displayStartDateIso?: string;
  displayEndDateIso?: string;
  isProcessMode?: boolean;
  childTicketsMap?: Map<number, CategoryBar[]>;
};

export function buildTimelineViewModel({
  bars,
  selectedVersions,
  projectMap,
  containerWidth,
  displayStartDateIso,
  displayEndDateIso,
  isProcessMode = false,
  childTicketsMap = new Map()
}: TimelineCalculationInput): TimelineViewModel {
  const statusStyles = buildStatusStyles();
  const visibleBars = bars.filter((bar) => {
    const versionKey = bar.version_name || t('common.noVersion');
    return selectedVersions.includes(versionKey);
  });

  if (bars.length === 0) {
    const now = new Date();
    return {
      timelineData: [],
      timelineWidth: DEFAULT_TIMELINE_WIDTH,
      headerMonths: [],
      headerYears: [],
      totalDurationText: t('timeline.noDataDuration'),
      todayX: -1,
      axisStartDateIso: format(now, 'yyyy-MM-dd'),
      axisEndDateIso: format(now, 'yyyy-MM-dd'),
      pixelsPerDay: 1
    };
  }

  const axis = buildTimelineAxis({
    items: visibleBars,
    containerWidth,
    displayStartDateIso,
    displayEndDateIso,
    defaultTimelineWidth: DEFAULT_TIMELINE_WIDTH
  });
  const getX = createDateToX(axis.minDate, axis.pixelsPerDay);
  const getWidth = createRangeToWidth(axis.pixelsPerDay);
  const timelineData = buildTimelineData({
    bars,
    selectedVersions,
    projectMap,
    getX,
    getWidth,
    statusStyles,
    isProcessMode,
    childTicketsMap
  });

  return {
    timelineData,
    timelineWidth: axis.timelineWidth,
    headerMonths: axis.headerMonths,
    headerYears: axis.headerYears,
    totalDurationText: axis.totalDurationText,
    todayX: axis.todayX,
    axisStartDateIso: axis.axisStartDateIso,
    axisEndDateIso: axis.axisEndDateIso,
    pixelsPerDay: axis.pixelsPerDay
  };
}

function buildTimelineData({
  bars,
  selectedVersions,
  projectMap,
  getX,
  getWidth,
  statusStyles,
  isProcessMode,
  childTicketsMap
}: {
  bars: CategoryBar[];
  selectedVersions: string[];
  projectMap: Map<number, ProjectInfo>;
  getX: (dateStr?: string) => number;
  getWidth: (startStr?: string, endStr?: string) => number;
  statusStyles: Record<'COMPLETED' | 'IN_PROGRESS' | 'PENDING', StatusStyle>;
  isProcessMode: boolean;
  childTicketsMap: Map<number, CategoryBar[]>;
}): TimelineLane[] {
  const groupedByProject = new Map<number, Map<string, CategoryBar[]>>();

  bars.forEach((bar) => {
    const versionKey = bar.version_name || t('common.noVersion');
    if (!selectedVersions.includes(versionKey)) return;

    if (!groupedByProject.has(bar.project_id)) {
      groupedByProject.set(bar.project_id, new Map<string, CategoryBar[]>());
    }

    const versionMap = groupedByProject.get(bar.project_id)!;
    if (!versionMap.has(versionKey)) {
      versionMap.set(versionKey, []);
    }

    versionMap.get(versionKey)!.push(bar);
  });

  const timelineData: TimelineLane[] = [];
  Array.from(groupedByProject.entries()).forEach(([projectId, versionMap]) => {
    const project = projectMap.get(projectId);
    const projectName = project?.name || t('timeline.projectFallback', { id: projectId });
    const projectIdentifier = project?.identifier || '';

    Array.from(versionMap.entries()).forEach(([versionKey, versionBars]) => {
      let displayBars = [...versionBars];

      if (isProcessMode) {
        const processedBars: CategoryBar[] = [];
        displayBars.forEach((parent) => {
          const children = childTicketsMap.get(parent.category_id);
          if (children && children.length > 0) {
            processedBars.push(...children);
          } else {
            processedBars.push(parent);
          }
        });
        displayBars = processedBars;
      }

      const sortedBars = displayBars
        .filter((bar) => bar.start_date && bar.end_date)
        .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
      const versionId = sortedBars.find((bar) => typeof bar.version_id === 'number')?.version_id;

      const steps: TimelineStep[] = sortedBars.map((bar, idx) => {
        const { status, progress } = resolveStatus(bar.progress_rate, statusStyles);
        const width = getWidth(bar.start_date, bar.end_date);
        const prevBar = idx > 0 ? sortedBars[idx - 1] : undefined;
        const joinsPrevious = Boolean(
          prevBar?.end_date &&
          bar.start_date &&
          differenceInDays(parseISO(bar.start_date), parseISO(prevBar.end_date)) === 1
        );

        let startDateStr = '';
        if (bar.start_date) {
            startDateStr = format(parseISO(bar.start_date), 'M/d');
        }

        let endDateStr = '';
        if (bar.end_date) {
            endDateStr = format(parseISO(bar.end_date), 'M/d');
        }

        return {
          issueId: bar.category_id,
          name: bar.ticket_subject || bar.category_name,
          x: getX(bar.start_date),
          width,
          status,
          progress,
          id: `ticket-${bar.project_id}-${bar.category_id}-${idx}`,
          startDateIso: bar.start_date || undefined,
          endDateIso: bar.end_date || undefined,
          startDateStr,
          endDateStr,
          editable: Boolean(bar.category_id && bar.start_date && bar.end_date),
          joinsPrevious
        };
      });

      timelineData.push({
        laneKey: `${projectId}:${versionKey}`,
        projectId,
        projectIdentifier,
        projectName,
        versionId,
        versionName: versionKey,
        steps
      });
    });
  });

  return timelineData;
}

function resolveStatus(
  progressRate: number,
  statusStyles: Record<'COMPLETED' | 'IN_PROGRESS' | 'PENDING', StatusStyle>
): { status: StatusStyle; progress?: number } {
  if (progressRate === 100) {
    return { status: statusStyles.COMPLETED, progress: 100 };
  }

  if (progressRate > 0) {
    return { status: statusStyles.IN_PROGRESS, progress: progressRate };
  }

  return { status: statusStyles.PENDING };
}
