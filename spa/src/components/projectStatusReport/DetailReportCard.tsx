import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { AiResponsePanel, type EditableSections } from '../AiResponsePanel';
import { t } from '../../i18n';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { reportStyles } from '../designSystem';
import {
  fetchWeeklyAiResponses,
  updateWeeklyAiResponse,
  WeeklyApiError
} from '../../services/scheduleReportApi';
import type { AiResponseView } from '../../types/weeklyReport';
import type { DetailReportTarget } from '../../services/detailReportTargetStorage';
import { weeklyDestinationStorage } from '../../services/weeklyDestinationStorage';

type DetailReportCardProps = {
  rootProjectIdentifier: string;
  target: DetailReportTarget;
  refreshToken: number;
  onOpenWeeklyDialog: (target: DetailReportTarget) => void;
  onDirtyChange?: (targetKey: string, dirty: boolean) => void;
};

const statusLabels: Record<AiResponseView['status'], string> = {
  AVAILABLE: t('detailReport.statusAvailable'),
  PARTIAL: t('detailReport.statusPartial'),
  NOT_SAVED: t('detailReport.statusNotSaved'),
  FETCH_FAILED: t('detailReport.statusFetchFailed'),
  FORBIDDEN: t('detailReport.statusForbidden')
};

const formatSavedAt = (savedAt?: string | null) => {
  if (!savedAt) return null;
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return savedAt;
  return format(date, 'yyyy-MM-dd HH:mm');
};

export function DetailReportCard({
  rootProjectIdentifier,
  target,
  refreshToken,
  onOpenWeeklyDialog,
  onDirtyChange
}: DetailReportCardProps) {
  const targetKey = `${target.projectIdentifier}:${target.versionId}`;
  const [response, setResponse] = useState<AiResponseView | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const fetchResponse = useCallback(async () => {
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await fetchWeeklyAiResponses(rootProjectIdentifier, {
        selected_project_identifier: target.projectIdentifier,
        selected_version_id: target.versionId
      });

      if (requestId !== requestSeqRef.current) return;
      setResponse(result.response || {
        status: 'NOT_SAVED',
        destination_issue_id: 0,
        message: t('detailReport.notSaved')
      });
    } catch (error) {
      if (requestId !== requestSeqRef.current) return;

      if (error instanceof WeeklyApiError && error.code === 'NOT_FOUND') {
        setResponse({
          status: 'NOT_SAVED',
          destination_issue_id: 0,
          failure_reason_code: 'NOT_FOUND',
          message: t('detailReport.notSaved')
        });
        return;
      }

      if (error instanceof WeeklyApiError && error.code === 'FORBIDDEN') {
        setResponse({
          status: 'FORBIDDEN',
          destination_issue_id: 0,
          failure_reason_code: 'FORBIDDEN',
          message: error.message || t('detailReport.fetchFailed')
        });
        return;
      }

      const message = error instanceof Error && error.message ? error.message : t('detailReport.fetchFailed');
      setResponse({
        status: 'FETCH_FAILED',
        destination_issue_id: 0,
        message
      });
      setErrorMessage(message);
    } finally {
      if (requestId !== requestSeqRef.current) return;
      setLoading(false);
    }
  }, [rootProjectIdentifier, target.projectIdentifier, target.versionId]);

  useEffect(() => {
    onDirtyChange?.(targetKey, false);
    void fetchResponse();

    return () => {
      onDirtyChange?.(targetKey, false);
      requestSeqRef.current += 1;
    };
  }, [fetchResponse, onDirtyChange, refreshToken, targetKey]);

  const mappedDestinationIssueId = weeklyDestinationStorage.getDestinationIssueId(target.projectId, target.versionId) ?? 0;
  const destinationIssueId = response?.destination_issue_id && response.destination_issue_id > 0
    ? response.destination_issue_id
    : mappedDestinationIssueId;
  const canEdit = Boolean(response && (response.status === 'AVAILABLE' || response.status === 'PARTIAL'));
  const canSave = canEdit && destinationIssueId > 0;
  const responseStatusLabel = response ? (statusLabels[response.status] || response.status || t('detailReport.statusUnknown')) : t('common.loading');
  const savedAtLabel = useMemo(() => formatSavedAt(response?.saved_at), [response?.saved_at]);

  const handleSave = useCallback(async (sections: EditableSections) => {
    if (!response || !destinationIssueId || !canEdit) {
      throw new Error(t('detailReport.saveFailed'));
    }

    const result = await updateWeeklyAiResponse(rootProjectIdentifier, {
      selected_project_identifier: target.projectIdentifier,
      version_id: target.versionId,
      destination_issue_id: destinationIssueId,
      highlights_this_week: sections.highlights_this_week,
      next_week_actions: sections.next_week_actions,
      risks_decisions: sections.risks_decisions
    });

    setResponse(result.response);
    return result.response;
  }, [canEdit, destinationIssueId, response, rootProjectIdentifier, target.projectIdentifier, target.versionId]);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    onDirtyChange?.(targetKey, dirty);
  }, [onDirtyChange, targetKey]);

  return (
    <article
      className={`${reportStyles.surfaceFeatured} flex min-h-0 flex-col overflow-hidden`}
      data-testid={`detail-report-card-${targetKey}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-4">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-[16px] font-display font-medium tracking-tight text-[#222222]">
            {target.projectName}
          </h3>
          <p className="truncate text-[13px] font-sans text-[#45515e]">{target.versionName}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[12px] font-sans text-[#45515e]">
            <span className={reportStyles.metaBadge}>{t('detailReport.status')}: {responseStatusLabel}</span>
            {savedAtLabel ? (
              <span className={reportStyles.metaBadge}>{t('detailReport.savedAt')}: {savedAtLabel}</span>
            ) : null}
            {destinationIssueId > 0 ? (
              <span className={reportStyles.metaBadge}>{t('detailReport.destinationIssue')}: #{destinationIssueId}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            variant="pill-secondary"
            size="sm"
            className="h-8 px-3 text-[12px]"
            onClick={() => onOpenWeeklyDialog(target)}
          >
            <Icon name="sparkles" className="h-3.5 w-3.5" />
            {t('detailReport.openAiReport')}
          </Button>
          {destinationIssueId > 0 ? (
            <a
              href={`/issues/${destinationIssueId}`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[12px] font-medium text-[var(--color-brand-6)] hover:underline"
            >
              {t('detailReport.openRedmine')}
            </a>
          ) : null}
        </div>
      </div>

      <div className="border-b border-gray-100 px-4 py-3">
        {destinationIssueId > 0 ? (
          <p className="text-[12px] leading-6 text-[#45515e]">
            {t('detailReport.destinationIssueReady')}
          </p>
        ) : (
          <div className={reportStyles.alertInfo} role="note">
            {t('detailReport.destinationIssueRequired')}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <AiResponsePanel
          response={response}
          isLoading={loading}
          errorMessage={errorMessage}
          onSave={canSave ? handleSave : undefined}
          onDirtyChange={handleDirtyChange}
        />
      </div>
    </article>
  );
}
