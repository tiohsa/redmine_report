import { useState, type DragEvent, type RefObject } from 'react';
import type { ProjectInfo } from '../../services/scheduleReportApi';
import { t } from '../../i18n';
import { reportStyles } from '../designSystem';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { SelectionList, SelectionRow, CheckboxRow } from '../ui/SelectionList';
import { FieldLabel } from '../ui/FieldLabel';
import type { StatusStyle } from './constants';
import { cn } from '../ui/cn';

type DropdownRef = RefObject<HTMLDivElement | null>;

type ProjectStatusReportToolbarProps = {
  availableProjects: ProjectInfo[];
  selectedProjectIdentifiers: string[];
  selectableProjectIdentifiers: string[];
  allSelectableProjectsSelected: boolean;
  onSetSelectedProjectIdentifiers: (identifiers: string[]) => void;
  onToggleProject: (identifier: string) => void;
  allVersions: string[];
  selectedVersions: string[];
  allVersionsSelected: boolean;
  onVersionChange?: (versions: string[]) => void;
  onVersionOrderChange?: (versions: string[]) => void;
  allowVersionOrderPersist?: boolean;
  chartScale: number;
  onChartScaleChange: (value: number) => void;
  showAllDates: boolean;
  onShowAllDatesChange: (value: boolean) => void;
  showTodayLine: boolean;
  onShowTodayLineChange: (value: boolean) => void;
  isProcessMode: boolean;
  isLoadingChildren: boolean;
  onProcessModeChange: (value: boolean) => void;
  statuses: StatusStyle[];
  isProjectOpen: boolean;
  onProjectOpenChange: (value: boolean) => void;
  isVersionOpen: boolean;
  onVersionOpenChange: (value: boolean) => void;
  isSizeOpen: boolean;
  onSizeOpenChange: (value: boolean) => void;
  isLegendOpen: boolean;
  onLegendOpenChange: (value: boolean) => void;
  projectDropdownRef: DropdownRef;
  versionDropdownRef: DropdownRef;
  sizeDropdownRef: DropdownRef;
  legendDropdownRef: DropdownRef;
  isDateRangeDialogOpen: boolean;
  isCustomDateRangeActive: boolean;
  onOpenDateRangeDialog: () => void;
  onCloseDateRangeDialog: () => void;
  onClearDateRange: () => void;
  onApplyDateRange: () => void;
  pendingStartDate: string;
  pendingEndDate: string;
  onPendingStartDateChange: (value: string) => void;
  onPendingEndDateChange: (value: string) => void;
  dateRangeError: string | null;
  onToggleFullScreen: () => void;
};

const sizeOptions = [
  { label: 'S', value: 0.5 },
  { label: 'M', value: 0.75 },
  { label: 'L', value: 1 },
  { label: 'XL', value: 1.5 },
] as const;

const dropdownRefProps = (ref: DropdownRef) => ({ ref: ref as RefObject<HTMLDivElement> });

