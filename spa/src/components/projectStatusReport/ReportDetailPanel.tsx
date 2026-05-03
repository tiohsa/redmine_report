import { useEffect, useMemo, useState } from 'react';
import { t } from '../../i18n';
import type { ReportPreset } from '../../services/reportPresetStorage';
import { reportStyles } from '../designSystem';
import { Button } from '../ui/Button';
import { BindReportDetailIssueDialog } from './BindReportDetailIssueDialog';

type ReportDetailPanelProps = {
  rootProjectIdentifier: string;
  rootProjectId: number;
  activePreset: ReportPreset;
  onPresetChange: (preset: ReportPreset) => void;
  onDirtyStateChange?: (dirty: boolean) => void;
};

const defaultBody = `## Highlights This Week

## Next Week Actions

## Risks / Decisions
`;

const detailContentKey = (rootProjectIdentifier: string, presetId: string) =>
  `redmine_report.reportPresetDetail.${rootProjectIdentifier}.${presetId}`;

export function ReportDetailPanel({
  rootProjectIdentifier,
  rootProjectId,
  activePreset,
  onPresetChange,
  onDirtyStateChange
}: ReportDetailPanelProps) {
  const [body, setBody] = useState(defaultBody);
  const [savedBody, setSavedBody] = useState(defaultBody);
  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  const isBound = Boolean(activePreset.detailReportIssueId && activePreset.detailReportIssueStatus === 'VALID');
  const dirty = body !== savedBody;

  useEffect(() => {
    const saved = localStorage.getItem(detailContentKey(rootProjectIdentifier, activePreset.id)) || defaultBody;
    setBody(saved);
    setSavedBody(saved);
    onDirtyStateChange?.(false);
  }, [activePreset.id, rootProjectIdentifier, onDirtyStateChange]);

  useEffect(() => {
    onDirtyStateChange?.(dirty);
  }, [dirty, onDirtyStateChange]);

  const markdownToSave = useMemo(() => {
    const scope = activePreset.targets
      .map((target) => `- ${target.projectName} / ${target.versionName}`)
      .join('\n');
    return `[ReportPreset][${activePreset.id}] name="${activePreset.name}" generated_at=${new Date().toISOString()}

## Scope

${scope}

${body}`;
  }, [activePreset, body]);

  const save = () => {
    localStorage.setItem(detailContentKey(rootProjectIdentifier, activePreset.id), body);
    setSavedBody(body);
    onDirtyStateChange?.(false);
  };

  return (
    <section className={`${reportStyles.surfaceElevated} mt-4 flex min-h-0 flex-col overflow-hidden`} data-testid="report-detail-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f2f3f5] px-4 py-4">
        <div>
          <h2 className={reportStyles.sectionHeading}>
            {t('reportDetail.title', { name: activePreset.name })}
          </h2>
          <p className="text-[13px] font-sans text-[#45515e]">
            {t('reportDetail.scopeCount', { count: activePreset.targets.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activePreset.detailReportIssueId ? (
            <a
              href={`/issues/${activePreset.detailReportIssueId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-[8px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold text-[#17437d]"
            >
              {t('reportDetail.issueLabel', { id: activePreset.detailReportIssueId })}
            </a>
          ) : (
            <span className="rounded-[8px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold text-[#45515e]">
              {t('reportDetail.unbound')}
            </span>
          )}
          <Button variant="pill-secondary" size="sm" className="h-8 px-3 text-[12px]" onClick={() => setBindDialogOpen(true)}>
            {t('reportDetail.bindIssue')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[8px] border border-[#e5e7eb] bg-white p-3">
          <div className="text-[13px] font-semibold text-[#222222]">{t('reportDetail.scope')}</div>
          <ul className="mt-3 space-y-2">
            {activePreset.targets.map((target) => (
              <li key={`${target.projectId}:${target.versionId}`} className="text-[13px] leading-5 text-[#45515e]">
                {target.projectName} / {target.versionName}
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0">
          {!isBound ? (
            <div className={`${reportStyles.emptyState} mb-4`} data-testid="report-detail-unbound">
              <p className="text-[14px] font-medium text-[#45515e]">{t('reportDetail.saveRequiresIssue')}</p>
            </div>
          ) : null}

          <textarea
            className="min-h-[260px] w-full rounded-[8px] border border-[#e5e7eb] bg-white p-3 font-mono text-[13px] leading-6 text-[#222222]"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-label={t('reportDetail.editor')}
          />

          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] font-medium text-[#45515e]">{t('reportDetail.savedMarkdownPreview')}</summary>
            <pre className="mt-2 max-h-[180px] overflow-auto rounded-[8px] bg-[#f0f0f0] p-3 text-[11px] text-[#45515e]">{markdownToSave}</pre>
          </details>

          <div className="mt-4 flex justify-end">
            <Button onClick={save} disabled={!isBound || !dirty}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </div>

      {bindDialogOpen ? (
        <BindReportDetailIssueDialog
          rootProjectIdentifier={rootProjectIdentifier}
          rootProjectId={rootProjectId}
          activePreset={activePreset}
          onBind={onPresetChange}
          onClose={() => setBindDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}

