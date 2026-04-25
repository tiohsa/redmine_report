import React from 'react';
import { t } from '../../../i18n';
import { type TableDensity } from './shared';

export type DrilldownCrumb = {
  issueId: number;
  title?: string;
};

type TaskDetailsHeaderProps = {
  title: string;
  drilldownPath: DrilldownCrumb[];
  density: TableDensity;
  densityMenuOpen: boolean;
  issueCount: number;
  onDensityMenuToggle: () => void;
  onDensityMenuClose: () => void;
  onDensityChange: (density: TableDensity) => void;
  onBreadcrumbClick: (index: number) => void;
  onReload: () => void;
  onClose: () => void;
};

const REDMINE_DIALOG_ICON_ACTION_CLASS = 'inline-flex items-center justify-center h-9 w-9 rounded-[8px] border border-gray-200 bg-white text-[#222222] hover:bg-gray-50 transition-all duration-300 cursor-pointer';

export function TaskDetailsHeader({
  title,
  drilldownPath,
  density,
  densityMenuOpen,
  issueCount,
  onDensityMenuToggle,
  onDensityMenuClose,
  onDensityChange,
  onBreadcrumbClick,
  onReload,
  onClose
}: TaskDetailsHeaderProps) {
  return (
    <div className="px-5 py-2.5 flex items-center justify-between gap-2.5 bg-white relative z-40 border-b border-gray-200 flex-shrink-0 min-h-10 box-border">
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
            onClick={onDensityMenuToggle}
            title={t('timeline.tableDensity', { defaultValue: 'Table Density' })}
            className={`${REDMINE_DIALOG_ICON_ACTION_CLASS} ml-1`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>
          {densityMenuOpen && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={onDensityMenuClose} />
              <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl shadow-brand-glow border border-gray-100 z-[70] overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                {(['compact', 'standard', 'relaxed'] as TableDensity[]).map((d) => (
                  <button
                    key={d}
                    className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-slate-50 flex items-center gap-3 ${density === d ? 'text-blue-600 bg-blue-50/50' : 'text-slate-700'}`}
                    onClick={() => onDensityChange(d)}
                  >
                    <div className="flex-shrink-0 w-5 flex justify-center text-slate-400">
                      {d === 'compact' && (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="4" y="8" width="16" height="2" rx="0.5" />
                          <rect x="4" y="11" width="16" height="2" rx="0.5" />
                          <rect x="4" y="14" width="16" height="2" rx="0.5" />
                        </svg>
                      )}
                      {d === 'standard' && (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="4" y="7" width="16" height="2" rx="0.5" />
                          <rect x="4" y="11" width="16" height="2" rx="0.5" />
                          <rect x="4" y="15" width="16" height="2" rx="0.5" />
                        </svg>
                      )}
                      {d === 'relaxed' && (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="4" y="5" width="16" height="2" rx="0.5" />
                          <rect x="4" y="11" width="16" height="2" rx="0.5" />
                          <rect x="4" y="17" width="16" height="2" rx="0.5" />
                        </svg>
                      )}
                    </div>
                    <span className="flex-1">
                      {t(`timeline.density${d.charAt(0).toUpperCase() + d.slice(1)}`, { defaultValue: d.charAt(0).toUpperCase() + d.slice(1) })}
                    </span>
                    {density === d && (
                      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          onClick={onReload}
          title={t('timeline.reloadTasks')}
          className={`${REDMINE_DIALOG_ICON_ACTION_CLASS} ml-1`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500 shrink min-w-0">
        <div className="text-[12px] text-slate-700 font-semibold whitespace-nowrap">
          {t('timeline.totalTasks', { count: issueCount })}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
          <div className="w-2.5 h-2.5 bg-blue-400 rounded-sm"></div>
          {t('timeline.legendWip')}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
          <div className="w-2.5 h-2.5 bg-emerald-400 rounded-sm"></div>
          {t('timeline.legendDone')}
        </div>
      </div>

      <button
        aria-label={t('timeline.closeDialogAria')}
        className={REDMINE_DIALOG_ICON_ACTION_CLASS}
        onClick={onClose}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
