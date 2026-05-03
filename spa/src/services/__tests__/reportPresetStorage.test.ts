import { beforeEach, describe, expect, it } from 'vitest';
import { reportPresetStorage } from '../reportPresetStorage';

const target = {
  projectId: 1,
  projectIdentifier: 'ecookbook',
  projectName: 'eCookbook',
  versionId: 101,
  versionName: 'v1'
};

describe('reportPresetStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads presets and active preset id', () => {
    const preset = reportPresetStorage.create('ecookbook', { name: ' May ', targets: [target] });
    reportPresetStorage.setActivePresetId('ecookbook', preset.id);

    const settings = reportPresetStorage.load('ecookbook');
    expect(settings.presets[0].name).toBe('May');
    expect(settings.activePresetId).toBe(preset.id);
  });

  it('sanitizes malformed JSON and invalid rows', () => {
    window.localStorage.setItem('redmine_report.reportPresets.ecookbook', '{bad json');
    expect(reportPresetStorage.load('ecookbook').presets).toEqual([]);

    reportPresetStorage.save('ecookbook', {
      presets: [
        { id: 'bad', name: ' ', targets: [target], createdAt: '', updatedAt: '' },
        { id: 'ok', name: 'OK', targets: [{ ...target, projectId: 0 }, target], createdAt: 'x', updatedAt: 'x' }
      ],
      activePresetId: 'ok'
    });

    const settings = reportPresetStorage.load('ecookbook');
    expect(settings.presets).toHaveLength(1);
    expect(settings.presets[0].targets).toHaveLength(1);
    expect(settings.activePresetId).toBe('ok');
  });

  it('deduplicates targets and preserves detail issue fields on update', () => {
    const preset = reportPresetStorage.create('ecookbook', {
      name: 'Preset',
      targets: [target, { ...target, versionName: 'duplicate' }]
    });

    expect(preset.targets).toHaveLength(1);

    const updated = reportPresetStorage.update('ecookbook', {
      ...preset,
      targets: [{ ...target, versionId: 102, versionName: 'v2' }],
      detailReportIssueId: 200,
      detailReportIssueStatus: 'VALID'
    });

    expect(updated.targets.map((row) => row.versionId)).toEqual([102]);
    expect(updated.detailReportIssueId).toBe(200);
  });

  it('does not persist detail panel visibility', () => {
    const preset = reportPresetStorage.create('ecookbook', { name: 'Preset', targets: [target] });
    reportPresetStorage.save('ecookbook', {
      presets: [{ ...preset, isReportDetailVisible: true } as typeof preset & { isReportDetailVisible: boolean }],
      activePresetId: preset.id
    });

    const raw = window.localStorage.getItem('redmine_report.reportPresets.ecookbook') || '';
    expect(raw).not.toContain('isReportDetailVisible');
  });
});

