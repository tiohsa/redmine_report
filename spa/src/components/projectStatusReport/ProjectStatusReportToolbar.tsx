import type { RefObject } from 'react';
import type { ProjectInfo } from '../../services/scheduleReportApi';
import { t } from '../../i18n';
import { reportStyles } from '../designSystem';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { SelectionList, SelectionRow, CheckboxRow } from '../ui/SelectionList';
import { FieldLabel } from '../ui/FieldLabel';
import type { StatusStyle } from './constants';

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
  const filterDropdownPanelStyle = `${reportStyles.dropdownPanel} top-full left-0 mt-3 w-72 max-h-[420px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300`;
  const filterDropdownTitleStyle = reportStyles.dropdownTitle;
  const filterDropdownRowStyle = reportStyles.dropdownRow;
  const filterDropdownDividerStyle = reportStyles.dropdownDivider;
  const filterDropdownClearLinkStyle = reportStyles.dropdownClear;

  return (
    <>
      <div className="report-surface flex items-center justify-between gap-4 px-5 py-4 shadow-none">
        <div className="flex items-center gap-2">
          <div className="relative" {...dropdownRefProps(projectDropdownRef)}>
            <Button
              onClick={() => onProjectOpenChange(!isProjectOpen)}
              variant={selectedProjectIdentifiers.length > 0 ? 'icon-active' : 'icon'}
              className="h-9 w-9"
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
                    onClick={() => onSetSelectedProjectIdentifiers([])}
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
              className="h-9 w-9"
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
                  {allVersions.map((version) => {
                    const isSelected = selectedVersions.includes(version);

                    return (
                      <SelectionRow
                        key={version}
                        className={filterDropdownRowStyle}
                        active={isSelected}
                        leading={<CheckboxRow checked={isSelected} />}
                        onClick={() => {
                          if (isSelected) {
                            onVersionChange(selectedVersions.filter((value) => value !== version));
                            return;
                          }

                          onVersionChange([...selectedVersions, version]);
                        }}
                      >
                        {version}
                      </SelectionRow>
                    );
                  })}
                </SelectionList>
                <div className={filterDropdownDividerStyle}></div>
                <div className="px-4 py-2.5">
                  <span
                    onClick={() => onVersionChange([])}
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

        <div className="flex items-center gap-2">
          <div className="relative" {...dropdownRefProps(legendDropdownRef)}>
            <Button
              onClick={() => onLegendOpenChange(!isLegendOpen)}
              onMouseEnter={() => onLegendOpenChange(true)}
              variant="icon"
              className="h-9 w-9"
              title="Status Legend"
            >
              <Icon name="info" className="h-5 w-5" />
            </Button>
            {isLegendOpen && (
              <div className="report-dropdown-panel right-0 top-full mt-2 w-48 p-4 animate-in fade-in zoom-in duration-200">
                <div className="flex flex-col gap-2">
                  {statuses.map((status) => (
                    <div key={status.label} className="flex items-center gap-3 text-[#222222] font-sans">
                      <div
                        className="h-3.5 w-3.5 rounded-full border shadow-sm"
                        style={{
                          backgroundColor: status.fill,
                          borderColor: status.stroke,
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

          <div className="relative" {...dropdownRefProps(sizeDropdownRef)}>
            <Button
              onClick={() => onSizeOpenChange(!isSizeOpen)}
              variant="icon"
              className="h-9 w-9"
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
            variant={isProcessMode ? 'icon-active' : 'icon'}
            className="h-9 w-9"
            title={t('filter.processMode', { defaultValue: 'Process Mode' })}
            aria-pressed={isProcessMode}
          >
            <Icon name="process" className="h-5 w-5" />
            <span
              className={`absolute -bottom-1 -right-1 rounded-full border px-1.5 py-0.5 text-[8px] font-bold leading-none shadow-sm transition-all ${
                isProcessMode || showAllDates || showTodayLine
                  ? 'border-[var(--color-brand-6)] bg-[var(--color-brand-6)] text-white'
                  : 'border-gray-200 bg-white text-[#8e8e93]'
              }`}
            >
              {isLoadingChildren ? '...' : isProcessMode ? 'ON' : 'OFF'}
            </span>
          </Button>

          <Button
            onClick={onOpenDateRangeDialog}
            variant={isCustomDateRangeActive ? 'icon-active' : 'icon'}
            className="h-9 w-9"
            title={t('filter.dateRange')}
            aria-haspopup="dialog"
            aria-expanded={isDateRangeDialogOpen}
          >
            <Icon name="calendar" className="h-5 w-5" />
            {isCustomDateRangeActive && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-white bg-blue-500"></span>
            )}
          </Button>

          <Button
            onClick={() => onShowAllDatesChange(!showAllDates)}
            variant={showAllDates ? 'icon-active' : 'icon'}
            className="h-9 w-9"
            title={t('filter.dateDisplay')}
            aria-pressed={showAllDates}
          >
            <Icon name="calendar" className="h-5 w-5" />
            <span
              className={`absolute -bottom-1 -right-1 rounded border px-1 text-[9px] font-bold ${
                showAllDates
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {showAllDates ? 'ON' : 'OFF'}
            </span>
          </Button>

          <Button
            onClick={() => onShowTodayLineChange(!showTodayLine)}
            variant={showTodayLine ? 'icon-active' : 'icon'}
            className="h-9 w-9"
            title={t('timeline.todayLineToggle', { defaultValue: 'Today line' })}
            aria-pressed={showTodayLine}
          >
            <Icon name="today" className="h-5 w-5" />
            <span
              className={`absolute -bottom-1 -right-1 rounded border px-1 text-[9px] font-bold ${
                showTodayLine
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {showTodayLine ? 'ON' : 'OFF'}
            </span>
          </Button>

          <div className="mx-1 h-6 w-px bg-slate-200"></div>

          <Button
            onClick={onToggleFullScreen}
            variant="icon"
            className="h-9 w-9"
            title={t('report.fullscreen')}
          >
            <Icon name="fullscreen" className="h-5 w-5" />
          </Button>

          <Button
            variant="icon"
            className="h-9 w-9"
            title={t('report.export')}
          >
            <Icon name="download" className="h-5 w-5" />
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
                <p className="mt-3 text-sm font-semibold text-red-600" role="alert">
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
