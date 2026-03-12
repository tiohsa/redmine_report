import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreateDestinationIssueDialog } from '../projectStatusReport/CreateDestinationIssueDialog';

describe('CreateDestinationIssueDialog', () => {
  it('left-aligns cancel and save buttons in the footer', () => {
    render(
      <CreateDestinationIssueDialog
        projectIdentifier="ecookbook"
        onClose={() => undefined}
      />
    );

    const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
    const saveButton = screen.getByRole('button', { name: '保存' });
    const footerActions = cancelButton.parentElement;

    expect(saveButton).toBeTruthy();
    expect(footerActions?.className).toContain('justify-start');
    expect(footerActions?.className).not.toContain('justify-end');
  });
});
