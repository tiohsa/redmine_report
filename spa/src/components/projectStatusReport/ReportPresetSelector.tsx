import type { ReportPreset } from '../../services/reportPresetStorage';
import { t } from '../../i18n';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

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
  const compactControlClassName = 'box-border !h-8 !min-h-8 rounded-[6px]';
  const compactActionClassName = 'box-border !h-8 !min-h-8 !rounded-[6px] !px-3 !py-0 text-[12px]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-[12px] font-medium text-[#45515e]">
        {t('reportPreset.selector')}
        <select
          className={`${compactControlClassName} min-w-[180px] cursor-pointer border border-[#e5e7eb] bg-white px-2 py-0 text-[12px] leading-[32px] text-[#222222]`}
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
        className={compactActionClassName}
        leadingIcon={<Icon name="bookmark" className="h-3.5 w-3.5" />}
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
        className={compactActionClassName}
        leadingIcon={<Icon name="reload" className="h-3.5 w-3.5" />}
        onClick={onUpdateTargets}
        disabled={!canUpdateTargets}
      >
        {t('reportPreset.updateTargets')}
      </Button>
    </div>
  );
}