export const ProjectStatusReportToolbar = ({
  availableProjects,
  selectedProjectIdentifiers,
  selectableProjectIdentifiers,
  allSelectableProjectsSelected,
  onSetSelectedProjectIdentifiers,
  onToggleProject,
  allVersions,
  selectedVersions,
  allVersionsSelected,
  onVersionChange,
  onVersionOrderChange,
  allowVersionOrderPersist = true,
  chartScale,
  onChartScaleChange,
  showAllDates,
  onShowAllDatesChange,
  showTodayLine,
  onShowTodayLineChange,
  isProcessMode,
  isLoadingChildren,
  onProcessModeChange,
  statuses,
  isProjectOpen,
  onProjectOpenChange,
  isVersionOpen,
  onVersionOpenChange,
  isSizeOpen,
  onSizeOpenChange,
  isLegendOpen,
  onLegendOpenChange,
  projectDropdownRef,
  versionDropdownRef,
  sizeDropdownRef,
  legendDropdownRef,
  isDateRangeDialogOpen,
  isCustomDateRangeActive,
  onOpenDateRangeDialog,
  onCloseDateRangeDialog,
  onClearDateRange,
  onApplyDateRange,
  pendingStartDate,
  pendingEndDate,
  onPendingStartDateChange,
  onPendingEndDateChange,
  dateRangeError,
  onToggleFullScreen,
}: ProjectStatusReportToolbarProps) => {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const filterDropdownPanelStyle = `${reportStyles.dropdownPanel} top-full left-0 mt-1.5 w-[280px] max-h-[320px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300`;
  const legendDropdownPanelStyle = `${reportStyles.dropdownPanel} top-full right-0 mt-1.5 w-[220px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300`;
  const sizeDropdownPanelStyle = `${reportStyles.dropdownPanel} top-full right-0 mt-1.5 w-[180px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300`;
  const filterDropdownTitleStyle = reportStyles.dropdownTitle;
  const filterDropdownRowStyle = reportStyles.dropdownRow;
  const filterDropdownDividerStyle = reportStyles.dropdownDivider;
  const filterDropdownClearLinkStyle = reportStyles.dropdownClear;
  const moveVersion = (fromIndex: number, toIndex: number, hasExplicitDropTarget = true) => {
    if (!onVersionOrderChange) return;
    if (!allowVersionOrderPersist && !hasExplicitDropTarget) return;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= allVersions.length || toIndex >= allVersions.length) return;

    const next = [...allVersions];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    onVersionOrderChange(next);
  };
  const parseDragIndex = (event: DragEvent) => {
    const raw = event.dataTransfer.getData('text/plain');
    const fromIndex = Number.parseInt(raw, 10);
    return Number.isNaN(fromIndex) ? null : fromIndex;
  };

  return (
    <>
      <div className={reportStyles.toolbar}>
        <div className={reportStyles.toolbarGroup}>
          <div className="relative" {...dropdownRefProps(projectDropdownRef)}>
            <Button
              onClick={() => onProjectOpenChange(!isProjectOpen)}
              variant={selectedProjectIdentifiers.length > 0 ? 'icon-active' : 'icon'}
              title={t('filter.project')}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              {selectedProjectIdentifiers.length > 0 ? <span className={reportStyles.stateDot} aria-hidden="true" /> : null}
            </Button>
            {isProjectOpen && (
              <div className={filterDropdownPanelStyle} onMouseDown={(e) => e.stopPropagation()}>
                <div className={filterDropdownTitleStyle}>{t('filter.project')}</div>
                <SelectionRow
                  className={filterDropdownRowStyle}
                  active={allSelectableProjectsSelected}
                  leading={<CheckboxRow checked={allSelectableProjectsSelected} />}
                  onClick={() => {
                    onSetSelectedProjectIdentifiers(
                      allSelectableProjectsSelected ? [] : selectableProjectIdentifiers
                    );
                  }}
                >
                  {t('filter.selectAll')}
                </SelectionRow>
                <div className={filterDropdownDividerStyle}></div>
                <SelectionList className="max-h-[280px] overflow-y-auto">
                  {availableProjects.map((project) => {
                    const isSelected = selectedProjectIdentifiers.includes(project.identifier);
                    const isDisabled = project.selectable === false;

                    return (
                      <SelectionRow
                        key={project.project_id}
                        className={filterDropdownRowStyle}
                        active={isSelected}
                        disabled={isDisabled}
                        indent={project.level * 12}
                        leading={<CheckboxRow checked={isSelected} disabled={isDisabled} />}
                        onClick={() => onToggleProject(project.identifier)}
                      >
                        {project.name}
                      </SelectionRow>
                    );
                  })}
                </SelectionList>
                <div className={filterDropdownDividerStyle}></div>
                <div className="px-4 py-2.5">
                  <span
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onSetSelectedProjectIdentifiers([]); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSetSelectedProjectIdentifiers([]);
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

          <div className="relative" {...dropdownRefProps(versionDropdownRef)}>
            <Button
              onClick={() => onVersionOpenChange(!isVersionOpen)}
              variant={selectedVersions.length > 0 ? 'icon-active' : 'icon'}
              title={t('filter.version')}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              {selectedVersions.length > 0 ? <span className={reportStyles.stateDot} aria-hidden="true" /> : null}
            </Button>
            {isVersionOpen && onVersionChange && (
              <div className={filterDropdownPanelStyle} onMouseDown={(e) => e.stopPropagation()}>
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
                <SelectionList
                  className="max-h-[280px] overflow-y-auto"
                  onDragOver={(event) => {
                    if (draggingIndex === null) return;
                    if (!allowVersionOrderPersist) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    if (draggingIndex === null) return;
                    if (!allowVersionOrderPersist) return;
                    event.preventDefault();
                    const fromIndex = parseDragIndex(event);
                    if (fromIndex !== null) {
                      moveVersion(fromIndex, allVersions.length - 1, false);
                    }
                    setDraggingIndex(null);
                    setDropTargetIndex(null);
                  }}
                >
                  {allVersions.map((version, index) => {
                    const isSelected = selectedVersions.includes(version);
                    const isDragging = draggingIndex === index;
                    const isDropTarget = dropTargetIndex === index && draggingIndex !== null && draggingIndex !== index;

                    return (
                      <div
                        key={version}
                        className={cn(
                          filterDropdownRowStyle,
                          'report-version-drag-row',
                          'relative',
                          isSelected && 'report-version-drag-row-active',
                          isDragging && 'report-version-drag-row-dragging'
                        )}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelected) {
                            onVersionChange(selectedVersions.filter((value) => value !== version));
                            return;
                          }
                          onVersionChange([...selectedVersions, version]);
                        }}
                        onDragOver={(event) => {
                          if (draggingIndex === null) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          setDropTargetIndex(index);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const fromIndex = parseDragIndex(event);
                          if (fromIndex !== null) {
                            moveVersion(fromIndex, index, true);
                          }
                          setDraggingIndex(null);
                          setDropTargetIndex(null);
                        }}
                      >
                        <button
                          type="button"
                          className="report-version-drag-handle"
                          draggable
                          title={t('filter.dragToReorder', { defaultValue: 'Drag to reorder' })}
                          aria-label={t('filter.dragVersionHandle', { defaultValue: `Reorder ${version}` })}
                          onMouseDown={(e) => e.stopPropagation()}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', String(index));
                            setDraggingIndex(index);
                            setDropTargetIndex(index);
                          }}
                          onDragEnd={() => {
                            setDraggingIndex(null);
                            setDropTargetIndex(null);
                          }}
                        >
                          <Icon name="kebab-vertical" className="h-3.5 w-3.5" />
                        </button>
                        <CheckboxRow checked={isSelected} />
                        <span className="min-w-0 flex-1 truncate">{version}</span>
                        {isDropTarget ? <span className="report-version-drop-indicator" aria-hidden="true" /> : null}
                      </div>
                    );
                  })}
                </SelectionList>
                <div className="px-4 py-1.5 text-[11px] text-[#6b7280]">
                  {allowVersionOrderPersist
                    ? t('filter.versionDragHelp', { defaultValue: 'Drag handles to reorder process rows.' })
                    : t('filter.versionDragHelpMultiProject', { defaultValue: 'When multiple projects are selected, drop on a specific row to apply reordering.' })}
                </div>
                <div className={filterDropdownDividerStyle}></div>
                <div className="px-4 py-2.5">
                  <span
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onVersionChange?.([]); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
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

        <div className={reportStyles.toolbarGroup}>
          <div className="relative" {...dropdownRefProps(legendDropdownRef)}>
            <Button
              onClick={() => onLegendOpenChange(!isLegendOpen)}
              onMouseEnter={() => onLegendOpenChange(true)}
              variant={isLegendOpen ? 'icon-active' : 'icon'}
              className={reportStyles.toolbarIconButton}
              title="Status Legend"
            >
              <Icon name="info" className="h-4 w-4" />
              {isLegendOpen ? <span className={reportStyles.stateDot} aria-hidden="true" /> : null}
            </Button>
            {isLegendOpen && (
              <div className={legendDropdownPanelStyle}>
                <div className={filterDropdownTitleStyle}>Status Legend</div>
                <SelectionList className="py-1">
                  {statuses.map((status) => (
                    <SelectionRow
                      key={status.label}
                      leading={
                        <div
                          className="h-2.5 w-2.5 rounded-full border shadow-sm"
                          style={{
                            backgroundColor: status.fill,
                            borderColor: status.stroke,
                          }}
                        />
                      }
                    >
                      <span className="text-[13px] font-medium">{status.label}</span>
                    </SelectionRow>
                  ))}
                </SelectionList>
              </div>
            )}
          </div>

          <div className={reportStyles.toolbarDivider}></div>

          <div className="relative" {...dropdownRefProps(sizeDropdownRef)}>
            <Button
              onClick={() => onSizeOpenChange(!isSizeOpen)}
              variant={isSizeOpen || chartScale !== 1 ? 'icon-active' : 'icon'}
              className={reportStyles.toolbarIconButton}
              title={t('filter.size')}
            >
              <Icon name="sliders" className="h-4 w-4" />
              {isSizeOpen || chartScale !== 1 ? <span className={reportStyles.stateDot} aria-hidden="true" /> : null}
            </Button>
            {isSizeOpen && (
              <div className={sizeDropdownPanelStyle} onMouseDown={(e) => e.stopPropagation()}>
                <div className={filterDropdownTitleStyle}>{t('filter.size')}</div>
                <SelectionList className="py-1">
                  {sizeOptions.map((option) => (
                    <SelectionRow
                      key={option.label}
                      active={chartScale === option.value}
                      leading={<CheckboxRow checked={chartScale === option.value} />}
                      onClick={() => onChartScaleChange(option.value)}
                    >
                      <span className={chartScale === option.value ? 'font-bold' : 'font-medium'}>
                        {option.label}
                      </span>
                    </SelectionRow>
                  ))}
                </SelectionList>
              </div>
            )}
          </div>

          <Button
            onClick={() => onProcessModeChange(!isProcessMode)}
            variant={isProcessMode || isLoadingChildren ? 'icon-active' : 'icon'}
            className={reportStyles.toolbarIconButton}
            title={t('filter.processMode', { defaultValue: 'Process Mode' })}
            aria-pressed={isProcessMode}
            aria-busy={isLoadingChildren || undefined}
          >
            <Icon name="process" className="h-4 w-4" />
            {isProcessMode || isLoadingChildren ? (
              <span
                className={cn(
                  reportStyles.stateDot,
                  isLoadingChildren ? reportStyles.stateDotLoading : undefined
                )}
                aria-hidden="true"
              />
            ) : null}
          </Button>

          <Button
            onClick={onOpenDateRangeDialog}
            variant={isDateRangeDialogOpen || isCustomDateRangeActive ? 'icon-active' : 'icon'}
            className={reportStyles.toolbarIconButton}
            title={t('filter.dateRange')}
            aria-haspopup="dialog"
            aria-expanded={isDateRangeDialogOpen}
          >
            <Icon name="calendar" className="h-4 w-4" />
            {isDateRangeDialogOpen || isCustomDateRangeActive ? <span className={reportStyles.stateDot} aria-hidden="true" /> : null}
          </Button>

          <Button
            onClick={() => onShowAllDatesChange(!showAllDates)}
            variant={showAllDates ? 'icon-active' : 'icon'}
            className={reportStyles.toolbarIconButton}
            title={t('filter.dateDisplay')}
            aria-pressed={showAllDates}
          >
            <Icon name="calendar" className="h-4 w-4" />
            {showAllDates ? <span className={reportStyles.stateDot} aria-hidden="true" /> : null}
          </Button>

          <Button
            onClick={() => onShowTodayLineChange(!showTodayLine)}
            variant={showTodayLine ? 'icon-active' : 'icon'}
            className={reportStyles.toolbarIconButton}
            title={t('timeline.todayLineToggle', { defaultValue: 'Today line' })}
            aria-pressed={showTodayLine}
          >
            <Icon name="today" className="h-4 w-4" />
            {showTodayLine ? <span className={reportStyles.stateDot} aria-hidden="true" /> : null}
          </Button>

          <div className={reportStyles.toolbarDivider}></div>

          <Button
            onClick={onToggleFullScreen}
            variant="icon"
            className={reportStyles.toolbarIconButton}
            title={t('report.fullscreen')}
          >
            <Icon name="fullscreen" className="h-4 w-4" />
          </Button>

          <Button
            variant="icon"
            className={reportStyles.toolbarIconButton}
            title={t('report.export')}
          >
            <Icon name="download" className="h-4 w-4" />
          </Button>
        </div>
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
                    onChange={(event) => onPendingStartDateChange(event.target.value)}
                    className="report-input mt-2"
                  />
                </FieldLabel>
                <FieldLabel className="block">
                  {t('weeklyDialog.endDate')}
                  <input
                    type="date"
                    value={pendingEndDate}
                    onChange={(event) => onPendingEndDateChange(event.target.value)}
                    className="report-input mt-2"
                  />
                </FieldLabel>
              </div>
              {dateRangeError && (
                <p className={`mt-3 ${reportStyles.alertError}`} role="alert">
                  {dateRangeError}
                </p>
              )}
              <div className="mt-8 flex items-center justify-end gap-3">
                <Button variant="secondary" onClick={onCloseDateRangeDialog}>
                  {t('common.cancel')}
                </Button>
                <Button variant="secondary" onClick={onClearDateRange}>
                  {t('filter.clearDateRange')}
                </Button>
                <Button onClick={onApplyDateRange}>
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
