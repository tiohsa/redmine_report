import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectStatusReportToolbar } from '../projectStatusReport/ProjectStatusReportToolbar';

const makeProps = (overrides: Partial<ReturnType<typeof makePropsBase>> = {}) => ({
  ...makePropsBase(),
  ...overrides
});

const makePropsBase = () => ({
  availableProjects: [],
  selectedProjectIdentifiers: [],
  selectableProjectIdentifiers: [],
  allSelectableProjectsSelected: false,
  onSetSelectedProjectIdentifiers: vi.fn(),
  onToggleProject: vi.fn(),
  allVersions: ['v1', 'v2', 'v3'],
  selectedVersions: ['v1', 'v2', 'v3'],
  allVersionsSelected: true,
  onVersionChange: vi.fn(),
  onVersionOrderChange: vi.fn(),
  allowVersionOrderPersist: true,
  chartScale: 1,
  onChartScaleChange: vi.fn(),
  showAllDates: true,
  onShowAllDatesChange: vi.fn(),
  showTodayLine: true,
  onShowTodayLineChange: vi.fn(),
  isProcessMode: false,
  isLoadingChildren: false,
  onProcessModeChange: vi.fn(),
  statuses: [],
  isProjectOpen: false,
  onProjectOpenChange: vi.fn(),
  isVersionOpen: true,
  onVersionOpenChange: vi.fn(),
  isSizeOpen: false,
  onSizeOpenChange: vi.fn(),
  isLegendOpen: false,
  onLegendOpenChange: vi.fn(),
  projectDropdownRef: { current: null },
  versionDropdownRef: { current: null },
  sizeDropdownRef: { current: null },
  legendDropdownRef: { current: null },
  isDateRangeDialogOpen: false,
  isCustomDateRangeActive: false,
  onOpenDateRangeDialog: vi.fn(),
  onCloseDateRangeDialog: vi.fn(),
  onClearDateRange: vi.fn(),
  onApplyDateRange: vi.fn(),
  pendingStartDate: '',
  pendingEndDate: '',
  onPendingStartDateChange: vi.fn(),
  onPendingEndDateChange: vi.fn(),
  dateRangeError: null,
  onToggleFullScreen: vi.fn()
});

