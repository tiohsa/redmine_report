import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
  TaskDetailsDialog: () => null
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

const renderTimelineChart = (activeReportLaneKey?: string | null) =>
  render(
    <TimelineChart
      timelineData={[
        makeLane({ laneKey: '1:v1', versionName: 'v1', projectName: 'Alpha' }),
        makeLane({ laneKey: '1:v2', versionName: 'v2', projectName: 'Beta' }),
        makeLane({ laneKey: '2:v3', versionName: 'v3', projectName: 'Gamma', projectId: 2, projectIdentifier: 'gamma' })
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
      activeReportLaneKey={activeReportLaneKey}
    />
  );

describe('TimelineChart', () => {
  it('applies alternating backgrounds to lane labels and svg rows', () => {
    renderTimelineChart();

    expect(screen.getByTestId('timeline-lane-label-0').className).toContain('bg-white');
    expect(screen.getByTestId('timeline-lane-label-1').className).toContain('bg-slate-50/80');
    expect(screen.getByTestId('timeline-lane-label-2').className).toContain('bg-white');

    expect(screen.getByTestId('timeline-lane-bg-0').getAttribute('fill')).toBe('#ffffff');
    expect(screen.getByTestId('timeline-lane-bg-1').getAttribute('fill')).toBe('#f8fafc');
    expect(screen.getByTestId('timeline-lane-bg-2').getAttribute('fill')).toBe('#ffffff');
  });

  it('keeps active lane highlight above alternating backgrounds', () => {
    renderTimelineChart('1:v2');

    expect(screen.getByTestId('timeline-lane-label-1').className).toContain('bg-blue-50/70');
    expect(screen.getByTestId('timeline-lane-bg-1').getAttribute('fill')).toBe('#f8fafc');

    const activeOverlay = screen.getByTestId('timeline-lane-active-bg-1');
    expect(activeOverlay.getAttribute('fill')).toBe('#eff6ff');
    expect(activeOverlay.getAttribute('opacity')).toBe('0.7');
  });
});
