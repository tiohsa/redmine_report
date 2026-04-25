import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStatusReport } from '../ProjectStatusReport';
import type { CategoryBar } from '../../services/scheduleReportApi';
import { useUiStore } from '../../stores/uiStore';

const fetchWeeklyAiResponsesMock = vi.fn();

vi.mock('../../i18n', async () => {
  const actual = await vi.importActual<typeof import('../../i18n')>('../../i18n');
  return {
    ...actual,
    t: (key: string) => key
  };
});

vi.mock('../../services/scheduleReportApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/scheduleReportApi')>('../../services/scheduleReportApi');
  return {
    ...actual,
    fetchWeeklyAiResponses: (...args: unknown[]) => fetchWeeklyAiResponsesMock(...args)
  };
});

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

describe('ProjectStatusReport inline report', () => {
  beforeEach(() => {
    fetchWeeklyAiResponsesMock.mockReset();
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

  it('toggles the inline detailed report when the detail button is clicked twice', async () => {
    fetchWeeklyAiResponsesMock.mockResolvedValue({
      response: {
        status: 'AVAILABLE',
        destination_issue_id: 123,
        saved_at: '2026-03-10T10:00:00+09:00',
        highlights_this_week: 'Highlights',
        next_week_actions: 'Next actions',
        risks_decisions: 'Risks'
      }
    });

    render(
      <ProjectStatusReport
        bars={[makeBar()]}
        projectIdentifier="ecookbook"
        availableProjects={[{ project_id: 1, identifier: 'ecookbook', name: 'eCookbook', level: 0, selectable: true }]}
        selectedVersions={['v1']}
      />
    );

    const lane = screen.getByTestId('timeline-lane-label-0');
    const detailButton = within(lane).getByRole('button', { name: 'timeline.showDetailAria' });

    fireEvent.click(detailButton);

    await waitFor(() => expect(fetchWeeklyAiResponsesMock).toHaveBeenCalledTimes(1));
    const report = await waitFor(() => screen.getByTestId('timeline-inline-report-1:v1'));
    expect(within(report).getByTestId('ai-section-view-highlights_this_week')).toBeTruthy();
    expect(within(report).queryByText('report.detailTitle')).toBeNull();
    expect(within(report).queryByText('report.aiSuffix')).toBeNull();
    expect(within(report).queryByText('eCookbook / v1')).toBeNull();

    fireEvent.click(detailButton);

    await waitFor(() => expect(screen.queryByTestId('timeline-inline-report-1:v1')).toBeNull());
    expect(fetchWeeklyAiResponsesMock).toHaveBeenCalledTimes(1);
  });
});