describe('ProjectStatusReportToolbar version drag', () => {
  it('calls onVersionOrderChange after drag and drop', () => {
    const props = makeProps();
    render(<ProjectStatusReportToolbar {...props} />);

    const handles = screen.getAllByRole('button', { name: /reorder/i });
    fireEvent.dragStart(handles[0], {
      dataTransfer: {
        effectAllowed: '',
        setData: vi.fn()
      }
    });

    const targetRow = screen.getByText('v2').closest('.report-version-drag-row');
    expect(targetRow).not.toBeNull();
    fireEvent.dragOver(targetRow!, {
      dataTransfer: {
        dropEffect: ''
      }
    });
    fireEvent.drop(targetRow!, {
      dataTransfer: {
        getData: () => '0'
      }
    });

    expect(props.onVersionOrderChange).toHaveBeenCalledTimes(1);
    expect(props.onVersionOrderChange).toHaveBeenCalledWith(['v2', 'v1', 'v3']);
  });

  it('moves the last version to the first row', () => {
    const props = makeProps();
    render(<ProjectStatusReportToolbar {...props} />);

    const handles = screen.getAllByRole('button', { name: /reorder/i });
    fireEvent.dragStart(handles[2], {
      dataTransfer: {
        effectAllowed: '',
        setData: vi.fn()
      }
    });

    const targetRow = screen.getByText('v1').closest('.report-version-drag-row');
    expect(targetRow).not.toBeNull();
    fireEvent.dragOver(targetRow!, {
      dataTransfer: {
        dropEffect: ''
      }
    });
    fireEvent.drop(targetRow!, {
      dataTransfer: {
        getData: () => '2'
      }
    });

    expect(props.onVersionOrderChange).toHaveBeenCalledTimes(1);
    expect(props.onVersionOrderChange).toHaveBeenCalledWith(['v3', 'v1', 'v2']);
  });

  it('moves a dragged version to the end when dropped on the list container', () => {
    const props = makeProps();
    render(<ProjectStatusReportToolbar {...props} />);

    const handles = screen.getAllByRole('button', { name: /reorder/i });
    fireEvent.dragStart(handles[0], {
      dataTransfer: {
        effectAllowed: '',
        setData: vi.fn()
      }
    });

    const versionList = screen.getByText('v2').closest('.report-version-drag-row')?.parentElement;
    expect(versionList).not.toBeNull();
    fireEvent.dragOver(versionList!, {
      dataTransfer: {
        dropEffect: ''
      }
    });
    fireEvent.drop(versionList!, {
      dataTransfer: {
        getData: () => '0'
      }
    });

    expect(props.onVersionOrderChange).toHaveBeenCalledTimes(1);
    expect(props.onVersionOrderChange).toHaveBeenCalledWith(['v2', 'v3', 'v1']);
  });

  it('does not reorder when drag data is invalid', () => {
    const props = makeProps();
    render(<ProjectStatusReportToolbar {...props} />);

    const handles = screen.getAllByRole('button', { name: /reorder/i });
    fireEvent.dragStart(handles[0], {
      dataTransfer: {
        effectAllowed: '',
        setData: vi.fn()
      }
    });

    const targetRow = screen.getByText('v2').closest('.report-version-drag-row');
    expect(targetRow).not.toBeNull();
    fireEvent.drop(targetRow!, {
      dataTransfer: {
        getData: () => 'not-a-number'
      }
    });

    expect(props.onVersionOrderChange).not.toHaveBeenCalled();
  });

  it('does not call onVersionOrderChange for selection controls', () => {
    const props = makeProps();
    render(<ProjectStatusReportToolbar {...props} />);

    fireEvent.click(screen.getByText(/select all|すべて選択/i));
    fireEvent.click(screen.getByText('v1'));
    fireEvent.click(screen.getByText(/clear|クリア/i));

    expect(props.onVersionOrderChange).not.toHaveBeenCalled();
  });

  it('applies reorder on explicit row drop even when persist is disabled for multi-project selection', () => {
    const props = makeProps({ allowVersionOrderPersist: false });
    render(<ProjectStatusReportToolbar {...props} />);

    const handles = screen.getAllByRole('button', { name: /reorder/i });
    fireEvent.dragStart(handles[0], {
      dataTransfer: {
        effectAllowed: '',
        setData: vi.fn()
      }
    });

    const targetRow = screen.getByText('v2').closest('.report-version-drag-row');
    expect(targetRow).not.toBeNull();
    fireEvent.dragOver(targetRow!, {
      dataTransfer: {
        dropEffect: ''
      }
    });
    fireEvent.drop(targetRow!, {
      dataTransfer: {
        getData: () => '0'
      }
    });

    expect(props.onVersionOrderChange).toHaveBeenCalledTimes(1);
    expect(props.onVersionOrderChange).toHaveBeenCalledWith(['v2', 'v1', 'v3']);
    expect(
      screen.getByText(/drop on a specific row to apply reordering/i)
    ).not.toBeNull();
  });

  it('does not apply reorder when persist is disabled and dropped on list container', () => {
    const props = makeProps({ allowVersionOrderPersist: false });
    render(<ProjectStatusReportToolbar {...props} />);

    const handles = screen.getAllByRole('button', { name: /reorder/i });
    fireEvent.dragStart(handles[0], {
      dataTransfer: {
        effectAllowed: '',
        setData: vi.fn()
      }
    });

    const versionList = screen.getByText('v2').closest('.report-version-drag-row')?.parentElement;
    expect(versionList).not.toBeNull();
    fireEvent.dragOver(versionList!, {
      dataTransfer: {
        dropEffect: ''
      }
    });
    fireEvent.drop(versionList!, {
      dataTransfer: {
        getData: () => '0'
      }
    });

    expect(props.onVersionOrderChange).not.toHaveBeenCalled();
  });
});
