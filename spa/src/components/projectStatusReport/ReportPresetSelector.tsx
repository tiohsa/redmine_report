import type { ReportPreset } from '../../services/reportPresetStorage';
import { t } from '../../i18n';
import { Button } from '../ui/Button';

type ReportPresetSelectorProps = {
  presets: ReportPreset[];
  activePresetId: string | null;
  onActivePresetChange: (presetId: string | null) => void;
  onSaveCurrentView: () => void;
  onUpdateTargets: () => void;
  canSaveCurrentView: boolean;
  canUpdateTargets: boolean;
};

export function ReportPresetSelector({
  presets = [],
  activePresetId,
  onActivePresetChange,
  onSaveCurrentView,
  onUpdateTargets,
  canSaveCurrentView,
  canUpdateTargets
}: ReportPresetSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-[12px] font-medium text-[#45515e]">
        {t('reportPreset.selector')}
        <select
          className="h-8 min-w-[180px] rounded-[8px] border border-[#e5e7eb] bg-white px-2 text-[12px] text-[#222222]"
          value={activePresetId || ''}
          onChange={(event) => onActivePresetChange(event.target.value || null)}
        >
          <option value="">{t('reportPreset.noPreset')}</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="pill-secondary"
        size="sm"
        className="h-8 px-3 text-[12px]"
        onClick={onSaveCurrentView}
        disabled={!canSaveCurrentView}
        aria-label="Report preset add current view"
      >
        {t('reportPreset.saveCurrentView')}
      </Button>
      <Button
        type="button"
        variant="pill-secondary"
        size="sm"
        className="h-8 px-3 text-[12px]"
        onClick={onUpdateTargets}
        disabled={!canUpdateTargets}
      >
        {t('reportPreset.updateTargets')}
      </Button>
    </div>
  );
}
