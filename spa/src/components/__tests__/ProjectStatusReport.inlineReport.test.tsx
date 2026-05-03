import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStatusReport } from '../ProjectStatusReport';
import type { CategoryBar } from '../../services/scheduleReportApi';
import { useUiStore } from '../../stores/uiStore';

vi.mock('../../i18n', async () => {
  const actual = await vi.importActual<typeof import('../../i18n')>('../../i18n');
  return { ...actual, t: (key: string, params?: Record<string, unknown>) => params?.name ? `${key}: ${params.name}` : key };
});

vi.mock('../projectStatusReport/TimelineChart', () => ({
  TimelineChart: ({ timelineData }: { timelineData: Array<{ projectIdentifier: string; versionId?: number; versionName: string }> }) => (
    <div data-testid="mock-timeline">
      {timelineData.map((lane) => `${lane.projectIdentifier}:${lane.versionId}:${lane.versionName}`).join(',')}
    </div>
  )
}));

vi.mock('../projectStatusReport/VersionAiDialog', () => ({
  VersionAiDialog: () => null
}));

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

const projects = [
  { project_id: 1, identifier: 'ecookbook', name: 'eCookbook', level: 0, selectable: true },
  { project_id: 2, identifier: 'mobile', name: 'Mobile', level: 1, selectable: true },
  { project_id: 3, identifier: 'archived', name: 'Archived', level: 1, selectable: false }
];

const renderReport = (
  bars: CategoryBar[] = [makeBar()],
  options: {
    selectedVersions?: string[];
    availableProjects?: typeof projects;
  } = {}
) => {
  const selectedVersions = options.selectedVersions ?? bars.map((bar) => bar.version_name || 'No Version');
  return render(
    <ProjectStatusReport
      bars={bars}
      projectIdentifier="ecookbook"
      availableProjects={options.availableProjects ?? [projects[0]]}
      selectedVersions={selectedVersions}
    />
  );
};

const renderControlledReport = (
  bars: CategoryBar[],
  options: {
    selectedVersions?: string[];
    availableProjects?: typeof projects;
  } = {}
) => {
  const Harness = () => {
    const [versions, setVersions] = useState(options.selectedVersions ?? bars.map((bar) => bar.version_name || 'No Version'));
    return (
      <>
        <div data-testid="selected-versions">{versions.join(',')}</div>
        <ProjectStatusReport
          bars={bars}
          projectIdentifier="ecookbook"
          availableProjects={options.availableProjects ?? projects}
          selectedVersions={versions}
          onVersionChange={setVersions}
        />
      </>
    );
  };

  return render(<Harness />);
};

