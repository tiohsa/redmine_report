import { useCallback, useMemo, useState } from 'react';
import { t } from '../../i18n';
import { validateWeeklyDestination, WeeklyApiError } from '../../services/scheduleReportApi';
import { type DetailReportTarget } from '../../services/detailReportTargetStorage';
import { weeklyDestinationStorage } from '../../services/weeklyDestinationStorage';
import type { DestinationValidationResult } from '../../types/weeklyReport';
import { Button } from '../ui/Button';
import { FieldLabel } from '../ui/FieldLabel';
import { Icon } from '../ui/Icon';
import { reportStyles } from '../designSystem';
import { CreateDestinationIssueDialog } from './CreateDestinationIssueDialog';

type DetailReportTargetSaveDialogProps = {
  rootProjectIdentifier: string;
  targets: DetailReportTarget[];
  onSaved: (targets: DetailReportTarget[], selectedIssueId: number) => void;
  onClose: () => void;
};

export function DetailReportTargetSaveDialog({
  rootProjectIdentifier,
  targets,
  onSaved,
  onClose
}: DetailReportTargetSaveDialogProps) {
  const [destinationIssueId, setDestinationIssueId] = useState('');
  const [validation, setValidation] = useState<DestinationValidationResult | null>(null);
  const [loadingValidate, setLoadingValidate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createTicketOpen, setCreateTicketOpen] = useState(false);

  const destinationIdNumber = Number(destinationIssueId);
  const destinationValid = validation?.valid === true;
  const uniqueProjectCount = useMemo(
    () => new Set(targets.map((target) => target.projectIdentifier)).size,
    [targets]
  );

  const validateDestinationById = useCallback(async (issueId: number) => {
    const firstTarget = targets[0];
    if (!firstTarget) return;

    setLoadingValidate(true);
    setError(null);
    setMessage(null);
    setValidation(null);

    try {
      const result = await validateWeeklyDestination(rootProjectIdentifier, {
        project_id: firstTarget.projectId,
        version_id: firstTarget.versionId,
        destination_issue_id: issueId
      });
      setValidation(result);
      setMessage(result.valid ? t('weeklyDialog.destinationValidated') : result.reason_message || null);
    } catch (e) {
      const err = e as WeeklyApiError;
      setValidation({ valid: false, reason_code: err.code || 'INVALID_INPUT', reason_message: err.message });
      setError(err.message);
    } finally {
      setLoadingValidate(false);
    }
  }, [rootProjectIdentifier, targets]);

  const handleSave = () => {
    if (!destinationValid || !Number.isFinite(destinationIdNumber) || destinationIdNumber <= 0) return;

    setSaving(true);
    setError(null);
    try {
      targets.forEach((target) => {
        weeklyDestinationStorage.setDestinationIssueId(target.projectId, target.versionId, destinationIdNumber);
        weeklyDestinationStorage.setLastVersionId(target.projectId, target.versionId);
      });
      onSaved(targets, destinationIdNumber);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={reportStyles.dialogOverlay} role="dialog" aria-modal="true" aria-label={t('detailReport.saveTargets')}>
      <div
        className={`${reportStyles.dialogPanel} ${reportStyles.dialogPanelMd} animate-in fade-in zoom-in duration-300`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={reportStyles.dialogHeader}>
          <div>
            <h2 className={reportStyles.sectionHeading}>{t('detailReport.saveTargets')}</h2>
            <p className="mt-1 text-[13px] font-sans text-[#45515e]">
              {t('detailReport.saveTargetsSummary', {
                count: targets.length,
                projectCount: uniqueProjectCount
              })}
            </p>
          </div>
          <Button variant="icon-muted" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </Button>
        </div>

        <div className="space-y-5 bg-white p-6">
          <div className="space-y-2">
            <FieldLabel>{t('weeklyDialog.destinationIssueId')}</FieldLabel>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-48">
                <input
                  type="number"
                  min={1}
                  placeholder={t('weeklyDialog.issueIdPlaceholder')}
                  value={destinationIssueId}
                  onChange={(event) => {
                    setDestinationIssueId(event.target.value);
                    setValidation(null);
                    setMessage(null);
                    setError(null);
                  }}
                  className={`${reportStyles.input} pr-10`}
                />
                {validation ? (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {validation.valid ? (
                      <Icon name="check-circle" className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <Icon name="warning" className="h-5 w-5 text-rose-500" />
                    )}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                title={t('weeklyDialog.createDestinationIssue')}
                onClick={() => setCreateTicketOpen(true)}
                variant="icon-muted"
              >
                <Icon name="plus" />
              </Button>
              <Button
                type="button"
                onClick={() => validateDestinationById(destinationIdNumber)}
                disabled={loadingValidate || !destinationIssueId || targets.length === 0}
              >
                {loadingValidate ? t('weeklyDialog.validating') : t('weeklyDialog.validateDestination')}
              </Button>
            </div>
          </div>

          {message && !error ? (
            <div className={destinationValid ? reportStyles.alertSuccess : reportStyles.alertWarning}>
              {message}
            </div>
          ) : null}
          {error ? <div className={reportStyles.alertError} role="alert">{error}</div> : null}

          <div className="max-h-[220px] overflow-y-auto rounded-[8px] border border-[var(--color-border-light)] bg-white">
            {targets.length === 0 ? (
              <div className={reportStyles.selectionListEmpty}>{t('detailReport.noVisibleTargets')}</div>
            ) : (
              targets.map((target) => (
                <div
                  key={`${target.projectIdentifier}:${target.versionId}`}
                  className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 truncate text-[13px] font-medium text-[#222222]">
                    {target.projectName} / {target.versionName}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={reportStyles.dialogFooter}>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!destinationValid || saving || targets.length === 0}>
            {saving ? t('common.saving') : t('detailReport.saveTargets')}
          </Button>
        </div>
      </div>

      {createTicketOpen ? (
        <CreateDestinationIssueDialog
          projectIdentifier={rootProjectIdentifier}
          onCreated={async (newIssueId) => {
            if (newIssueId) {
              setDestinationIssueId(String(newIssueId));
              await validateDestinationById(newIssueId);
            }
          }}
          onClose={() => setCreateTicketOpen(false)}
        />
      ) : null}
    </div>
  );
}
