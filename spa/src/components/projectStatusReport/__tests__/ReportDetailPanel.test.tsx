import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ReportDetailPanel } from '../ReportDetailPanel';
import type { ReportPreset } from '../../../services/reportPresetStorage';
import type { ReportDetailResponse } from '../../../services/reportDetailApi';

// Mock the API module
vi.mock('../../../services/reportDetailApi', () => ({
  fetchReportDetail: vi.fn(),
  updateReportDetail: vi.fn(),
  buildTargetsFromPreset: vi.fn((targets: Array<{ projectId: number; versionId: number }>) =>
    targets.map((t) => ({ project_id: t.projectId, version_id: t.versionId }))
  )
}));

// Mock BindReportDetailIssueDialog
vi.mock('../BindReportDetailIssueDialog', () => ({
  BindReportDetailIssueDialog: () => <div data-testid="bind-dialog">Bind Dialog</div>
}));

import { fetchReportDetail, updateReportDetail } from '../../../services/reportDetailApi';

const mockFetchReportDetail = vi.mocked(fetchReportDetail);
const mockUpdateReportDetail = vi.mocked(updateReportDetail);

const createPreset = (overrides: Partial<ReportPreset> = {}): ReportPreset => ({
  id: 'preset-1',
  name: 'Test Preset',
  targets: [
    { projectId: 1, projectIdentifier: 'proj-a', projectName: 'Project A', versionId: 10, versionName: 'v1.0' }
  ],
  detailReportIssueId: 200,
  detailReportIssueStatus: 'VALID',
  detailReportIssueValidatedAt: '2026-05-03T00:00:00Z',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  ...overrides
});

const availableResponse: ReportDetailResponse = {
  status: 'AVAILABLE',
  saved_at: '2026-05-03T15:08:57Z',
  highlights_this_week: ['Achievement 1', 'Achievement 2'],
  next_week_actions: ['Plan A'],
  risks: ['Risk X'],
  decisions: ['Decision Y'],
  destination_issue_id: 200
};

const notSavedResponse: ReportDetailResponse = {
  status: 'NOT_SAVED',
  saved_at: null,
  highlights_this_week: ['該当なし'],
  next_week_actions: ['該当なし'],
  risks: ['該当なし'],
  decisions: ['該当なし'],
  destination_issue_id: 200
};

