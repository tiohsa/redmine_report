import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineChart } from '../projectStatusReport/TimelineChart';
import type { TimelineLane } from '../projectStatusReport/timeline';

vi.mock('../../i18n', async () => {
  const actual = await vi.importActual<typeof import('../../i18n')>('../../i18n');
  return {
    ...actual,
    t: (key: string) => key
  };
});

vi.mock('../projectStatusReport/TaskDetailsDialog', () => ({
  TaskDetailsDialog: ({ open, issueId }: { open?: boolean; issueId?: number }) =>
    open ? <div data-testid="mock-task-details-dialog">Issue {issueId}</div> : null
}));

const makeLane = (overrides: Partial<TimelineLane> = {}): TimelineLane => ({
  laneKey: '1:v1',
  projectId: 1,
  projectIdentifier: 'alpha',
  projectName: 'Alpha',
  versionName: 'v1',
  steps: [],
  ...overrides
});

const renderTimelineChart = () =>
  render(
    <TimelineChart
      timelineData={[
        makeLane({ laneKey: '1:v1', versionName: 'v1', projectName: 'Alpha', versionId: 101 }),
        makeLane({ laneKey: '1:v2', versionName: 'v2', projectName: 'Beta', versionId: 102 }),
        makeLane({ laneKey: '2:v3', versionName: 'v3', projectName: 'Gamma', projectId: 2, projectIdentifier: 'gamma', versionId: 103 })
      ]}
      timelineWidth={480}
      headerMonths={[{ label: 'Mar', x: 0, width: 480 }]}
      headerYears={[{ year: '2026', x: 0, width: 480 }]}
      todayX={-1}
      axisStartDateIso="2026-03-01"
      axisEndDateIso="2026-03-31"
      pixelsPerDay={16}
      containerRef={createRef<HTMLDivElement>()}
      projectIdentifier="alpha"
      showTodayLine={false}
    />
  );
  

describe('TimelineChart', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    });
  });

  it('renders the canvas layer and keeps lane labels styled', () => {
    renderTimelineChart();

    expect(screen.getByTestId('timeline-chart-canvas')).toBeTruthy();
    expect(screen.getByTestId('timeline-lane-label-0').className).toContain('bg-white');
    expect(screen.getByTestId('timeline-lane-label-1').className).toContain('bg-white');
    expect(screen.getByTestId('timeline-lane-label-2').className).toContain('bg-white');
    expect(screen.queryByTestId('timeline-lane-bg-0')).toBeNull();
    expect(screen.queryByTestId('timeline-lane-active-bg-1')).toBeNull();
  });

  it('does not render lane action menus after the refactor', () => {
    renderTimelineChart();

    const lane = screen.getByTestId('timeline-lane-label-1');
    expect(within(lane).queryByRole('menu')).toBeNull();
    expect(within(lane).queryByRole('button', { name: /timeline\.laneMenuAria/ })).toBeNull();
  });

  it('uses move cursor for draggable process arrows', () => {
    const { container } = render(
      <TimelineChart
        timelineData={[
          makeLane({
            steps: [
              {
                issueId: 11,
                name: 'Design',
                x: 0,
                width: 120,
                status: {
                  code: 'IN_PROGRESS',
                  fill: '#253248',
                  text: '#ffffff',
                  stroke: '#1c2433',
                  label: 'status.inProgress',
                  accent: '#f97316',
                  progressText: '#1f2937',
                  dateText: '#475569',
                  textStroke: 'transparent',
                  textStrokeWidth: '0px'
                },
                progress: 40,
                id: 'ticket-1-11-0',
                startDateIso: '2026-03-03',
                endDateIso: '2026-03-10',
                editable: true
              }
            ]
          })
        ]}
        timelineWidth={480}
        headerMonths={[{ label: 'Mar', x: 0, width: 480 }]}
        headerYears={[{ year: '2026', x: 0, width: 480 }]}
        todayX={-1}
        axisStartDateIso="2026-03-01"
        axisEndDateIso="2026-03-31"
        pixelsPerDay={16}
        containerRef={createRef<HTMLDivElement>()}
        projectIdentifier="alpha"
        isProcessMode
        showTodayLine={false}
      />
    );

    const hitArea = container.querySelector('rect[data-step-id="ticket-1-11-0"]');
    expect(hitArea).toBeTruthy();
    expect(hitArea?.getAttribute('style')).toContain('cursor: move;');
  });

  it('selects a report bar on single click without opening the dialog', () => {
    const { container } = render(
      <TimelineChart
        timelineData={[
          makeLane({
            steps: [
              {
                issueId: 11,
                name: 'Design',
                x: 0,
                width: 120,
                status: {
                  code: 'IN_PROGRESS',
                  fill: '#253248',
                  text: '#ffffff',
                  stroke: '#1c2433',
                  label: 'status.inProgress',
                  accent: '#f97316',
                  progressText: '#1f2937',
                  dateText: '#475569',
                  textStroke: 'transparent',
                  textStrokeWidth: '0px'
                },
                progress: 40,
                id: 'ticket-1-11-0',
                startDateIso: '2026-03-03',
                endDateIso: '2026-03-10'
              }
            ]
          })
        ]}
        timelineWidth={480}
        headerMonths={[{ label: 'Mar', x: 0, width: 480 }]}
        headerYears={[{ year: '2026', x: 0, width: 480 }]}
        todayX={-1}
        axisStartDateIso="2026-03-01"
        axisEndDateIso="2026-03-31"
        pixelsPerDay={16}
        containerRef={createRef<HTMLDivElement>()}
        projectIdentifier="alpha"
        showTodayLine={false}
      />
    );

    const hitArea = container.querySelector('rect[data-step-id="ticket-1-11-0"]');
    expect(hitArea?.getAttribute('data-selected')).toBe('false');

    if (!hitArea) throw new Error('step hit area not found');
    fireEvent.click(hitArea);

    expect(container.querySelector('rect[data-step-id="ticket-1-11-0"]')?.getAttribute('data-selected')).toBe('true');
    expect(screen.queryByTestId('mock-task-details-dialog')).toBeNull();
  });

  it('opens the task details dialog on double click', () => {
    const { container } = render(
      <TimelineChart
        timelineData={[
          makeLane({
            steps: [
              {
                issueId: 11,
                name: 'Design',
                x: 0,
                width: 120,
                status: {
                  code: 'IN_PROGRESS',
                  fill: '#253248',
                  text: '#ffffff',
                  stroke: '#1c2433',
                  label: 'status.inProgress',
                  accent: '#f97316',
                  progressText: '#1f2937',
                  dateText: '#475569',
                  textStroke: 'transparent',
                  textStrokeWidth: '0px'
                },
                progress: 40,
                id: 'ticket-1-11-0',
                startDateIso: '2026-03-03',
                endDateIso: '2026-03-10'
              }
            ]
          })
        ]}
        timelineWidth={480}
        headerMonths={[{ label: 'Mar', x: 0, width: 480 }]}
        headerYears={[{ year: '2026', x: 0, width: 480 }]}
        todayX={-1}
        axisStartDateIso="2026-03-01"
        axisEndDateIso="2026-03-31"
        pixelsPerDay={16}
        containerRef={createRef<HTMLDivElement>()}
        projectIdentifier="alpha"
        showTodayLine={false}
      />
    );

    const hitArea = container.querySelector('rect[data-step-id="ticket-1-11-0"]');
    if (!hitArea) throw new Error('step hit area not found');

    fireEvent.doubleClick(hitArea);

    expect(screen.getByTestId('mock-task-details-dialog').textContent).toContain('Issue 11');
  });
});
