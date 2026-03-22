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

  it('prefills AI comment subject and description in the embedded issue form URL', () => {
    render(
      <CreateDestinationIssueDialog
        projectIdentifier="ecookbook"
        onClose={() => undefined}
      />
    );

    const iframe = screen.getByTitle('新規チケット登録') as HTMLIFrameElement;
    const url = new URL(iframe.src, window.location.origin);

    expect(url.pathname).toBe('/projects/ecookbook/issues/new');
    expect(url.searchParams.get('issue[subject]')).toBe('生成AIコメント');
    expect(url.searchParams.get('issue[description]')).toBe('生成AIのレスポンス保存用のチケットです。');
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
    expect(openButton.getAttribute('style')).toContain('width: 24px');
    expect(openButton.getAttribute('style')).toContain('height: 24px');
    expect(closeButton.getAttribute('style')).toContain('width: 24px');
    expect(closeButton.getAttribute('style')).toContain('height: 24px');
    expect(cancelButton.getAttribute('style')).toContain('height: 28px');
    expect(cancelButton.getAttribute('style')).toContain('min-width: 88px');
    expect(saveButton.getAttribute('style')).toContain('height: 28px');
    expect(saveButton.getAttribute('style')).toContain('min-width: 88px');
  });
});
