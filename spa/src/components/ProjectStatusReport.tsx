import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    fetchWeeklyAiResponses,
    fetchChildIssues,
    CategoryBar,
    ProjectInfo,
    WeeklyApiError
} from '../services/scheduleReportApi';
import { buildStatusStyles } from './projectStatusReport/constants';
import { buildTimelineViewModel } from './projectStatusReport/timeline';
import { TimelineChart } from './projectStatusReport/TimelineChart';
import { useUiStore } from '../stores/uiStore';
import { VersionAiDialog } from './projectStatusReport/VersionAiDialog';
import type { AiResponseView } from '../types/weeklyReport';
import { getDateFnsLocale, getLocale, t } from '../i18n';
import { reportStyles } from './designSystem';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { SelectionList, SelectionRow, CheckboxRow } from './ui/SelectionList';
import { FieldLabel } from './ui/FieldLabel';

const CHART_SCALE_STORAGE_KEY = 'redmine_report.schedule.chartScale';
const SHOW_ALL_DATES_STORAGE_KEY = 'redmine_report.schedule.showAllDates';
const SHOW_TODAY_LINE_STORAGE_KEY = 'redmine_report.schedule.showTodayLine';
const PROCESS_MODE_STORAGE_KEY = 'redmine_report.schedule.processMode';

const readStoredChartScale = (): number => {
    if (typeof window === 'undefined') return 1;
    try {
        const raw = window.localStorage.getItem(CHART_SCALE_STORAGE_KEY);
        const parsed = raw ? Number(raw) : NaN;
        return [0.5, 0.75, 1, 1.5].includes(parsed) ? parsed : 1;
    } catch {
        return 1;
    }
};