describe('ProjectStatusReport report presets', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    useUiStore.setState({
      rootProjectIdentifier: 'ecookbook',
      currentProjectIdentifier: 'ecookbook',
      selectedProjectIdentifiers: ['ecookbook']
    });

    if (!(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver) {
      (globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  it('keeps the detail report panel hidden until a preset is active and toggled', async () => {
    renderReport([makeBar()]);

    expect(screen.queryByTestId('report-detail-panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Report preset add current view' }));
    fireEvent.change(screen.getByLabelText('reportPreset.name'), { target: { value: 'May report' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(screen.getByDisplayValue('May report')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'reportDetail.toggle' }));

    expect(screen.getByTestId('report-detail-panel')).toBeTruthy();
    expect(screen.getByText('reportDetail.title: May report')).toBeTruthy();
    expect(screen.getByText('eCookbook / v1')).toBeTruthy();
  });

  it('selecting a preset filters the timeline bars to preset targets', async () => {
    renderReport([
      makeBar({ version_id: 101, version_name: 'v1' }),
      makeBar({ version_id: 102, version_name: 'v2', category_id: 200 })
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Report preset add current view' }));
    fireEvent.change(screen.getByLabelText('reportPreset.name'), { target: { value: 'Both versions' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(screen.getByDisplayValue('Both versions')).toBeTruthy());
    expect(screen.getByTestId('mock-timeline').textContent).toContain('v1');
    expect(screen.getByTestId('mock-timeline').textContent).toContain('v2');

    fireEvent.change(screen.getByRole('combobox', { name: 'reportPreset.selector' }), { target: { value: '' } });
    expect(screen.getByTestId('mock-timeline').textContent).toContain('v1');
  });

  it('saves only the currently selected project and version targets', () => {
    useUiStore.setState({ selectedProjectIdentifiers: ['mobile'] });
    renderReport([
      makeBar({ project_id: 1, version_id: 101, version_name: 'v1' }),
      makeBar({ project_id: 2, version_id: 201, version_name: 'v2', category_id: 200 }),
      makeBar({ project_id: 2, version_id: 202, version_name: 'v3', category_id: 300 })
    ], {
      availableProjects: projects,
      selectedVersions: ['v2']
    });

    fireEvent.click(screen.getByRole('button', { name: 'Report preset add current view' }));

    expect(screen.queryByText('eCookbook / v1')).toBeNull();
    expect(screen.getByText('Mobile / v2')).toBeTruthy();
    expect(screen.queryByText('Mobile / v3')).toBeNull();
  });

  it('treats empty project and version selections as all selectable projects and all versions for saving', () => {
    useUiStore.setState({ selectedProjectIdentifiers: [] });
    renderReport([
      makeBar({ project_id: 1, version_id: 101, version_name: 'v1' }),
      makeBar({ project_id: 2, version_id: 201, version_name: 'v2', category_id: 200 }),
      makeBar({ project_id: 3, version_id: 301, version_name: 'v3', category_id: 300 })
    ], {
      availableProjects: projects,
      selectedVersions: []
    });

    fireEvent.click(screen.getByRole('button', { name: 'Report preset add current view' }));

    expect(screen.getByText('eCookbook / v1')).toBeTruthy();
    expect(screen.getByText('Mobile / v2')).toBeTruthy();
    expect(screen.queryByText('Archived / v3')).toBeNull();
  });

  it('syncs project and version selections when selecting a preset', async () => {
    const preset = {
      id: 'preset-1',
      name: 'Mobile release',
      targets: [{ projectId: 2, projectIdentifier: 'mobile', projectName: 'Mobile', versionId: 201, versionName: 'v2' }],
      detailReportIssueStatus: 'UNBOUND',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };
    window.localStorage.setItem('redmine_report.reportPresets.ecookbook', JSON.stringify([preset]));
    useUiStore.setState({ selectedProjectIdentifiers: ['ecookbook'] });

    renderControlledReport([
      makeBar({ project_id: 1, version_id: 101, version_name: 'v1' }),
      makeBar({ project_id: 2, version_id: 201, version_name: 'v2', category_id: 200 })
    ], {
      selectedVersions: ['v1'],
      availableProjects: projects
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'reportPreset.selector' }), { target: { value: 'preset-1' } });

    await waitFor(() => expect(screen.getByTestId('selected-versions').textContent).toBe('v2'));
    expect(useUiStore.getState().selectedProjectIdentifiers).toEqual(['mobile']);
    expect(window.localStorage.getItem('redmine_report.activeReportPresetId.ecookbook')).toBe('preset-1');
  });

  it('keeps preset timeline filtering scoped by project id and version id when version names match', async () => {
    const preset = {
      id: 'preset-1',
      name: 'Mobile v1',
      targets: [{ projectId: 2, projectIdentifier: 'mobile', projectName: 'Mobile', versionId: 201, versionName: 'v1' }],
      detailReportIssueStatus: 'UNBOUND',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };
    window.localStorage.setItem('redmine_report.reportPresets.ecookbook', JSON.stringify([preset]));
    useUiStore.setState({ selectedProjectIdentifiers: ['ecookbook'] });

    renderControlledReport([
      makeBar({ project_id: 1, version_id: 101, version_name: 'v1' }),
      makeBar({ project_id: 2, version_id: 201, version_name: 'v1', category_id: 200 })
    ], {
      selectedVersions: ['v1'],
      availableProjects: projects
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'reportPreset.selector' }), { target: { value: 'preset-1' } });

    await waitFor(() => expect(screen.getByTestId('mock-timeline').textContent).toBe('mobile:201:v1'));
  });

  it('updating preset targets preserves the linked detail issue id', async () => {
    const preset = {
      id: 'preset-1',
      name: 'Saved',
      targets: [{ projectId: 1, projectIdentifier: 'ecookbook', projectName: 'eCookbook', versionId: 101, versionName: 'v1' }],
      detailReportIssueId: 200,
      detailReportIssueStatus: 'VALID',
      detailReportIssueValidatedAt: '2026-03-01T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };
    window.localStorage.setItem('redmine_report.reportPresets.ecookbook', JSON.stringify([preset]));
    window.localStorage.setItem('redmine_report.activeReportPresetId.ecookbook', 'preset-1');

    renderReport([makeBar({ version_id: 101, version_name: 'v1' })]);

    fireEvent.click(screen.getByRole('button', { name: 'reportPreset.updateTargets' }));

    const saved = JSON.parse(window.localStorage.getItem('redmine_report.reportPresets.ecookbook') || '[]');
    expect(saved[0].detailReportIssueId).toBe(200);
  });

  it('updates preset targets from the current UI selections while preserving the linked detail issue id', async () => {
    const preset = {
      id: 'preset-1',
      name: 'Saved',
      targets: [{ projectId: 1, projectIdentifier: 'ecookbook', projectName: 'eCookbook', versionId: 101, versionName: 'v1' }],
      detailReportIssueId: 200,
      detailReportIssueStatus: 'VALID',
      detailReportIssueValidatedAt: '2026-03-01T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z'
    };
    window.localStorage.setItem('redmine_report.reportPresets.ecookbook', JSON.stringify([preset]));
    window.localStorage.setItem('redmine_report.activeReportPresetId.ecookbook', 'preset-1');
    useUiStore.setState({ selectedProjectIdentifiers: ['mobile'] });

    renderReport([
      makeBar({ project_id: 1, version_id: 101, version_name: 'v1' }),
      makeBar({ project_id: 2, version_id: 201, version_name: 'v2', category_id: 200 })
    ], {
      availableProjects: projects,
      selectedVersions: ['v2']
    });

    fireEvent.click(screen.getByRole('button', { name: 'reportPreset.updateTargets' }));

    const saved = JSON.parse(window.localStorage.getItem('redmine_report.reportPresets.ecookbook') || '[]');
    expect(saved[0].detailReportIssueId).toBe(200);
    expect(saved[0].targets).toMatchObject([
      { projectId: 2, projectIdentifier: 'mobile', versionId: 201, versionName: 'v2' }
    ]);
  });
});
