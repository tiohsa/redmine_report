import { render, screen } from '@testing-library/react';
import { TaskBar } from '../TaskBar';
import type { TimelineBar } from '../../../services/TimelineService';

const makeBar = (overrides: Partial<TimelineBar> = {}): TimelineBar => ({
  bar_key: 'bar-1',
  project_id: 1,
  category_id: 10,
  category_name: 'Category Name',
  ticket_subject: 'Ticket Subject',
  start_date: '2026-02-01',
  end_date: '2026-02-10',
  issue_count: 1,
  delayed_issue_count: 0,
  progress_rate: 50,
  is_delayed: false,
  dependencies: [],
  leftPct: 10,
  widthPct: 20,
  laneIndex: 0,
  ...overrides,
});

describe('TaskBar', () => {
  it('uses ticket subject for hover title when available', () => {
    render(<TaskBar bar={makeBar()} projectIdentifier="demo" />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('title')).toBe('Ticket Subject');
  });

  it('falls back to category name when ticket subject is missing', () => {
    render(
      <TaskBar
        bar={makeBar({ ticket_subject: undefined, category_name: 'Fallback Category' })}
        projectIdentifier="demo"
      />
    );

    const link = screen.getByRole('link');
    expect(link.getAttribute('title')).toBe('Fallback Category');
  });
});