describe('ReportDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchReportDetail.mockResolvedValue(availableResponse);
  });

  it('renders three cards', async () => {
    render(
      <ReportDetailPanel
        rootProjectIdentifier="root"
        rootProjectId={1}
        activePreset={createPreset()}
        onPresetChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('detail-card-fact')).toBeInTheDocument();
      expect(screen.getByTestId('detail-card-next')).toBeInTheDocument();
      expect(screen.getByTestId('detail-card-decision')).toBeInTheDocument();
    });
  });

  it('fetches and renders rows from API', async () => {
    render(
      <ReportDetailPanel
        rootProjectIdentifier="root"
        rootProjectId={1}
        activePreset={createPreset()}
        onPresetChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockFetchReportDetail).toHaveBeenCalledOnce();
    });

    // Check that rows are rendered
    await waitFor(() => {
      expect(screen.getByTestId('detail-input-fact-0')).toHaveValue('Achievement 1');
      expect(screen.getByTestId('detail-input-fact-1')).toHaveValue('Achievement 2');
      expect(screen.getByTestId('detail-input-next-0')).toHaveValue('Plan A');
    });
  });

  it('shows save button disabled when not dirty', async () => {
    render(
      <ReportDetailPanel
        rootProjectIdentifier="root"
        rootProjectId={1}
        activePreset={createPreset()}
        onPresetChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('detail-input-fact-0')).toBeInTheDocument();
    });

    const saveBtn = screen.getByTestId('save-detail-btn');
    expect(saveBtn).toBeDisabled();
  });

  it('enables save and shows unsaved indicator when row is edited', async () => {
    const onDirty = vi.fn();
    render(
      <ReportDetailPanel
        rootProjectIdentifier="root"
        rootProjectId={1}
        activePreset={createPreset()}
        onPresetChange={vi.fn()}
        onDirtyStateChange={onDirty}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('detail-input-fact-0')).toBeInTheDocument();
    });

    // Edit a row
    fireEvent.change(screen.getByTestId('detail-input-fact-0'), { target: { value: 'Edited' } });

    await waitFor(() => {
      expect(screen.getByTestId('save-detail-btn')).not.toBeDisabled();
      expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument();
    });

    expect(onDirty).toHaveBeenCalledWith(true);
  });

  it('allows adding a row', async () => {
    render(
      <ReportDetailPanel
        rootProjectIdentifier="root"
        rootProjectId={1}
        activePreset={createPreset()}
        onPresetChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('detail-card-fact')).toBeInTheDocument();
    });

    const factCard = screen.getByTestId('detail-card-fact');
    const addBtn = within(factCard).getByTestId('detail-add-fact');
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByTestId('detail-input-fact-2')).toBeInTheDocument();
    });
  });

  it('allows deleting a row', async () => {
    render(
      <ReportDetailPanel
        rootProjectIdentifier="root"
        rootProjectId={1}
        activePreset={createPreset()}
        onPresetChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('detail-input-fact-1')).toBeInTheDocument();
    });

    // Delete second row
    fireEvent.click(screen.getByTestId('detail-delete-fact-1'));

    await waitFor(() => {
      expect(screen.queryByTestId('detail-input-fact-1')).not.toBeInTheDocument();
    });
  });

  it('sends normalized rows on save', async () => {
    mockUpdateReportDetail.mockResolvedValue({
      saved: true,
      revision: 1,
      saved_at: '2026-05-03T16:00:00Z',
      destination_issue_id: 200
    });

    render(
      <ReportDetailPanel
        rootProjectIdentifier="root"
        rootProjectId={1}
        activePreset={createPreset()}
        onPresetChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('detail-input-fact-0')).toBeInTheDocument();
    });

    // Edit a row to make dirty
    fireEvent.change(screen.getByTestId('detail-input-fact-0'), { target: { value: 'Updated' } });

    await waitFor(() => {
      expect(screen.getByTestId('save-detail-btn')).not.toBeDisabled();
    });

    // Click save
    fireEvent.click(screen.getByTestId('save-detail-btn'));

    await waitFor(() => {
      expect(mockUpdateReportDetail).toHaveBeenCalledOnce();
    });

    const payload = mockUpdateReportDetail.mock.calls[0][1];
    expect(payload.destination_issue_id).toBe(200);
    expect(payload.highlights_this_week).toContain('Updated');
    expect(payload.risks).toBeDefined();
    expect(payload.decisions).toBeDefined();
  });

  it('shows unbound state when no issue is linked', async () => {
    const preset = createPreset({
      detailReportIssueId: null,
      detailReportIssueStatus: 'UNBOUND'
    });

    render(
      <ReportDetailPanel
        rootProjectIdentifier="root"
        rootProjectId={1}
        activePreset={preset}
        onPresetChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('report-detail-unbound')).toBeInTheDocument();
    });
  });

  it('shows default rows when API returns NOT_SAVED', async () => {
    mockFetchReportDetail.mockResolvedValue(notSavedResponse);

    render(
      <ReportDetailPanel
        rootProjectIdentifier="root"
        rootProjectId={1}
        activePreset={createPreset()}
        onPresetChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('detail-input-fact-0')).toHaveValue('該当なし');
    });
  });

  it('shows error when fetch fails', async () => {
    mockFetchReportDetail.mockRejectedValue(new Error('Network error'));

    render(
      <ReportDetailPanel
        rootProjectIdentifier="root"
        rootProjectId={1}
        activePreset={createPreset()}
        onPresetChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
