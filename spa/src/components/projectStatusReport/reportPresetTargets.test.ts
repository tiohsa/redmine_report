import { describe, expect, it } from 'vitest';
import type { CategoryBar, ProjectInfo } from '../../services/scheduleReportTypes';
import { buildReportPresetTargets, filterBarsByReportPreset } from './reportPresetTargets';
import type { ReportPreset } from '../../services/reportPresetStorage';

const projects: ProjectInfo[] = [
  { project_id: 1, identifier: 'ecookbook', name: 'eCookbook', level: 0, selectable: true },
  { project_id: 2, identifier: 'mobile', name: 'Mobile', level: 0, selectable: true }
];

const bar = (overrides: Partial<CategoryBar> = {}): CategoryBar => ({
  bar_key: `${overrides.project_id ?? 1}:${overrides.version_id ?? 101}`,
  project_id: 1,
  category_id: 100,
  category_name: 'Parent',
  version_id: 101,
  version_name: 'v1',
  start_date: '2026-03-01',
  end_date: '2026-03-10',
  issue_count: 1,
  delayed_issue_count: 0,
  progress_rate: 20,
  is_delayed: false,
  dependencies: [],
  ...overrides
});

describe('buildReportPresetTargets', () => {
  it('extracts unique project/version targets in first-seen order', () => {
    const targets = buildReportPresetTargets([
      bar({ project_id: 1, version_id: 101, version_name: 'v1' }),
      bar({ project_id: 1, version_id: 101, version_name: 'v1 duplicate' }),
      bar({ project_id: 2, version_id: 201, version_name: 'v2' })
    ], projects);

    expect(targets.map((target) => `${target.projectId}:${target.versionId}:${target.versionName}`)).toEqual([
      '1:101:v1',
      '2:201:v2'
    ]);
  });

  it('excludes bars without versions or resolvable projects and falls back for missing names', () => {
    const targets = buildReportPresetTargets([
      bar({ version_id: undefined }),
      bar({ project_id: 999, version_id: 999 }),
      bar({ project_id: 1, version_id: 102, version_name: undefined })
    ], projects);

    expect(targets).toHaveLength(1);
    expect(targets[0].versionName).toBe('No version');
  });
});

describe('filterBarsByReportPreset', () => {
  const preset: ReportPreset = {
    id: 'preset-1',
    name: 'Preset',
    targets: [{ projectId: 1, projectIdentifier: 'ecookbook', projectName: 'eCookbook', versionId: 101, versionName: 'v1' }],
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  };

  it('returns all bars when no preset is active', () => {
    const bars = [bar({ version_id: 101 }), bar({ version_id: undefined })];
    expect(filterBarsByReportPreset(bars, null)).toBe(bars);
  });

  it('returns only bars matching preset targets and excludes bars without versions', () => {
    const result = filterBarsByReportPreset([
      bar({ project_id: 1, version_id: 101 }),
      bar({ project_id: 1, version_id: 102 }),
      bar({ version_id: undefined })
    ], preset);

    expect(result.map((row) => row.version_id)).toEqual([101]);
  });

  it('handles empty preset targets', () => {
    expect(filterBarsByReportPreset([bar()], { ...preset, targets: [] })).toEqual([]);
  });
});

