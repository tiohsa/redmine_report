import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fetchChildIssues, CategoryBar, ProjectInfo } from '../services/scheduleReportApi';
import { buildStatusStyles } from './projectStatusReport/constants';
import { buildTimelineViewModel } from './projectStatusReport/timeline';
import { TimelineChart } from './projectStatusReport/TimelineChart';
import { ProjectStatusReportToolbar } from './projectStatusReport/ProjectStatusReportToolbar';
import { ReportDetailPanel } from './projectStatusReport/ReportDetailPanel';
import { useProjectStatusReportControls } from './projectStatusReport/useProjectStatusReportControls';
import { useUiStore } from '../stores/uiStore';
import { VersionAiDialog } from './projectStatusReport/VersionAiDialog';
import { t } from '../i18n';
import { reportPresetStorage, sanitizeReportPresetTargets, type ReportPreset } from '../services/reportPresetStorage';
import { buildReportPresetTargets, filterBarsByReportPreset } from './projectStatusReport/reportPresetTargets';
import { SaveReportPresetDialog } from './projectStatusReport/SaveReportPresetDialog';

interface ProjectStatusReportProps {
    bars?: CategoryBar[];
    projectIdentifier: string;
    availableProjects?: ProjectInfo[];
    selectedVersions?: string[];
    onVersionChange?: (versions: string[]) => void;
    orderedVersions?: string[];
    onVersionOrderChange?: (versions: string[]) => void;
    onTaskDatesUpdated?: () => void;
    fetchError?: string | null;
}

const uniqueStrings = (values: string[]): string[] => {
    const seen = new Set<string>();
    return values.filter((value) => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
    });
};

