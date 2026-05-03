import { useMemo, useState } from 'react';
import { t } from '../../i18n';
import { reportStyles } from '../designSystem';
import { Button } from '../ui/Button';
import type { ReportPresetTarget } from '../../services/reportPresetStorage';

type SaveReportPresetDialogProps = {
  targets: ReportPresetTarget[];
  existingNames: string[];
  onSave: (name: string) => void;
  onClose: () => void;
};

export function SaveReportPresetDialog({
  targets,
  existingNames,
  onSave,
  onClose
}: SaveReportPresetDialogProps) {
  const [name, setName] = useState('');
  const trimmedName = name.trim();
  const duplicateName = useMemo(
    () => existingNames.some((existingName) => existingName.trim().toLowerCase() === trimmedName.toLowerCase()),
    [existingNames, trimmedName]
  );
  const error = !trimmedName
    ? t('reportPreset.nameRequired')
    : duplicateName
      ? t('reportPreset.duplicateName')
      : targets.length === 0
        ? t('reportPreset.empty')
        : null;

  return (
    <div className={reportStyles.dialogOverlay} role="dialog" aria-modal="true" aria-label={t('reportPreset.saveCurrentView')}>
      <div className={`${reportStyles.dialogPanel} ${reportStyles.dialogPanelSm} animate-in fade-in zoom-in duration-300`}>
        <div className={reportStyles.dialogBody}>
          <h2 className="report-section-title">{t('reportPreset.saveCurrentView')}</h2>

          <label className="mt-5 block text-[13px] font-medium text-[#45515e]">
            {t('reportPreset.name')}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="report-input mt-2"
              autoFocus
            />
          </label>

          <div className="mt-5">
            <div className="text-[13px] font-semibold text-[#222222]">{t('reportPreset.targets')}</div>
            {targets.length === 0 ? (
              <p className={`mt-3 ${reportStyles.alertWarning}`}>{t('reportPreset.empty')}</p>
            ) : (
              <ul className="mt-3 max-h-[220px] overflow-auto rounded-[8px] border border-[#e5e7eb] bg-white">
                {targets.map((target) => (
                  <li
                    key={`${target.projectId}:${target.versionId}`}
                    className="border-b border-[#f2f3f5] px-3 py-2 text-[13px] text-[#45515e] last:border-b-0"
                  >
                    {target.projectName} / {target.versionName}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error ? <p className={`mt-3 ${reportStyles.alertError}`} role="alert">{error}</p> : null}

          <div className="mt-8 flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
            <Button onClick={() => onSave(trimmedName)} disabled={Boolean(error)}>{t('common.save')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

