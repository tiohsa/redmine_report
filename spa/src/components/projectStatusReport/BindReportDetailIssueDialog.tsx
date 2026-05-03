import { useState } from 'react';
import { t } from '../../i18n';
import { validateWeeklyDestination } from '../../services/weeklyReportApi';
import type { ReportPreset } from '../../services/reportPresetStorage';
import { reportStyles } from '../designSystem';
import { Button } from '../ui/Button';
import { CreateDestinationIssueDialog } from './CreateDestinationIssueDialog';

type BindReportDetailIssueDialogProps = {
  rootProjectIdentifier: string;
  rootProjectId: number;
  activePreset: ReportPreset;
  onBind: (preset: ReportPreset) => void;
  onClose: () => void;
};

const statusFromReason = (reasonCode: string): ReportPreset['detailReportIssueStatus'] => {
  if (reasonCode === 'OK') return 'VALID';
  if (reasonCode === 'NOT_FOUND') return 'NOT_FOUND';
  if (reasonCode === 'FORBIDDEN') return 'FORBIDDEN';
  if (reasonCode === 'PROJECT_MISMATCH') return 'PROJECT_MISMATCH';
  return 'INVALID';
};

export function BindReportDetailIssueDialog({
  rootProjectIdentifier,
  rootProjectId,
  activePreset,
  onBind,
  onClose
}: BindReportDetailIssueDialogProps) {
  const [issueId, setIssueId] = useState(activePreset.detailReportIssueId ? String(activePreset.detailReportIssueId) : '');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const bindIssue = (nextIssueId: number, status: ReportPreset['detailReportIssueStatus'] = 'VALID') => {
    onBind({
      ...activePreset,
      detailReportIssueId: nextIssueId,
      detailReportIssueStatus: status,
      detailReportIssueValidatedAt: new Date().toISOString()
    });
  };

  const validateAndBind = async () => {
    const parsedIssueId = Number.parseInt(issueId, 10);
    if (!Number.isInteger(parsedIssueId) || parsedIssueId <= 0) {
      setError(t('reportDetail.issueIdRequired'));
      return;
    }

    setIsValidating(true);
    setError(null);
    try {
      const result = await validateWeeklyDestination(rootProjectIdentifier, {
        project_id: rootProjectId,
        version_id: 0,
        destination_issue_id: parsedIssueId
      });
      const nextStatus = statusFromReason(result.reason_code);
      if (!result.valid) {
        setError(result.reason_message || t('reportDetail.validationFailed'));
        onBind({
          ...activePreset,
          detailReportIssueId: parsedIssueId,
          detailReportIssueStatus: nextStatus,
          detailReportIssueValidatedAt: new Date().toISOString()
        });
        return;
      }
      bindIssue(parsedIssueId, nextStatus);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reportDetail.validationFailed'));
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <>
      <div className={reportStyles.dialogOverlay} role="dialog" aria-modal="true" aria-label={t('reportDetail.bindIssue')}>
        <div className={`${reportStyles.dialogPanel} ${reportStyles.dialogPanelSm} animate-in fade-in zoom-in duration-300`}>
          <div className={reportStyles.dialogBody}>
            <h2 className="report-section-title">{t('reportDetail.bindIssue')}</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setCreateOpen(true)}>
                {t('reportDetail.createIssue')}
              </Button>
            </div>

            <label className="mt-6 block text-[13px] font-medium text-[#45515e]">
              {t('reportDetail.selectExistingIssue')}
              <input
                value={issueId}
                onChange={(event) => setIssueId(event.target.value)}
                className="report-input mt-2"
                inputMode="numeric"
                placeholder="200"
              />
            </label>

            {error ? <p className={`mt-3 ${reportStyles.alertError}`} role="alert">{error}</p> : null}

            <div className="mt-8 flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
              <Button onClick={validateAndBind} disabled={isValidating}>
                {isValidating ? t('weeklyDialog.validating') : t('reportDetail.validateAndBind')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {createOpen ? (
        <CreateDestinationIssueDialog
          projectIdentifier={rootProjectIdentifier}
          onCreated={(createdIssueId) => {
            if (createdIssueId) {
              bindIssue(createdIssueId, 'VALID');
              setCreateOpen(false);
              onClose();
            }
          }}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </>
  );
}

