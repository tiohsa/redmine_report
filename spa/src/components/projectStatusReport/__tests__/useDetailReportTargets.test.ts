import { describe, expect, it } from 'vitest';
import { buildDetailReportTargets, buildVisibleDetailReportTargets } from '../useDetailReportTargets';
import type { CategoryBar, ProjectInfo } from '../../../services/scheduleReportTypes';

const makeBar = (overrides: Partial<CategoryBar> = {}): CategoryBar => ({
  bar_key: `1:issue:${overrides.category_id ?? 100}`,
  project_id: 1,
  category_id: 100,
  category_name: 'Parent',
  version_id: 101,
  version_name: 'v1',
  ticket_subject: 'Parent',
  start_date: '2026-03-01',
  end_date: '2026-03-10',
  issue_count: 1,
  delayed_issue_count: 0,
  progress_rate: 20,
  is_delayed: false,
  dependencies: [],
  ...overrides
});

const availableProjects: ProjectInfo[] = [
  { project_id: 1, identifier: 'ecookbook', name: 'eCookbook', level: 0, selectable: true },
  { project_id: 2, identifier: 'redmine', name: 'Redmine', level: 0, selectable: true }
];

describe('buildDetailReportTargets', () => {
  it('deduplicates project/version pairs and skips invalid bars', () => {
    const targets = buildDetailReportTargets(
      [
        makeBar({ version_id: 101, version_name: 'v1' }),
        makeBar({ version_id: 101, version_name: 'v1 duplicate' }),
        makeBar({ version_id: 102, version_name: 'v2', category_id: 200, category_name: 'Child' }),
        makeBar({ project_id: 3, version_id: 103, version_name: 'missing project' }),
        makeBar({ version_id: undefined })
      ],
      availableProjects
    );

    expect(targets).toEqual([
      {
        projectId: 1,
        projectIdentifier: 'ecookbook',
        projectName: 'eCookbook',
        versionId: 101,
        versionName: 'v1'
      },
      {
        projectId: 1,
        projectIdentifier: 'ecookbook',
        projectName: 'eCookbook',
        versionId: 102,
        versionName: 'v2'
      }
    ]);
  });

  it('builds targets from the currently visible timeline lanes', () => {
    const targets = buildVisibleDetailReportTargets([
      {
        laneKey: '1:v1',
        projectId: 1,
        projectIdentifier: 'ecookbook',
        projectName: 'eCookbook',
        versionId: 101,
        versionName: 'v1',
        steps: []
      },
      {
        laneKey: '1:v1-duplicate',
        projectId: 1,
        projectIdentifier: 'ecookbook',
        projectName: 'eCookbook',
        versionId: 101,
        versionName: 'v1',
        steps: []
      },
      {
        laneKey: '2:no-version',
        projectId: 2,
        projectIdentifier: 'redmine',
        projectName: 'Redmine',
        versionName: 'No version',
        steps: []
      }
    ]);

    expect(targets).toEqual([
      {
        projectId: 1,
        projectIdentifier: 'ecookbook',
        projectName: 'eCookbook',
        versionId: 101,
        versionName: 'v1'
      }
    ]);
  });
});
