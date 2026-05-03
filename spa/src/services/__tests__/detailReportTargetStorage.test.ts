import { describe, expect, it, beforeEach } from 'vitest';
import { detailReportTargetStorage } from '../detailReportTargetStorage';

describe('detailReportTargetStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips saved targets and clears them', () => {
    const settings = detailReportTargetStorage.save('ecookbook', [
      {
        projectId: 1,
        projectIdentifier: 'ecookbook',
        projectName: 'eCookbook',
        versionId: 101,
        versionName: 'v1'
      }
    ], 'ecookbook:101');

    expect(settings.targets).toHaveLength(1);
    expect(settings.selectedKey).toBe('ecookbook:101');
    expect(detailReportTargetStorage.load('ecookbook')?.targets[0].versionId).toBe(101);
    expect(detailReportTargetStorage.load('ecookbook')?.selectedKey).toBe('ecookbook:101');

    detailReportTargetStorage.select('ecookbook', null);
    expect(detailReportTargetStorage.load('ecookbook')?.selectedKey).toBeNull();

    detailReportTargetStorage.clear('ecookbook');
    expect(detailReportTargetStorage.load('ecookbook')).toBeNull();
  });

  it('returns null for malformed json and filters invalid target rows', () => {
    window.localStorage.setItem('redmine_report.detailReport.targets.ecookbook', '{broken');
    expect(detailReportTargetStorage.load('ecookbook')).toBeNull();

    window.localStorage.setItem(
      'redmine_report.detailReport.targets.ecookbook',
      JSON.stringify({
        targets: [
          {
            projectId: 1,
            projectIdentifier: 'ecookbook',
            projectName: 'eCookbook',
            versionId: 101,
            versionName: 'v1'
          },
          {
            projectId: 1,
            projectIdentifier: '',
            projectName: '',
            versionId: 0,
            versionName: ''
          }
        ],
        selectedKey: 'missing:999',
        updatedAt: '2026-03-10T10:00:00+09:00'
      })
    );

    const loaded = detailReportTargetStorage.load('ecookbook');
    expect(loaded?.targets).toHaveLength(1);
    expect(loaded?.targets[0].versionId).toBe(101);
    expect(loaded?.selectedKey).toBeNull();
  });
});