const readStoredShowAllDates = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(SHOW_ALL_DATES_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

const readStoredShowTodayLine = (): boolean => {
    if (typeof window === 'undefined') return true;
    try {
        const raw = window.localStorage.getItem(SHOW_TODAY_LINE_STORAGE_KEY);
        return raw === null ? true : raw === 'true';
    } catch {
        return true;
    }
};

const readStoredProcessMode = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(PROCESS_MODE_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

const writeStoredScheduleViewSetting = (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore storage failures
    }
};

interface ProjectStatusReportProps {
    bars?: CategoryBar[];
    projectIdentifier: string;
    availableProjects?: ProjectInfo[];
    selectedVersions?: string[];
    onVersionChange?: (versions: string[]) => void;
    onTaskDatesUpdated?: () => void;
    fetchError?: string | null;
}

export const ProjectStatusReport = ({
    bars = [],
    projectIdentifier,
    availableProjects = [],
    selectedVersions = [],
    onVersionChange,
    onTaskDatesUpdated,
    fetchError = null
}: ProjectStatusReportProps) => {
    const [aiResponse, setAiResponse] = useState<AiResponseView | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [activeReportLaneKey, setActiveReportLaneKey] = useState<string | null>(null);
    const reportRequestSeqRef = useRef(0);
    const [weeklyDialog, setWeeklyDialog] = useState<{
        open: boolean;
        projectId: number;
        projectName: string;
        versionId: number;
        versionName: string;
    }>({
        open: false,
        projectId: 0,
        projectName: '',
        versionId: 0,
        versionName: ''
    });
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState<number>(0);
    const [chartScale, setChartScale] = useState<number>(() => readStoredChartScale());
    const [showAllDates, setShowAllDates] = useState<boolean>(() => readStoredShowAllDates());
    const [showTodayLine, setShowTodayLine] = useState<boolean>(() => readStoredShowTodayLine());
    const [isProcessMode, setIsProcessMode] = useState<boolean>(() => readStoredProcessMode());
    const [childTicketsMap, setChildTicketsMap] = useState<Map<number, CategoryBar[]>>(new Map());
    const [isLoadingChildren, setIsLoadingChildren] = useState(false);
    const [processModeError, setProcessModeError] = useState<string | null>(null);
    const processModeRequestSeqRef = useRef(0);
    const statuses = useMemo(() => Object.values(buildStatusStyles()), []);

    const { rootProjectIdentifier, selectedProjectIdentifiers, setSelectedProjectIdentifiers } = useUiStore();
    const [isProjectOpen, setIsProjectOpen] = useState(false);
    const [isVersionOpen, setIsVersionOpen] = useState(false);
    const [isSizeOpen, setIsSizeOpen] = useState(false);
    const [isLegendOpen, setIsLegendOpen] = useState(false);
    const [isDateRangeDialogOpen, setIsDateRangeDialogOpen] = useState(false);
    const [displayStartDateIso, setDisplayStartDateIso] = useState<string | undefined>(undefined);
    const [displayEndDateIso, setDisplayEndDateIso] = useState<string | undefined>(undefined);
    const [pendingStartDate, setPendingStartDate] = useState('');
    const [pendingEndDate, setPendingEndDate] = useState('');
    const [dateRangeError, setDateRangeError] = useState<string | null>(null);

    const projectDropdownRef = useRef<HTMLDivElement>(null);
    const versionDropdownRef = useRef<HTMLDivElement>(null);
    const sizeDropdownRef = useRef<HTMLDivElement>(null);
    const legendDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
                setIsProjectOpen(false);
            }
            if (versionDropdownRef.current && !versionDropdownRef.current.contains(event.target as Node)) {
                setIsVersionOpen(false);
            }
            if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(event.target as Node)) {
                setIsSizeOpen(false);
            }
            if (legendDropdownRef.current && !legendDropdownRef.current.contains(event.target as Node)) {
                setIsLegendOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    useEffect(() => {
        writeStoredScheduleViewSetting(CHART_SCALE_STORAGE_KEY, String(chartScale));
    }, [chartScale]);

    useEffect(() => {
        writeStoredScheduleViewSetting(SHOW_ALL_DATES_STORAGE_KEY, String(showAllDates));
    }, [showAllDates]);

    useEffect(() => {
        writeStoredScheduleViewSetting(SHOW_TODAY_LINE_STORAGE_KEY, String(showTodayLine));
    }, [showTodayLine]);

    useEffect(() => {
        writeStoredScheduleViewSetting(PROCESS_MODE_STORAGE_KEY, String(isProcessMode));
    }, [isProcessMode]);

    useEffect(() => {
        const requestId = processModeRequestSeqRef.current + 1;
        processModeRequestSeqRef.current = requestId;

        if (!isProcessMode || bars.length === 0) {
            setChildTicketsMap(new Map());
            setIsLoadingChildren(false);
            setProcessModeError(null);
            return;
        }

        const controller = new AbortController();
        setIsLoadingChildren(true);
        // Do not clear childTicketsMap immediately. Keep current view (parent bars) 
        // to avoid blank flash/layout shift while loading child issues.
        setProcessModeError(null);

        (async () => {
            try {
                const map = await fetchChildIssues(rootProjectIdentifier || projectIdentifier, bars, controller.signal);
                if (requestId !== processModeRequestSeqRef.current) return;
                setChildTicketsMap(map);
            } catch (error) {
                if (controller.signal.aborted) return;
                if (requestId !== processModeRequestSeqRef.current) return;
                console.error('[schedule_report] failed to fetch child issues for Process Mode', error);
                setChildTicketsMap(new Map());
                setProcessModeError(
                    error instanceof Error && error.message
                        ? error.message
                        : t('api.fetchChildIssues', {
                            status: 0,
                            defaultValue: 'Failed to load child issues for Process Mode'
                        })
                );
            } finally {
                if (requestId !== processModeRequestSeqRef.current) return;
                setIsLoadingChildren(false);
            }
        })();

        return () => {
            controller.abort();
        };
    }, [isProcessMode, bars, rootProjectIdentifier, projectIdentifier]);

    useLayoutEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                // Use contentRect for stable measurement
                const newWidth = Math.floor(entry.contentRect.width);
                setContainerWidth((current) => {
                    // Only update if the width changed by more than 1.5 pixels.
                    // This prevents "shivering" caused by scrollbar-induced layout loops.
                    if (Math.abs(current - newWidth) > 1.5) {
                        return newWidth;
                    }
                    return current;
                });
            }
        });

        observer.observe(containerRef.current);
        
        // Initial width measurement
        setContainerWidth(Math.floor(containerRef.current.clientWidth));

        return () => observer.disconnect();
    }, []);

    const projectMap = useMemo(() => {
        const map = new Map<number, ProjectInfo>();
        availableProjects.forEach((project) => map.set(project.project_id, project));
        return map;
    }, [availableProjects]);

    const { timelineData, timelineWidth, headerMonths, headerYears, todayX, axisStartDateIso, axisEndDateIso, pixelsPerDay } = useMemo(
        () =>
            buildTimelineViewModel({
                bars,
                selectedVersions,
                projectMap,
                containerWidth,
                displayStartDateIso,
                displayEndDateIso,
                isProcessMode,
                childTicketsMap
            }),
        [bars, selectedVersions, projectMap, containerWidth, displayStartDateIso, displayEndDateIso, isProcessMode, childTicketsMap]
    );

    const allVersions = useMemo(() => {
        const versions = new Set<string>();
        bars.forEach(bar => {
            versions.add(bar.version_name || t('common.noVersion'));
        });
        return Array.from(versions).sort();
    }, [bars]);
    const selectableProjectIdentifiers = useMemo(
        () => availableProjects.filter((p) => p.selectable !== false).map((p) => p.identifier),
        [availableProjects]
    );
    const allSelectableProjectsSelected = selectableProjectIdentifiers.length > 0
        && selectableProjectIdentifiers.every((id) => selectedProjectIdentifiers.includes(id));
    const allVersionsSelected = allVersions.length > 0 && selectedVersions.length === allVersions.length;

    const isCustomDateRangeActive = Boolean(displayStartDateIso && displayEndDateIso);
    const summaryMetrics = [
        {
            label: t('report.projectScope'),
            value: selectedProjectIdentifiers.length > 0
                ? t('filter.projectsCount', { count: selectedProjectIdentifiers.length })
                : t('filter.selectProjects')
        },
        {
            label: t('report.versionScope'),
            value: selectedVersions.length > 0
                ? t('filter.selectedCount', { count: selectedVersions.length })
                : t('report.noneSelected')
        },
        {
            label: t('report.taskCount'),
            value: t('timeline.totalTasks', { count: bars.length })
        }
    ];

    const openDateRangeDialog = () => {
        setPendingStartDate(displayStartDateIso || axisStartDateIso);
        setPendingEndDate(displayEndDateIso || axisEndDateIso);
        setDateRangeError(null);
        setIsDateRangeDialogOpen(true);
    };

    const applyDateRange = () => {
        if (!pendingStartDate || !pendingEndDate) {
            setDateRangeError(t('filter.dateRangeRequired'));
            return;
        }
        if (pendingStartDate > pendingEndDate) {
            setDateRangeError(t('filter.dateRangeInvalid'));
            return;
        }
        setDisplayStartDateIso(pendingStartDate);
        setDisplayEndDateIso(pendingEndDate);
        setDateRangeError(null);
        setIsDateRangeDialogOpen(false);
    };

    const clearDateRange = () => {
        setDisplayStartDateIso(undefined);
        setDisplayEndDateIso(undefined);
        setDateRangeError(null);
        setIsDateRangeDialogOpen(false);
    };

    const handleVersionReportClick = async (payload: { laneKey: string; versionId: number; versionName: string; projectId: number; projectName: string; projectIdentifier: string }) => {
        if (activeReportLaneKey === payload.laneKey) {
            reportRequestSeqRef.current += 1;
            setActiveReportLaneKey(null);
            setAiLoading(false);
            setAiError(null);
            return;
        }

        const requestId = reportRequestSeqRef.current + 1;
        reportRequestSeqRef.current = requestId;

        setActiveReportLaneKey(payload.laneKey);
        setAiLoading(true);
        setAiError(null);
        try {
            const result = await fetchWeeklyAiResponses(rootProjectIdentifier || projectIdentifier, {
                selected_project_identifier: payload.projectIdentifier,
                selected_version_id: payload.versionId
            });
            if (requestId !== reportRequestSeqRef.current) return;
            setAiResponse(result.response || null);
        } catch (caughtError: unknown) {
            if (requestId !== reportRequestSeqRef.current) return;
            if (caughtError instanceof WeeklyApiError && caughtError.code === 'NOT_FOUND') {
                setAiResponse({
                    status: 'NOT_SAVED',
                    destination_issue_id: 0,
                    failure_reason_code: 'NOT_FOUND',
                    message: t('aiPanel.notSaved')
                });
                return;
            }
            setAiResponse({
                status: 'FETCH_FAILED',
                destination_issue_id: 0,
                message: caughtError instanceof Error ? caughtError.message : t('aiPanel.fetchFailed')
            });
            setAiError(caughtError instanceof Error ? caughtError.message : t('aiPanel.fetchFailed'));
        } finally {
            if (requestId !== reportRequestSeqRef.current) return;
            setAiLoading(false);
        }
    };

    const toggleProject = (identifier: string) => {
        if (selectedProjectIdentifiers.includes(identifier)) {
            setSelectedProjectIdentifiers(selectedProjectIdentifiers.filter(pid => pid !== identifier));
        } else {
            setSelectedProjectIdentifiers([...selectedProjectIdentifiers, identifier]);
        }
    };

    const fullScreenRef = useRef<HTMLDivElement>(null);

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            fullScreenRef.current?.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    };

    const iconButtonStyle = reportStyles.iconButton;
    const activeIconButtonStyle = reportStyles.iconButtonActive;
    const filterDropdownPanelStyle = `${reportStyles.dropdownPanel} top-full left-0 mt-3 w-72 max-h-[420px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300`;
    const filterDropdownTitleStyle = reportStyles.dropdownTitle;
    const filterDropdownRowStyle = reportStyles.dropdownRow;
    const filterDropdownDividerStyle = reportStyles.dropdownDivider;
    const filterDropdownClearLinkStyle = reportStyles.dropdownClear;

    return (
        <div ref={fullScreenRef} className="flex-1 bg-transparent font-sans text-[#222222]">
            <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 pb-6 pt-4 sm:px-6 lg:px-8">
                {/* Header Row: Single line layout */}
                <div className="report-surface flex items-center justify-between gap-4 px-5 py-4 shadow-none">

                    {/* Left: Filters */}
                    <div className="flex items-center gap-2">
                        {/* Project Selection */}
                        <div className="relative" ref={projectDropdownRef}>
                             <Button
                                onClick={() => setIsProjectOpen(!isProjectOpen)}
                                variant={selectedProjectIdentifiers.length > 0 ? 'icon-active' : 'icon'}
                                className="h-11 w-11"
                                title={t('filter.project')}
                            >
                                <Icon name="folder" className="h-5 w-5" />
                                {selectedProjectIdentifiers.length > 0 && (
                                    <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--color-brand-6)] shadow-sm"></span>
                                )}
                            </Button>
                            {isProjectOpen && (
                                <div className={filterDropdownPanelStyle}>
                                    <div className={filterDropdownTitleStyle}>{t('filter.project')}</div>
                                    <SelectionRow
                                        className={filterDropdownRowStyle}
                                        active={allSelectableProjectsSelected}
                                        leading={<CheckboxRow checked={allSelectableProjectsSelected} />}
                                        onClick={() => {
                                            if (allSelectableProjectsSelected) {
                                                setSelectedProjectIdentifiers([]);
                                            } else {
                                                setSelectedProjectIdentifiers(selectableProjectIdentifiers);
                                            }
                                        }}
                                    >
                                        {t('filter.selectAll')}
                                    </SelectionRow>
                                    <div className={filterDropdownDividerStyle}></div>
                                    <SelectionList className="max-h-[280px] overflow-y-auto">
                                        {availableProjects.map((p) => {
                                            const isSelected = selectedProjectIdentifiers.includes(p.identifier);
                                            const isDisabled = p.selectable === false;
                                            return (
                                                <SelectionRow
                                                    key={p.project_id}
                                                    className={filterDropdownRowStyle}
                                                    active={isSelected}
                                                    disabled={isDisabled}
                                                    indent={p.level * 12}
                                                    leading={<CheckboxRow checked={isSelected} />}
                                                    onClick={() => toggleProject(p.identifier)}
                                                >
                                                    {p.name}
                                                </SelectionRow>
                                            );
                                        })}
                                    </SelectionList>
                                    <div className={filterDropdownDividerStyle}></div>
                                    <div className="px-4 py-2.5">
                                        <span
                                            onClick={() => setSelectedProjectIdentifiers([])}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    setSelectedProjectIdentifiers([]);
                                                }
                                            }}
                                            role="button"
                                            tabIndex={0}
                                            className={filterDropdownClearLinkStyle}
                                        >
                                            {t('filter.clear')}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Version Selection */}
                        <div className="relative" ref={versionDropdownRef}>
                            <Button
                                onClick={() => setIsVersionOpen(!isVersionOpen)}
                                variant={selectedVersions.length > 0 ? 'icon-active' : 'icon'}
                                className="h-11 w-11"
                                title={t('filter.version')}
                            >
                                <Icon name="tag" className="h-5 w-5" />
                                {selectedVersions.length > 0 && (
                                    <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--color-brand-6)] shadow-sm"></span>
                                )}
                            </Button>
                            {isVersionOpen && onVersionChange && (
                                <div className={filterDropdownPanelStyle}>
                                    <div className={filterDropdownTitleStyle}>{t('filter.version')}</div>
                                    <SelectionRow
                                        className={filterDropdownRowStyle}
                                        active={allVersionsSelected}
                                        leading={<CheckboxRow checked={allVersionsSelected} />}
                                        onClick={() => onVersionChange(allVersionsSelected ? [] : allVersions)}
                                    >
                                        {t('filter.selectAll')}
                                    </SelectionRow>
                                    <div className={filterDropdownDividerStyle}></div>
                                    <SelectionList className="max-h-[280px] overflow-y-auto">
                                        {allVersions.map((version) => (
                                            <SelectionRow
                                                key={version}
                                                className={filterDropdownRowStyle}
                                                active={selectedVersions.includes(version)}
                                                leading={<CheckboxRow checked={selectedVersions.includes(version)} />}
                                                onClick={() => {
                                                    if (selectedVersions.includes(version)) {
                                                        onVersionChange(selectedVersions.filter(v => v !== version));
                                                    } else {
                                                        onVersionChange([...selectedVersions, version]);
                                                    }
                                                }}
                                            >
                                                {version}
                                            </SelectionRow>
                                        ))}
                                    </SelectionList>
                                    <div className={filterDropdownDividerStyle}></div>
                                    <div className="px-4 py-2.5">
                                        <span
                                            onClick={() => onVersionChange([])}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    onVersionChange([]);
                                                }
                                            }}
                                            role="button"
                                            tabIndex={0}
                                            className={filterDropdownClearLinkStyle}
                                        >
                                            {t('filter.clear')}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: View Options & Actions */}
                    <div className="flex items-center gap-2">
                        {/* Status Legend Info */}
                        <div className="relative" ref={legendDropdownRef}>
                            <Button
                                onClick={() => setIsLegendOpen(!isLegendOpen)}
                                onMouseEnter={() => setIsLegendOpen(true)}
                                variant="icon"
                                className="h-11 w-11"
                                title="Status Legend"
                            >
                                <Icon name="info" className="h-5 w-5" />
                            </Button>
                             {isLegendOpen && (
                                <div className="report-dropdown-panel right-0 top-full mt-2 w-48 p-4 animate-in fade-in zoom-in duration-200">
                                    <div className="flex flex-col gap-3">
                                        {statuses.map((status) => (
                                            <div key={status.label} className="flex items-center gap-3 text-[#222222] font-sans">
                                                <div
                                                    className="w-3.5 h-3.5 rounded-full border shadow-sm"
                                                    style={{
                                                        backgroundColor: status.fill,
                                                        borderColor: status.stroke
                                                    }}
                                                ></div>
                                                <span className="text-[13px] font-medium">{status.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mx-1 h-6 w-px bg-slate-200"></div>

                        {/* Chart Size Selection */}
                        <div className="relative" ref={sizeDropdownRef}>
                             <Button
                                onClick={() => setIsSizeOpen(!isSizeOpen)}
                                variant="icon"
                                className="h-11 w-11"
                                title={t('filter.size')}
                            >
                                <Icon name="sliders" className="h-5 w-5" />
                                <span className="absolute -bottom-1 -right-1 rounded-full border border-gray-200 bg-[#f0f0f0] px-1.5 py-0.5 text-[9px] font-bold leading-none text-[#222222] shadow-sm">
                                    {chartScale === 0.5 ? 'S' : chartScale === 0.75 ? 'M' : chartScale === 1 ? 'L' : 'XL'}
                                </span>
                            </Button>
                            {isSizeOpen && (
                                <div className="report-dropdown-panel right-0 top-full mt-3 w-32 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                                    <SelectionList>
                                    {[
                                        { label: 'S', value: 0.5 },
                                        { label: 'M', value: 0.75 },
                                        { label: 'L', value: 1 },
                                        { label: 'XL', value: 1.5 }
                                    ].map((option) => (
                                        <SelectionRow
                                            key={option.label}
                                            active={chartScale === option.value}
                                            leading={<CheckboxRow checked={chartScale === option.value} />}
                                            onClick={() => { setChartScale(option.value); }}
                                        >
                                            <span className={chartScale === option.value ? 'font-bold' : 'font-medium'}>{option.label}</span>
                                        </SelectionRow>
                                    ))}
                                    </SelectionList>
                                </div>
                            )}
                        </div>

                        {/* Process Mode Toggle */}
                        <Button
                            onClick={() => setIsProcessMode(!isProcessMode)}
                            variant={isProcessMode ? 'icon-active' : 'icon'}
                            className="h-11 w-11"
                            title={t('filter.processMode', { defaultValue: 'Process Mode' })}
                            aria-pressed={isProcessMode}
                        >
                            <Icon name="process" className="h-5 w-5" />
                                <span
                                    className={`absolute -bottom-1 -right-1 rounded-full border px-1.5 py-0.5 text-[8px] font-bold leading-none shadow-sm transition-all ${isProcessMode || showAllDates || showTodayLine
                                    ? 'bg-[var(--color-brand-6)] text-white border-[var(--color-brand-6)]'
                                    : 'bg-white text-[#8e8e93] border-gray-200'
                                }`}
                            >
                                {isLoadingChildren ? '...' : isProcessMode ? 'ON' : 'OFF'}
                            </span>
                        </Button>

                        {/* Date Range Setting */}
                        <Button
                            onClick={openDateRangeDialog}
                            variant={isCustomDateRangeActive ? 'icon-active' : 'icon'}
                            className="h-11 w-11"
                            title={t('filter.dateRange')}
                            aria-haspopup="dialog"
                            aria-expanded={isDateRangeDialogOpen}
                        >
                            <Icon name="calendar" className="h-5 w-5" />
                            {isCustomDateRangeActive && (
                                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-white bg-blue-500"></span>
                            )}
                        </Button>

                        {/* Date Display Toggle */}
                        <Button
                            onClick={() => setShowAllDates(!showAllDates)}
                            variant={showAllDates ? 'icon-active' : 'icon'}
                            className="h-11 w-11"
                            title={t('filter.dateDisplay')}
                            aria-pressed={showAllDates}
                        >
                            <Icon name="calendar" className="h-5 w-5" />
                            <span
                                className={`absolute -bottom-1 -right-1 rounded border px-1 text-[9px] font-bold ${showAllDates
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-500 border-slate-200'
                                }`}
                            >
                                {showAllDates ? 'ON' : 'OFF'}
                            </span>
                        </Button>

                        {/* Today Line Toggle */}
                        <Button
                            onClick={() => setShowTodayLine(!showTodayLine)}
                            variant={showTodayLine ? 'icon-active' : 'icon'}
                            className="h-11 w-11"
                            title={t('timeline.todayLineToggle', { defaultValue: 'Today line' })}
                            aria-pressed={showTodayLine}
                        >
                            <Icon name="today" className="h-5 w-5" />
                            <span
                                className={`absolute -bottom-1 -right-1 rounded border px-1 text-[9px] font-bold ${showTodayLine
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-500 border-slate-200'
                                }`}
                            >
                                {showTodayLine ? 'ON' : 'OFF'}
                            </span>
                        </Button>

                        <div className="w-px h-6 bg-slate-200 mx-1"></div>

                        {/* Fullscreen */}
                        <Button
                            onClick={toggleFullScreen}
                            variant="icon"
                            className="h-11 w-11"
                            title={t('report.fullscreen')}
                        >
                            <Icon name="fullscreen" className="h-5 w-5" />
                        </Button>

                        {/* Export */}
                        <Button
                            variant="icon"
                            className="h-11 w-11"
                            title={t('report.export')}
                        >
                            <Icon name="download" className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                <div className={reportStyles.summaryStrip}>
                    {summaryMetrics.map((metric) => (
                        <div key={metric.label} className={reportStyles.summaryMetric}>
                            <div className={reportStyles.summaryLabel}>{metric.label}</div>
                            <div className={reportStyles.summaryValue}>{metric.value}</div>
                        </div>
                    ))}
                </div>

                {fetchError && (
                    <div className="report-alert-error relative" role="alert">
                        <span className="block text-sm font-bold sm:inline">{fetchError}</span>
                    </div>
                )}

                {processModeError && isProcessMode && (
                    <div className="report-alert-warning" role="alert">
                        <span className="block text-sm font-semibold">
                            {t('filter.processMode', { defaultValue: 'Process Mode' })}: {processModeError}
                        </span>
                    </div>
                )}

                <div className="report-surface overflow-hidden">
                    <TimelineChart
                        timelineData={timelineData}
                        timelineWidth={timelineWidth}
                        headerMonths={headerMonths}
                        headerYears={headerYears}
                        todayX={todayX}
                        axisStartDateIso={axisStartDateIso}
                        axisEndDateIso={axisEndDateIso}
                        pixelsPerDay={pixelsPerDay}
                        containerRef={containerRef}
                        projectIdentifier={rootProjectIdentifier || projectIdentifier}
                        isProcessMode={isProcessMode}
                        chartScale={chartScale}
                        showAllDates={showAllDates}
                        showTodayLine={showTodayLine}
                        onTaskDatesUpdated={onTaskDatesUpdated}
                        onVersionAiClick={({ versionId, versionName, projectId, projectName }) =>
                            setWeeklyDialog({
                                open: true,
                                versionId,
                                versionName,
                                projectId,
                                projectName
                            })
                        }
                        onVersionReportClick={handleVersionReportClick}
                        onClearSelection={() => {
                            setActiveReportLaneKey(null);
                            setAiLoading(false);
                            setAiError(null);
                        }}
                        activeReportLaneKey={activeReportLaneKey}
                        detailedReportResponse={aiResponse}
                        detailedReportLoading={aiLoading}
                        detailedReportError={aiError}
                    />
                </div>


                 {isDateRangeDialogOpen && (
                    <div className={reportStyles.dialogOverlay} role="dialog" aria-modal="true" aria-label={t('filter.dateRange')}>
                        <div className={`${reportStyles.dialogPanel} ${reportStyles.dialogPanelSm} animate-in fade-in zoom-in slide-in-from-bottom-4 duration-500`}>
                        <div className={reportStyles.dialogBody}>
                            <h2 className="report-section-title">{t('filter.dateRange')}</h2>
                            <p className="mt-3 text-[16px] font-sans leading-relaxed text-[#45515e]">{t('filter.dateRangeDescription')}</p>
                            <div className="mt-6 grid grid-cols-1 gap-5">
                                <FieldLabel className="block">
                                    {t('weeklyDialog.startDate')}
                                    <input
                                        type="date"
                                        value={pendingStartDate}
                                        onChange={(event) => setPendingStartDate(event.target.value)}
                                        className="report-input mt-2"
                                    />
                                </FieldLabel>
                                <FieldLabel className="block">
                                    {t('weeklyDialog.endDate')}
                                    <input
                                        type="date"
                                        value={pendingEndDate}
                                        onChange={(event) => setPendingEndDate(event.target.value)}
                                        className="report-input mt-2"
                                    />
                                </FieldLabel>
                            </div>
                            {dateRangeError && (
                                <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{dateRangeError}</p>
                            )}
                            <div className="mt-8 flex items-center justify-end gap-3">
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsDateRangeDialogOpen(false)}
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={clearDateRange}
                                >
                                    {t('filter.clearDateRange')}
                                </Button>
                                <Button
                                    onClick={applyDateRange}
                                >
                                    {t('common.save')}
                                </Button>
                            </div>
                        </div>
                        </div>
                    </div>
                )}

                <VersionAiDialog
                    open={weeklyDialog.open}
                    projectIdentifier={projectIdentifier}
                    projectId={weeklyDialog.projectId}
                    versionId={weeklyDialog.versionId}
                    versionName={weeklyDialog.versionName}
                    onClose={() => setWeeklyDialog((prev) => ({ ...prev, open: false }))}
                />
            </div>
        </div>
    );
};
