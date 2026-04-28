import React from 'react';
import { t } from '../../../i18n';
import { type TableDensity } from './shared';
import { SelectionList, SelectionRow, CheckboxRow } from '../../ui/SelectionList';
import { reportCompactIconActionActiveStyle, reportCompactIconActionStyle, reportStyles } from '../../designSystem';
import { useUiStore } from '../../../stores/uiStore';
import { cn } from '../../ui/cn';

export type DrilldownCrumb = {
  issueId: number;
  title?: string;
};

type TaskDetailsHeaderProps = {
  title: string;
  drilldownPath: DrilldownCrumb[];
  density: TableDensity;
  issueCount: number;
  onDensityChange: (density: TableDensity) => void;
  onBreadcrumbClick: (index: number) => void;
  onReload: () => void;
  onClose: () => void;
};

const REDMINE_DIALOG_ICON_ACTION_CLASS = reportStyles.iconButtonMuted;
const REDMINE_DIALOG_ICON_ACTION_ACTIVE_CLASS = reportStyles.iconButtonActive;

export function TaskDetailsHeader({
  title,
  drilldownPath,
  density,
  issueCount,
  onDensityChange,
  onBreadcrumbClick,
  onReload,
  onClose
}: TaskDetailsHeaderProps) {
  const {
    isDensityMenuOpen,
    setIsDensityMenuOpen,
    isDetailLegendOpen,
    setIsDetailLegendOpen
  } = useUiStore();

  const filterDropdownPanelStyle = `${reportStyles.dropdownPanel} top-full right-0 mt-2 w-48 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 z-50`;
  const filterDropdownTitleStyle = reportStyles.dropdownTitle;

  const legendStatuses = [
    { label: t('timeline.legendWip'), fill: '#60a5fa', stroke: '#2563eb' },
    { label: t('timeline.legendDone'), fill: '#34d399', stroke: '#059669' }
  ];

  return (
    <div className="px-3 py-0.5 flex items-center justify-between gap-2.5 bg-white relative z-40 border-b border-[rgba(0,0,0,0.06)] flex-shrink-0 min-h-10 box-border">
      <div className="flex flex-row items-center gap-2.5 min-w-0">
        <div className="min-w-0">
          {drilldownPath.length > 1 && (
            <nav
              className="mb-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[11px] font-medium font-sans text-[#8e8e93]"
              aria-label={t('timeline.breadcrumbAria', { defaultValue: 'Issue hierarchy' })}
              data-testid="task-details-breadcrumb"
            >
              {drilldownPath.map((crumb, index) => {
                const crumbLabel = crumb.title ? `${crumb.title} #${crumb.issueId}` : `#${crumb.issueId}`;
                const isCurrent = index === drilldownPath.length - 1;
                return (
                  <React.Fragment key={`${crumb.issueId}-${index}`}>
                    {index > 0 && <span className="text-slate-300">/</span>}
                    {isCurrent ? (
                      <span className="truncate text-slate-500">{crumbLabel}</span>
                    ) : (
                      <button
                        type="button"
                        className="truncate cursor-pointer text-slate-500 hover:text-slate-900"
                        onClick={() => onBreadcrumbClick(index)}
                      >
                        {crumbLabel}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          )}
          <h3 className="text-[24px] leading-none font-display font-semibold text-[var(--color-text-00)] flex items-center gap-2 min-w-0" data-testid="task-details-title">
            <span className="truncate">{title}</span>
          </h3>
        </div>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setIsDensityMenuOpen(!isDensityMenuOpen); }}
            title={t('timeline.tableDensity', { defaultValue: 'Table Density' })}
            className={cn(
              isDensityMenuOpen ? REDMINE_DIALOG_ICON_ACTION_ACTIVE_CLASS : REDMINE_DIALOG_ICON_ACTION_CLASS,
              'ml-1'
            )}
            style={isDensityMenuOpen ? reportCompactIconActionActiveStyle : reportCompactIconActionStyle}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
            {isDensityMenuOpen ? <span className={reportStyles.stateDot} aria-hidden="true" /> : null}
          </button>
          {isDensityMenuOpen && (
            <div className={filterDropdownPanelStyle} onMouseDown={(e) => e.stopPropagation()}>
              <div className={filterDropdownTitleStyle}>{t('timeline.tableDensity', { defaultValue: 'Table Density' })}</div>
              <SelectionList className="py-1">
                {(['compact', 'standard', 'relaxed'] as TableDensity[]).map((d) => (
                  <SelectionRow
                    key={d}
                    active={density === d}
                    leading={<CheckboxRow checked={density === d} />}
                    onClick={() => onDensityChange(d)}
                  >
                    <span>
                      {t(`timeline.density${d.charAt(0).toUpperCase() + d.slice(1)}`, { defaultValue: d.charAt(0).toUpperCase() + d.slice(1) })}
                    </span>
                  </SelectionRow>
                ))}
              </SelectionList>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setIsDetailLegendOpen(!isDetailLegendOpen); }}
            title="Status Legend"
            className={cn(
              isDetailLegendOpen ? REDMINE_DIALOG_ICON_ACTION_ACTIVE_CLASS : REDMINE_DIALOG_ICON_ACTION_CLASS,
              'ml-1'
            )}
            style={isDetailLegendOpen ? reportCompactIconActionActiveStyle : reportCompactIconActionStyle}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            {isDetailLegendOpen ? <span className={reportStyles.stateDot} aria-hidden="true" /> : null}
          </button>
          {isDetailLegendOpen && (
            <div className={cn(filterDropdownPanelStyle, 'w-48')} onMouseDown={(e) => e.stopPropagation()}>
              <div className={filterDropdownTitleStyle}>Status Legend</div>
              <SelectionList className="py-1">
                {legendStatuses.map((status) => (
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

        <button
          onClick={onReload}
          title={t('timeline.reloadTasks')}
          className={`${REDMINE_DIALOG_ICON_ACTION_CLASS} ml-1`}
          style={reportCompactIconActionStyle}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-3 text-[12px] font-semibold text-slate-500 shrink min-w-0">
        <div className="text-slate-700 font-semibold whitespace-nowrap">
          {t('timeline.totalTasks', { count: issueCount })}
        </div>
      </div>

      <button
        aria-label={t('timeline.closeDialogAria')}
        className={REDMINE_DIALOG_ICON_ACTION_CLASS}
        onClick={onClose}
        style={reportCompactIconActionStyle}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
