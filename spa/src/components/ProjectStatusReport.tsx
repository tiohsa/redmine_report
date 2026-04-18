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

    const iconButtonStyle = "p-2 rounded-[9999px] text-[#45515e] hover:text-[#222222] hover:bg-[rgba(0,0,0,0.05)] transition-all duration-300 relative cursor-pointer";
    const activeIconButtonStyle = "p-2 rounded-[9999px] text-[var(--color-brand-6)] bg-[var(--color-primary-200)] hover:text-[var(--color-primary-700)] transition-all duration-300 relative shadow-subtle cursor-pointer";
    const headerIconStyle = "w-5 h-5";
    const filterDropdownPanelStyle = "absolute top-full left-0 mt-3 w-72 max-h-[420px] bg-white border border-gray-100 rounded-[20px] shadow-elevated z-50 overflow-hidden font-sans animate-in fade-in slide-in-from-top-2 duration-300";
    const filterDropdownTitleStyle = "px-5 pt-5 pb-3 text-[14px] font-semibold text-[#222222] font-display";
    const filterDropdownRowStyle = "px-5 py-3 flex items-center gap-3 text-[15px] text-[#45515e] hover:bg-gray-50 cursor-pointer font-sans transition-colors";
    const filterDropdownDividerStyle = "border-t border-gray-100 mx-5";
    const filterDropdownClearLinkStyle = "text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)] hover:underline text-sm cursor-pointer bg-transparent border-0 p-0 m-0 shadow-none appearance-none outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 font-sans font-medium";

    return (
        <div ref={fullScreenRef} className="bg-white flex-1 font-sans text-[#222222]">
            <div className="w-full bg-white px-6 pt-2 pb-2">
                {/* Header Row: Single line layout */}
                <div className="flex items-center justify-between h-10 mb-4">

                    {/* Left: Filters */}
                    <div className="flex items-center gap-2">
                        {/* Project Selection */}
                        <div className="relative" ref={projectDropdownRef}>
                             <button
                                onClick={() => setIsProjectOpen(!isProjectOpen)}
                                className={selectedProjectIdentifiers.length > 0 ? activeIconButtonStyle : iconButtonStyle}
                                title={t('filter.project')}
                            >
                                <svg className={headerIconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                                </svg>
                                {selectedProjectIdentifiers.length > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[var(--color-brand-6)] rounded-full border-2 border-white shadow-sm"></span>
                                )}
                            </button>
                            {isProjectOpen && (
                                <div className={filterDropdownPanelStyle}>
                                    <div className={filterDropdownTitleStyle}>{t('filter.project')}</div>
                                    <div
                                        className={filterDropdownRowStyle}
                                        onClick={() => {
                                            if (allSelectableProjectsSelected) {
                                                setSelectedProjectIdentifiers([]);
                                            } else {
                                                setSelectedProjectIdentifiers(selectableProjectIdentifiers);
                                            }
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={allSelectableProjectsSelected}
                                            readOnly
                                            className="w-4 h-4 rounded border-slate-400 text-blue-600 accent-blue-600 pointer-events-none"
                                        />
                                        <span>{t('filter.selectAll')}</span>
                                    </div>
                                    <div className={filterDropdownDividerStyle}></div>
                                    <div className="max-h-[280px] overflow-y-auto py-1">
                                        {availableProjects.map((p) => {
                                            const isSelected = selectedProjectIdentifiers.includes(p.identifier);
                                            const isDisabled = p.selectable === false;
                                            return (
                                                <div
                                                    key={p.project_id}
                                                    className={`${filterDropdownRowStyle} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    onClick={() => !isDisabled && toggleProject(p.identifier)}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        readOnly
                                                        disabled={isDisabled}
                                                        className="w-4 h-4 rounded border-slate-400 text-blue-600 accent-blue-600 pointer-events-none"
                                                    />
                                                    <span
                                                        className={`${isSelected ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
                                                        style={{ paddingLeft: `${p.level * 12}px` }}
                                                    >
                                                        {p.name}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
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
                            <button
                                onClick={() => setIsVersionOpen(!isVersionOpen)}
                                className={selectedVersions.length > 0 ? activeIconButtonStyle : iconButtonStyle}
                                title={t('filter.version')}
                            >
                                <svg className={headerIconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                                </svg>
                                 {selectedVersions.length > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[var(--color-brand-6)] rounded-full border-2 border-white shadow-sm"></span>
                                )}
                            </button>
                            {isVersionOpen && onVersionChange && (
                                <div className={filterDropdownPanelStyle}>
                                    <div className={filterDropdownTitleStyle}>{t('filter.version')}</div>
                                    <div
                                        className={filterDropdownRowStyle}
                                        onClick={() => onVersionChange(allVersionsSelected ? [] : allVersions)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={allVersionsSelected}
                                            readOnly
                                            className="w-4 h-4 rounded border-slate-400 text-blue-600 accent-blue-600 pointer-events-none"
                                        />
                                        <span>{t('filter.selectAll')}</span>
                                    </div>
                                    <div className={filterDropdownDividerStyle}></div>
                                    <div className="max-h-[280px] overflow-y-auto py-1">
                                        {allVersions.map((version) => (
                                            <div
                                                key={version}
                                                className={filterDropdownRowStyle}
                                                onClick={() => {
                                                    if (selectedVersions.includes(version)) {
                                                        onVersionChange(selectedVersions.filter(v => v !== version));
                                                    } else {
                                                        onVersionChange([...selectedVersions, version]);
                                                    }
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedVersions.includes(version)}
                                                    readOnly
                                                    className="w-4 h-4 rounded border-slate-400 text-blue-600 accent-blue-600 pointer-events-none"
                                                />
                                                <span className="truncate font-medium">{version}</span>
                                            </div>
                                        ))}
                                    </div>
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
                            <button
                                onClick={() => setIsLegendOpen(!isLegendOpen)}
                                onMouseEnter={() => setIsLegendOpen(true)}
                                className={iconButtonStyle}
                                title="Status Legend"
                            >
                                <svg className={headerIconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </button>
                             {isLegendOpen && (
                                <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-100 rounded-[16px] shadow-subtle z-50 p-4 animate-in fade-in zoom-in duration-200">
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

                        <div className="w-px h-6 bg-slate-200 mx-1"></div>

                        {/* Chart Size Selection */}
                        <div className="relative" ref={sizeDropdownRef}>
                             <button
                                onClick={() => setIsSizeOpen(!isSizeOpen)}
                                className={iconButtonStyle}
                                title={t('filter.size')}
                            >
                                <svg className={headerIconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"></path>
                                </svg>
                                <span className="absolute -bottom-1 -right-1 text-[9px] font-bold bg-[#f0f0f0] text-[#222222] px-1.5 py-0.5 rounded-full border border-gray-200 shadow-sm leading-none">
                                    {chartScale === 0.5 ? 'S' : chartScale === 0.75 ? 'M' : chartScale === 1 ? 'L' : 'XL'}
                                </span>
                            </button>
                            {isSizeOpen && (
                                <div className="absolute top-full right-0 mt-3 w-32 bg-white rounded-[16px] border border-gray-100 shadow-elevated z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                                    {[
                                        { label: 'S', value: 0.5 },
                                        { label: 'M', value: 0.75 },
                                        { label: 'L', value: 1 },
                                        { label: 'XL', value: 1.5 }
                                    ].map((option) => (
                                        <div
                                            key={option.label}
                                            onClick={() => {
                                                setChartScale(option.value);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    setChartScale(option.value);
                                                }
                                            }}
                                            role="button"
                                            tabIndex={0}
                                            className={`block w-full m-0 flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 cursor-pointer ${chartScale === option.value ? 'text-blue-600 bg-blue-50' : 'text-slate-600'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={chartScale === option.value}
                                                readOnly
                                                tabIndex={-1}
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600 pointer-events-none"
                                                aria-hidden="true"
                                            />
                                            <span className={chartScale === option.value ? 'font-bold' : 'font-medium'}>{option.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Process Mode Toggle */}
                        <button
                            onClick={() => setIsProcessMode(!isProcessMode)}
                            className={isProcessMode ? activeIconButtonStyle : iconButtonStyle}
                            title={t('filter.processMode', { defaultValue: 'Process Mode' })}
                            aria-pressed={isProcessMode}
                        >
                            <svg className={headerIconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            </svg>
                            <span
                                className={`absolute -bottom-1 -right-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full border shadow-sm leading-none transition-all ${isProcessMode || showAllDates || showTodayLine
                                    ? 'bg-[var(--color-brand-6)] text-white border-[var(--color-brand-6)]'
                                    : 'bg-white text-[#8e8e93] border-gray-200'
                                }`}
                            >
                                {isLoadingChildren ? '...' : isProcessMode ? 'ON' : 'OFF'}
                            </span>
                        </button>

                        {/* Date Range Setting */}
                        <button
                            onClick={openDateRangeDialog}
                            className={isCustomDateRangeActive ? activeIconButtonStyle : iconButtonStyle}
                            title={t('filter.dateRange')}
                            aria-haspopup="dialog"
                            aria-expanded={isDateRangeDialogOpen}
                        >
                            <svg className={headerIconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 2v4m8-4v4M3 10h18M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10h6m-2-2 2 2-2 2"></path>
                            </svg>
                            {isCustomDateRangeActive && (
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full border border-white"></span>
                            )}
                        </button>

                        {/* Date Display Toggle */}
                        <button
                            onClick={() => setShowAllDates(!showAllDates)}
                            className={showAllDates ? activeIconButtonStyle : iconButtonStyle}
                            title={t('filter.dateDisplay')}
                            aria-pressed={showAllDates}
                        >
                            <svg className={headerIconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                            </svg>
                            <span
                                className={`absolute -bottom-1 -right-1 text-[9px] font-bold px-1 rounded border ${showAllDates
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-500 border-slate-200'
                                }`}
                            >
                                {showAllDates ? 'ON' : 'OFF'}
                            </span>
                        </button>

                        {/* Today Line Toggle */}
                        <button
                            onClick={() => setShowTodayLine(!showTodayLine)}
                            className={showTodayLine ? activeIconButtonStyle : iconButtonStyle}
                            title={t('timeline.todayLineToggle', { defaultValue: 'Today line' })}
                            aria-pressed={showTodayLine}
                        >
                            <svg className={headerIconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 6h16M4 12h6m4 0h6M4 18h16" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v16" />
                            </svg>
                            <span
                                className={`absolute -bottom-1 -right-1 text-[9px] font-bold px-1 rounded border ${showTodayLine
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-500 border-slate-200'
                                }`}
                            >
                                {showTodayLine ? 'ON' : 'OFF'}
                            </span>
                        </button>

                        <div className="w-px h-6 bg-slate-200 mx-1"></div>

                        {/* Fullscreen */}
                        <button
                            onClick={toggleFullScreen}
                            className={iconButtonStyle}
                            title={t('report.fullscreen')}
                        >
                            <svg className={headerIconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
                            </svg>
                        </button>

                        {/* Export */}
                        <button
                            className={iconButtonStyle}
                            title={t('report.export')}
                        >
                            <svg className={headerIconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 10l5 5m0 0l5-5m-5 5V3"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                {fetchError && (
                    <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-5 py-4 rounded-xl relative" role="alert">
                        <span className="block sm:inline text-sm font-bold">{fetchError}</span>
                    </div>
                )}

                {processModeError && isProcessMode && (
                    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800" role="alert">
                        <span className="block text-sm font-semibold">
                            {t('filter.processMode', { defaultValue: 'Process Mode' })}: {processModeError}
                        </span>
                    </div>
                )}

                <div className="flex flex-col gap-4">
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[4px] px-4" role="dialog" aria-modal="true" aria-label={t('filter.dateRange')}>
                        <div className="w-full max-w-md rounded-[24px] border border-gray-100 bg-white p-8 shadow-brand-glow animate-in fade-in zoom-in slide-in-from-bottom-4 duration-500">
                            <h2 className="text-[31px] font-display font-semibold text-[#222222] leading-tight">{t('filter.dateRange')}</h2>
                            <p className="mt-3 text-[16px] text-[#45515e] font-sans leading-relaxed">{t('filter.dateRangeDescription')}</p>
                            <div className="mt-6 grid grid-cols-1 gap-5">
                                <label className="text-[13px] font-sans font-medium uppercase text-[#8e8e93] tracking-wide">
                                    {t('weeklyDialog.startDate')}
                                    <input
                                        type="date"
                                        value={pendingStartDate}
                                        onChange={(event) => setPendingStartDate(event.target.value)}
                                        className="mt-2 w-full rounded-[8px] border border-gray-200 px-4 py-3 text-[16px] font-sans text-[#222222] focus:outline-none focus:border-[#45515e] transition-colors"
                                    />
                                </label>
                                <label className="text-[13px] font-sans font-medium uppercase text-[#8e8e93] tracking-wide">
                                    {t('weeklyDialog.endDate')}
                                    <input
                                        type="date"
                                        value={pendingEndDate}
                                        onChange={(event) => setPendingEndDate(event.target.value)}
                                        className="mt-2 w-full rounded-[8px] border border-gray-200 px-4 py-3 text-[16px] font-sans text-[#222222] focus:outline-none focus:border-[#45515e] transition-colors"
                                    />
                                </label>
                            </div>
                            {dateRangeError && (
                                <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{dateRangeError}</p>
                            )}
                            <div className="mt-8 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsDateRangeDialogOpen(false)}
                                    className="h-10 px-5 rounded-full border border-gray-200 bg-[#f0f0f0] text-[14px] font-sans font-medium text-[#222222] hover:bg-gray-200 transition-colors cursor-pointer"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={clearDateRange}
                                    className="h-10 px-5 rounded-full border border-gray-200 bg-white text-[14px] font-sans font-medium text-[#222222] hover:bg-gray-50 transition-colors cursor-pointer"
                                >
                                    {t('filter.clearDateRange')}
                                </button>
                                <button
                                    type="button"
                                    onClick={applyDateRange}
                                    className="h-10 px-6 rounded-full bg-[#181e25] text-[14px] font-sans font-semibold text-white hover:bg-black transition-colors cursor-pointer"
                                >
                                    {t('common.save')}
                                </button>
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
