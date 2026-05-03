import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStatusReport } from '../ProjectStatusReport';
import type { CategoryBar } from '../../services/scheduleReportApi';
import { useUiStore } from '../../stores/uiStore';

const fetchWeeklyAiResponsesMock = vi.fn();
const updateWeeklyAiResponseMock = vi.fn();

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
    fetchWeeklyAiResponses: (...args: unknown[]) => fetchWeeklyAiResponsesMock(...args),
    updateWeeklyAiResponse: (...args: unknown[]) => updateWeeklyAiResponseMock(...args)
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

const openLaneActionsMenu = (laneTestId: string) => {
  const lane = screen.getByTestId(laneTestId);
  fireEvent.click(within(lane).getByRole('button', { name: 'timeline.laneMenuAria' }));
  return lane;
};

describe('ProjectStatusReport inline report', () => {
  beforeEach(() => {
    fetchWeeklyAiResponsesMock.mockReset();
    updateWeeklyAiResponseMock.mockReset();
    vi.restoreAllMocks();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    });
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

  it('toggles the inline detailed report when the lane actions menu detail item is clicked twice', async () => {
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

    const lane = openLaneActionsMenu('timeline-lane-label-0');
    const detailButton = within(lane).getByRole('menuitem', { name: 'timeline.showDetailAria' });

    fireEvent.click(detailButton);

    await waitFor(() => expect(fetchWeeklyAiResponsesMock).toHaveBeenCalledTimes(1));
    const report = await waitFor(() => screen.getByTestId('timeline-inline-report-1:v1'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest'
    });
    expect(within(report).getByTestId('ai-section-view-highlights_this_week')).toBeTruthy();
    expect(within(report).queryByText('report.detailTitle')).toBeNull();
    expect(within(report).queryByText('report.aiSuffix')).toBeNull();
    expect(within(report).queryByText('eCookbook / v1')).toBeNull();

    fireEvent.click(within(openLaneActionsMenu('timeline-lane-label-0')).getByRole('menuitem', { name: 'timeline.showDetailAria' }));

    await waitFor(() => expect(screen.queryByTestId('timeline-inline-report-1:v1')).toBeNull());
    expect(fetchWeeklyAiResponsesMock).toHaveBeenCalledTimes(1);
  });

  it('keeps inline edits local until save is clicked and then updates the weekly AI response', async () => {
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
    updateWeeklyAiResponseMock.mockResolvedValue({
      saved: true,
      saved_at: '2026-03-10T11:00:00+09:00',
      response: {
        status: 'AVAILABLE',
        destination_issue_id: 123,
        saved_at: '2026-03-10T11:00:00+09:00',
        highlights_this_week: 'Edited highlights',
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

    fireEvent.click(within(openLaneActionsMenu('timeline-lane-label-0')).getByRole('menuitem', { name: 'timeline.showDetailAria' }));

    const report = await waitFor(() => screen.getByTestId('timeline-inline-report-1:v1'));
    const saveButton = within(report).getByRole('button', { name: 'common.save' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.click(within(report).getByTestId('ai-section-view-highlights_this_week'));
    const editor = within(report).getByTestId('ai-section-editor-highlights_this_week') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'Edited highlights' } });
    fireEvent.blur(editor);

    expect(updateWeeklyAiResponseMock).not.toHaveBeenCalled();
    expect(within(report).getByText('aiPanel.unsavedChanges')).toBeTruthy();
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);

    await waitFor(() => expect(updateWeeklyAiResponseMock).toHaveBeenCalledTimes(1));
    expect(updateWeeklyAiResponseMock).toHaveBeenCalledWith('ecookbook', expect.objectContaining({
      selected_project_identifier: 'ecookbook',
      version_id: 101,
      destination_issue_id: 123,
      highlights_this_week: 'Edited highlights',
      next_week_actions: 'Next actions',
      risks_decisions: 'Risks'
    }));
    await waitFor(() => expect(within(report).queryByText('aiPanel.unsavedChanges')).toBeNull());
    expect(within(report).getByText('aiPanel.saved')).toBeTruthy();
  });

  it('discards unsaved inline edits back to the fetched response', async () => {
    fetchWeeklyAiResponsesMock.mockResolvedValue({
      response: {
        status: 'AVAILABLE',
        destination_issue_id: 123,
        highlights_this_week: 'Original highlights',
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

    fireEvent.click(within(openLaneActionsMenu('timeline-lane-label-0')).getByRole('menuitem', { name: 'timeline.showDetailAria' }));
    const report = await waitFor(() => screen.getByTestId('timeline-inline-report-1:v1'));

    fireEvent.click(within(report).getByTestId('ai-section-view-highlights_this_week'));
    fireEvent.change(within(report).getByTestId('ai-section-editor-highlights_this_week'), { target: { value: 'Draft only' } });
    fireEvent.blur(within(report).getByTestId('ai-section-editor-highlights_this_week'));

    fireEvent.click(within(report).getByRole('button', { name: 'aiPanel.discardChanges' }));

    expect(updateWeeklyAiResponseMock).not.toHaveBeenCalled();
    expect(within(report).getByText('Original highlights')).toBeTruthy();
    expect(within(report).queryByText('Draft only')).toBeNull();
  });

  it('keeps edited text and asks for confirmation when closing a dirty detail report', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fetchWeeklyAiResponsesMock.mockResolvedValue({
      response: {
        status: 'AVAILABLE',
        destination_issue_id: 123,
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

    fireEvent.click(within(openLaneActionsMenu('timeline-lane-label-0')).getByRole('menuitem', { name: 'timeline.showDetailAria' }));
    const report = await waitFor(() => screen.getByTestId('timeline-inline-report-1:v1'));
    fireEvent.click(within(report).getByTestId('ai-section-view-highlights_this_week'));
    fireEvent.change(within(report).getByTestId('ai-section-editor-highlights_this_week'), { target: { value: 'Unsaved draft' } });
    fireEvent.blur(within(report).getByTestId('ai-section-editor-highlights_this_week'));

    fireEvent.click(within(openLaneActionsMenu('timeline-lane-label-0')).getByRole('menuitem', { name: 'timeline.showDetailAria' }));

    expect(confirmSpy).toHaveBeenCalledWith('aiPanel.confirmDiscard');
    expect(screen.getByTestId('timeline-inline-report-1:v1')).toBeTruthy();
    expect(within(report).getByText('Unsaved draft')).toBeTruthy();
  });

  it('does not show edit controls for not-saved responses', async () => {
    fetchWeeklyAiResponsesMock.mockResolvedValue({
      response: {
        status: 'NOT_SAVED',
        destination_issue_id: 0,
        message: 'not found'
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

    fireEvent.click(within(openLaneActionsMenu('timeline-lane-label-0')).getByRole('menuitem', { name: 'timeline.showDetailAria' }));
    const report = await waitFor(() => screen.getByTestId('timeline-inline-report-1:v1'));

    expect(within(report).getByText('aiPanel.notSaved')).toBeTruthy();
    expect(within(report).queryByRole('button', { name: 'common.save' })).toBeNull();
    expect(within(report).queryByTestId('ai-section-view-highlights_this_week')).toBeNull();
  });
});
