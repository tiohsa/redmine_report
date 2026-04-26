import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    fetchWeeklyAiResponses,
    fetchChildIssues,
    CategoryBar,
    ProjectInfo,
    WeeklyApiError,
    updateWeeklyAiResponse
} from '../services/scheduleReportApi';
import { buildStatusStyles } from './projectStatusReport/constants';
import { buildTimelineViewModel } from './projectStatusReport/timeline';
import { TimelineChart } from './projectStatusReport/TimelineChart';
import { ProjectStatusReportToolbar } from './projectStatusReport/ProjectStatusReportToolbar';
import { useProjectStatusReportControls } from './projectStatusReport/useProjectStatusReportControls';
import { useUiStore } from '../stores/uiStore';
import { VersionAiDialog } from './projectStatusReport/VersionAiDialog';
import type { AiResponseView } from '../types/weeklyReport';
import { t } from '../i18n';
import { reportStyles } from './designSystem';
import type { EditableSections } from './AiResponsePanel';

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
    const [activeReportContext, setActiveReportContext] = useState<{
        projectIdentifier: string;
        versionId: number;
    } | null>(null);
    const [inlineReportDirty, setInlineReportDirty] = useState(false);
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
    const [childTicketsMap, setChildTicketsMap] = useState<Map<number, CategoryBar[]>>(new Map());
    const [isLoadingChildren, setIsLoadingChildren] = useState(false);
    const [processModeError, setProcessModeError] = useState<string | null>(null);
    const processModeRequestSeqRef = useRef(0);
    const statuses = useMemo(() => Object.values(buildStatusStyles()), []);

    const { rootProjectIdentifier, selectedProjectIdentifiers, setSelectedProjectIdentifiers } = useUiStore();
    const [isDateRangeDialogOpen, setIsDateRangeDialogOpen] = useState(false);
    const [displayStartDateIso, setDisplayStartDateIso] = useState<string | undefined>(undefined);
    const [displayEndDateIso, setDisplayEndDateIso] = useState<string | undefined>(undefined);
    const [pendingStartDate, setPendingStartDate] = useState('');
    const [pendingEndDate, setPendingEndDate] = useState('');
    const [dateRangeError, setDateRangeError] = useState<string | null>(null);
    const {
        chartScale,
        setChartScale,
        showAllDates,
        setShowAllDates,
        showTodayLine,
        setShowTodayLine,
        isProcessMode,
        setIsProcessMode,
        isProjectOpen,
        setIsProjectOpen,
        isVersionOpen,
        setIsVersionOpen,
        isSizeOpen,
        setIsSizeOpen,
        isLegendOpen,
        setIsLegendOpen,
        projectDropdownRef,
        versionDropdownRef,
        sizeDropdownRef,
        legendDropdownRef
    } = useProjectStatusReportControls();

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
        if (inlineReportDirty && !window.confirm(t('aiPanel.confirmDiscard'))) {
            return;
        }

        if (activeReportLaneKey === payload.laneKey) {
            reportRequestSeqRef.current += 1;
            setActiveReportLaneKey(null);
            setActiveReportContext(null);
            setInlineReportDirty(false);
            setAiLoading(false);
            setAiError(null);
            return;
        }

        const requestId = reportRequestSeqRef.current + 1;
        reportRequestSeqRef.current = requestId;

        setActiveReportLaneKey(payload.laneKey);
        setActiveReportContext({
            projectIdentifier: payload.projectIdentifier,
            versionId: payload.versionId
        });
        setInlineReportDirty(false);
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

    const handleInlineReportSave = async (sections: EditableSections): Promise<AiResponseView> => {
        if (!activeReportContext || !aiResponse || !aiResponse.destination_issue_id) {
            throw new Error(t('aiPanel.saveFailed'));
        }

        const result = await updateWeeklyAiResponse(rootProjectIdentifier || projectIdentifier, {
            selected_project_identifier: activeReportContext.projectIdentifier,
            version_id: activeReportContext.versionId,
            destination_issue_id: aiResponse.destination_issue_id,
            ...sections
        });

        setAiResponse(result.response);
        setInlineReportDirty(false);
        return result.response;
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

    return (
        <div ref={fullScreenRef} className="flex-1 bg-transparent font-sans text-[#222222]">
            <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 pb-6 pt-4 sm:px-6 lg:px-8">
                <ProjectStatusReportToolbar
                    availableProjects={availableProjects}
                    selectedProjectIdentifiers={selectedProjectIdentifiers}
                    selectableProjectIdentifiers={selectableProjectIdentifiers}
                    allSelectableProjectsSelected={allSelectableProjectsSelected}
                    onSetSelectedProjectIdentifiers={setSelectedProjectIdentifiers}
                    onToggleProject={toggleProject}
                    allVersions={allVersions}
                    selectedVersions={selectedVersions}
                    allVersionsSelected={allVersionsSelected}
                    onVersionChange={onVersionChange}
                    chartScale={chartScale}
                    onChartScaleChange={setChartScale}
                    showAllDates={showAllDates}
                    onShowAllDatesChange={setShowAllDates}
                    showTodayLine={showTodayLine}
                    onShowTodayLineChange={setShowTodayLine}
                    isProcessMode={isProcessMode}
                    isLoadingChildren={isLoadingChildren}
                    onProcessModeChange={setIsProcessMode}
                    statuses={statuses}
                    isProjectOpen={isProjectOpen}
                    onProjectOpenChange={setIsProjectOpen}
                    isVersionOpen={isVersionOpen}
                    onVersionOpenChange={setIsVersionOpen}
                    isSizeOpen={isSizeOpen}
                    onSizeOpenChange={setIsSizeOpen}
                    isLegendOpen={isLegendOpen}
                    onLegendOpenChange={setIsLegendOpen}
                    projectDropdownRef={projectDropdownRef}
                    versionDropdownRef={versionDropdownRef}
                    sizeDropdownRef={sizeDropdownRef}
                    legendDropdownRef={legendDropdownRef}
                    isDateRangeDialogOpen={isDateRangeDialogOpen}
                    isCustomDateRangeActive={isCustomDateRangeActive}
                    onOpenDateRangeDialog={openDateRangeDialog}
                    onCloseDateRangeDialog={() => setIsDateRangeDialogOpen(false)}
                    onClearDateRange={clearDateRange}
                    onApplyDateRange={applyDateRange}
                    pendingStartDate={pendingStartDate}
                    pendingEndDate={pendingEndDate}
                    onPendingStartDateChange={setPendingStartDate}
                    onPendingEndDateChange={setPendingEndDate}
                    dateRangeError={dateRangeError}
                    onToggleFullScreen={toggleFullScreen}
                />


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
                            if (inlineReportDirty && !window.confirm(t('aiPanel.confirmDiscard'))) {
                                return;
                            }
                            setActiveReportLaneKey(null);
                            setActiveReportContext(null);
                            setInlineReportDirty(false);
                            setAiLoading(false);
                            setAiError(null);
                        }}
                        activeReportLaneKey={activeReportLaneKey}
                        detailedReportResponse={aiResponse}
                        detailedReportLoading={aiLoading}
                        detailedReportError={aiError}
                        onDetailedReportSave={handleInlineReportSave}
                        onDetailedReportDirtyChange={setInlineReportDirty}
                    />
                </div>
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
