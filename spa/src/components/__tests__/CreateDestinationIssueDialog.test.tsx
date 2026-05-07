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

  it('prefills the detailed report subject and description in the embedded issue form URL', () => {
    render(
      <CreateDestinationIssueDialog
        projectIdentifier="ecookbook"
        onClose={() => undefined}
      />
    );

    const iframe = screen.getByTitle('新規チケット登録') as HTMLIFrameElement;
    const url = new URL(iframe.src, window.location.origin);

    expect(url.pathname).toBe('/projects/ecookbook/issues/new');
    expect(url.searchParams.get('issue[subject]')).toBe('詳細レポートのチケット');
    expect(url.searchParams.get('issue[description]')).toBe('詳細レポートの保存用のチケットです。');
  });

  it('uses compact canvas-gantt dialog chrome for header and footer buttons', () => {
    render(
      <CreateDestinationIssueDialog
        projectIdentifier="ecookbook"
        onClose={() => undefined}
      />
    );

    const header = screen.getByTestId('destination-issue-dialog-header');
    const footer = screen.getByTestId('destination-issue-dialog-footer');
    const openButton = screen.getByRole('link', { name: '新しいタブで開く' });
    const closeButton = screen.getByRole('button', { name: '新規チケット作成ダイアログを閉じる' });
    const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
    const saveButton = screen.getByRole('button', { name: '保存' });

    expect(header).toBeTruthy();
    expect(footer.className).toContain('justify-start');
    expect(openButton.getAttribute('style')).toContain('width: 32px');
    expect(openButton.getAttribute('style')).toContain('height: 32px');
    expect(openButton.getAttribute('style')).toContain('border-radius: 6px');
    expect(closeButton.getAttribute('style')).toContain('width: 32px');
    expect(closeButton.getAttribute('style')).toContain('height: 32px');
    expect(closeButton.getAttribute('style')).toContain('border-radius: 6px');
    expect(cancelButton.className).toContain('!h-8');
    expect(cancelButton.className).toContain('!rounded-[6px]');
    expect(cancelButton.getAttribute('style')).toContain('min-width: 88px');
    expect(saveButton.className).toContain('!h-8');
    expect(saveButton.className).toContain('!rounded-[6px]');
    expect(saveButton.getAttribute('style')).toContain('min-width: 88px');
  });
});