export const ProjectStatusReport = ({
    bars = [],
    projectIdentifier,
    availableProjects = [],
    selectedVersions = [],
    onVersionChange,
    orderedVersions = [],
    onVersionOrderChange,
    onTaskDatesUpdated,
    fetchError = null
}: ProjectStatusReportProps) => {
    const [detailReportVisible, setDetailReportVisible] = useState(false);
    const [detailReportDirty, setDetailReportDirty] = useState(false);
    const [reportPresets, setReportPresets] = useState<ReportPreset[]>([]);
    const [activeReportPresetId, setActiveReportPresetId] = useState<string | null>(null);
    const [isSavePresetDialogOpen, setIsSavePresetDialogOpen] = useState(false);
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
        showTitles,
        setShowTitles,

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
    const reportPresetRootKey = rootProjectIdentifier || projectIdentifier;

    useEffect(() => {
        const settings = reportPresetStorage.load(reportPresetRootKey);
        setReportPresets(settings.presets);
        setActiveReportPresetId(settings.activePresetId || null);
        setDetailReportVisible(false);
        setDetailReportDirty(false);
    }, [reportPresetRootKey]);

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
                const newWidth = Math.floor(entry.contentRect.width);
                setContainerWidth((current) => {
                    if (Math.abs(current - newWidth) > 1.5) {
                        return newWidth;
                    }
                    return current;
                });
            }
        });

        observer.observe(containerRef.current);
        setContainerWidth(Math.floor(containerRef.current.clientWidth));

        return () => observer.disconnect();
    }, []);

    const projectMap = useMemo(() => {
        const map = new Map<number, ProjectInfo>();
        availableProjects.forEach((project) => map.set(project.project_id, project));
        return map;
    }, [availableProjects]);

    const activeReportPreset = useMemo(
        () => reportPresets.find((preset) => preset.id === activeReportPresetId) || null,
        [reportPresets, activeReportPresetId]
    );

    const barsForTimeline = useMemo(
        () => filterBarsByReportPreset(bars, activeReportPreset),
        [bars, activeReportPreset]
    );

    const { timelineData, timelineWidth, headerMonths, headerYears, todayX, axisStartDateIso, axisEndDateIso, pixelsPerDay } = useMemo(
        () =>
            buildTimelineViewModel({
                bars: barsForTimeline,
                selectedVersions,
                versionOrder: orderedVersions,
                projectMap,
                containerWidth,
                displayStartDateIso,
                displayEndDateIso,
                isProcessMode,
                childTicketsMap
            }),
        [barsForTimeline, selectedVersions, orderedVersions, projectMap, containerWidth, displayStartDateIso, displayEndDateIso, isProcessMode, childTicketsMap]
    );

    const allVersions = useMemo(() => {
        const versions = new Set<string>();
        barsForTimeline.forEach(bar => {
            versions.add(bar.version_name || t('common.noVersion'));
        });
        return Array.from(versions).sort();
    }, [barsForTimeline]);

    const displayVersions = useMemo(() => {
        if (orderedVersions.length === 0) return allVersions;
        const allVersionSet = new Set(allVersions);
        const existing = orderedVersions.filter((version) => allVersionSet.has(version));
        const existingSet = new Set(existing);
        const appended = allVersions.filter((version) => !existingSet.has(version));
        return [...existing, ...appended];
    }, [allVersions, orderedVersions]);

    const selectableProjectIdentifiers = useMemo(
        () => availableProjects.filter((p) => p.selectable !== false).map((p) => p.identifier),
        [availableProjects]
    );

    const allSelectableProjectsSelected = selectableProjectIdentifiers.length > 0
        && selectableProjectIdentifiers.every((id) => selectedProjectIdentifiers.includes(id));

    const allVersionsSelected = displayVersions.length > 0 && selectedVersions.length === displayVersions.length;

    const allowVersionOrderPersist = selectedProjectIdentifiers.length <= 1;

    const isCustomDateRangeActive = Boolean(displayStartDateIso && displayEndDateIso);

    const selectedProjectBarsForPresetSave = useMemo(() => {
        const selectableProjectIds = new Set(
            availableProjects
                .filter((project) => project.selectable !== false)
                .map((project) => project.project_id)
        );
        const selectedProjectIdentifierSet = new Set(selectedProjectIdentifiers);
        const selectedVersionSet = new Set(selectedVersions);

        return bars.filter((bar) => {
            if (!bar.version_id) return false;

            if (selectedProjectIdentifiers.length === 0) {
                if (!selectableProjectIds.has(bar.project_id)) return false;
            } else {
                const project = projectMap.get(bar.project_id);
                if (!project || !selectedProjectIdentifierSet.has(project.identifier)) return false;
            }

            if (selectedVersions.length > 0) {
                const versionName = bar.version_name || t('common.noVersion');
                if (!selectedVersionSet.has(versionName)) return false;
            }

            return true;
        });
    }, [availableProjects, bars, projectMap, selectedProjectIdentifiers, selectedVersions]);

    const currentPresetTargets = useMemo(
        () => buildReportPresetTargets(selectedProjectBarsForPresetSave, availableProjects),
        [availableProjects, selectedProjectBarsForPresetSave]
    );

    const rootProjectId = useMemo(() => {
        const rootProject = availableProjects.find((project) => project.identifier === reportPresetRootKey);
        return rootProject?.project_id || availableProjects[0]?.project_id || 0;
    }, [availableProjects, reportPresetRootKey]);

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

    const persistPresetChange = useCallback((preset: ReportPreset) => {
        const updated = reportPresetStorage.update(reportPresetRootKey, preset);
        setReportPresets(reportPresetStorage.list(reportPresetRootKey));
        setActiveReportPresetId(updated.id);
        reportPresetStorage.setActivePresetId(reportPresetRootKey, updated.id);
    }, [reportPresetRootKey]);

    const handleActiveReportPresetChange = useCallback((presetId: string | null) => {
        if (detailReportDirty && !window.confirm(t('reportDetail.unsavedChangesConfirm'))) {
            return;
        }
        const preset = presetId ? reportPresets.find((candidate) => candidate.id === presetId) || null : null;

        if (preset) {
            setSelectedProjectIdentifiers(uniqueStrings(preset.targets.map((target) => target.projectIdentifier)));
            onVersionChange?.(uniqueStrings(preset.targets.map((target) => target.versionName)));
        }

        setActiveReportPresetId(presetId);
        reportPresetStorage.setActivePresetId(reportPresetRootKey, presetId);
        setDetailReportVisible(false);
        setDetailReportDirty(false);
    }, [detailReportDirty, onVersionChange, reportPresetRootKey, reportPresets, setSelectedProjectIdentifiers]);

    const handleSaveReportPreset = useCallback((name: string) => {
        const preset = reportPresetStorage.create(reportPresetRootKey, {
            name,
            targets: currentPresetTargets
        });
        setReportPresets(reportPresetStorage.list(reportPresetRootKey));
        setActiveReportPresetId(preset.id);
        reportPresetStorage.setActivePresetId(reportPresetRootKey, preset.id);
        setIsSavePresetDialogOpen(false);
    }, [currentPresetTargets, reportPresetRootKey]);

    const updateActivePresetTargets = useCallback(() => {
        if (!activeReportPreset) return;
        const nextTargets = sanitizeReportPresetTargets(currentPresetTargets);
        if (nextTargets.length === 0) return;
        persistPresetChange({
            ...activeReportPreset,
            targets: nextTargets
        });
    }, [activeReportPreset, currentPresetTargets, persistPresetChange]);

    const setDetailReportVisibleSafely = useCallback((visible: boolean) => {
        if (!visible && detailReportDirty && !window.confirm(t('detailReport.unsavedChangesConfirm'))) {
            return;
        }

        setDetailReportVisible(visible);

        if (!visible) {
            setDetailReportDirty(false);
        }
    }, [detailReportDirty]);

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
            <div className="mx-auto flex w-full max-w-full flex-col gap-1 p-0">
                
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

                <div className="report-surface flex flex-col overflow-hidden">
                    <ProjectStatusReportToolbar
                        availableProjects={availableProjects}
                        selectedProjectIdentifiers={selectedProjectIdentifiers}
                        selectableProjectIdentifiers={selectableProjectIdentifiers}
                        allSelectableProjectsSelected={allSelectableProjectsSelected}
                        onSetSelectedProjectIdentifiers={setSelectedProjectIdentifiers}
                        onToggleProject={toggleProject}
                        allVersions={displayVersions}
                        selectedVersions={selectedVersions}
                        allVersionsSelected={allVersionsSelected}
                        onVersionChange={onVersionChange}
                        onVersionOrderChange={onVersionOrderChange}
                        allowVersionOrderPersist={allowVersionOrderPersist}
                        chartScale={chartScale}
                        onChartScaleChange={setChartScale}
                        showAllDates={showAllDates}
                        onShowAllDatesChange={setShowAllDates}
                        showTodayLine={showTodayLine}
                        onShowTodayLineChange={setShowTodayLine}
                        showTitles={showTitles}
                        onShowTitlesChange={setShowTitles}

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
                        reportPresets={reportPresets}
                        activeReportPresetId={activeReportPresetId}
                        activeReportPreset={activeReportPreset}
                        onActiveReportPresetChange={handleActiveReportPresetChange}
                        onSaveCurrentView={() => setIsSavePresetDialogOpen(true)}
                        onUpdatePresetTargets={updateActivePresetTargets}
                        canSaveCurrentView={currentPresetTargets.length > 0}
                        canUpdatePresetTargets={Boolean(activeReportPreset && currentPresetTargets.length > 0)}
                        detailReportVisible={detailReportVisible}
                        onDetailReportVisibleChange={setDetailReportVisibleSafely}
                        onToggleFullScreen={toggleFullScreen}
                    />

                    <div className="h-px w-full bg-[var(--color-border-light)]" />

                    <div className="flex-1 min-h-0 overflow-hidden">
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
                            showTitles={showTitles}
                            onTaskDatesUpdated={onTaskDatesUpdated}
                        />
                    </div>

                    {detailReportVisible && activeReportPreset ? (
                        <ReportDetailPanel
                            rootProjectIdentifier={reportPresetRootKey}
                            rootProjectId={rootProjectId}
                            activePreset={activeReportPreset}
                            onPresetChange={persistPresetChange}
                            onDirtyStateChange={setDetailReportDirty}
                        />
                    ) : null}
                </div>
                <VersionAiDialog
                    open={weeklyDialog.open}
                    projectIdentifier={projectIdentifier}
                    projectId={weeklyDialog.projectId}
                    versionId={weeklyDialog.versionId}
                    versionName={weeklyDialog.versionName}
                    onClose={() => setWeeklyDialog((prev) => ({ ...prev, open: false }))}
                />
                {isSavePresetDialogOpen ? (
                    <SaveReportPresetDialog
                        targets={currentPresetTargets}
                        existingNames={reportPresets.map((preset) => preset.name)}
                        onSave={handleSaveReportPreset}
                        onClose={() => setIsSavePresetDialogOpen(false)}
                    />
                ) : null}
            </div>
        </div>
    );
};
