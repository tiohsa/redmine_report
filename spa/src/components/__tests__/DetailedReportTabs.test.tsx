import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DetailedReportTabs } from '../DetailedReportTabs';

describe('DetailedReportTabs', () => {
  const tabs = [
    {
      project_identifier: 'alpha',
      project_name: 'Alpha',
      active: true,
      versions: [
        { version_id: 1, version_name: 'v1', active: true, has_saved_response: true },
        { version_id: 2, version_name: 'v2', active: false, has_saved_response: false }
      ]
    },
    {
      project_identifier: 'beta',
      project_name: 'Beta',
      active: false,
      versions: [{ version_id: 3, version_name: 'v3', active: false, has_saved_response: true }]
    }
  ];

  it('renders project and version tabs and triggers callbacks', () => {
    const onProjectChange = vi.fn();
    const onVersionChange = vi.fn();

    render(
      <DetailedReportTabs
        projectTabs={tabs}
        selectedProjectIdentifier="alpha"
        selectedVersionId={1}
        onProjectChange={onProjectChange}
        onVersionChange={onVersionChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onProjectChange).toHaveBeenCalledWith('beta');

    fireEvent.click(screen.getByRole('button', { name: 'v2' }));
    expect(onVersionChange).toHaveBeenCalledWith(2);
  });
});
