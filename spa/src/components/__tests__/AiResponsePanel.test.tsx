import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiResponsePanel } from '../AiResponsePanel';

describe('AiResponsePanel', () => {
  it('renders three sections for available response', () => {
    render(
      <AiResponsePanel
        isLoading={false}
        errorMessage={null}
        response={{
          status: 'AVAILABLE',
          destination_issue_id: 10,
          highlights_this_week: '- 項目A\n- 項目B',
          next_week_actions: '**重要タスク**',
          risks_decisions: '1. リスク1'
        }}
      />
    );

    expect(screen.getByText('今週の主要実績')).toBeTruthy();
    expect(screen.getByText('来週の予定・アクション')).toBeTruthy();
    expect(screen.getByText('課題・リスク・決定事項')).toBeTruthy();
  });

  it('renders markdown as HTML', () => {
    const { container } = render(
      <AiResponsePanel
        isLoading={false}
        errorMessage={null}
        response={{
          status: 'AVAILABLE',
          destination_issue_id: 10,
          highlights_this_week: '- 項目A\n- **太字**',
          next_week_actions: null,
          risks_decisions: null
        }}
      />
    );

    const markdownBody = container.querySelector('.markdown-body');
    expect(markdownBody).toBeTruthy();
    expect(markdownBody!.innerHTML).toContain('<li>');
    expect(markdownBody!.innerHTML).toContain('<strong>');
  });

  it('renders not-saved message', () => {
    render(
      <AiResponsePanel
        isLoading={false}
        errorMessage={null}
        response={{ status: 'NOT_SAVED', destination_issue_id: 0 }}
      />
    );

    expect(screen.getByText('保存済みレスポンスがありません')).toBeTruthy();
  });

  it('renders partial state indicator', () => {
    render(
      <AiResponsePanel
        isLoading={false}
        errorMessage={null}
        response={{
          status: 'PARTIAL',
          destination_issue_id: 20,
          highlights_this_week: '- A',
          next_week_actions: null,
          risks_decisions: null
        }}
      />
    );

    expect(screen.getByText('一部セクションが未保存です')).toBeTruthy();
  });

  it('shows 情報なし for empty sections', () => {
    render(
      <AiResponsePanel
        isLoading={false}
        errorMessage={null}
        response={{
          status: 'AVAILABLE',
          destination_issue_id: 10,
          highlights_this_week: null,
          next_week_actions: null,
          risks_decisions: null
        }}
      />
    );

    const emptyMessages = screen.getAllByText('情報なし');
    expect(emptyMessages.length).toBe(3);
  });

  it('renders error alert and clears content on fetch failure', () => {
    render(
      <AiResponsePanel
        isLoading={false}
        errorMessage="取得に失敗しました"
        response={{
          status: 'FETCH_FAILED',
          destination_issue_id: 0,
          highlights_this_week: 'old value',
          message: '取得に失敗しました'
        }}
      />
    );

    expect(screen.getByRole('alert').textContent).toContain('取得に失敗しました');
    expect(screen.queryByText('old value')).toBeNull();
  });

  it('allows inline editing by clicking a section box', () => {
    render(
      <AiResponsePanel
        isLoading={false}
        errorMessage={null}
        response={{
          status: 'AVAILABLE',
          destination_issue_id: 10,
          highlights_this_week: '- 項目A',
          next_week_actions: null,
          risks_decisions: null
        }}
      />
    );

    fireEvent.click(screen.getByTestId('ai-section-view-highlights_this_week'));

    const editor = screen.getByTestId('ai-section-editor-highlights_this_week') as HTMLTextAreaElement;
    expect(editor.value).toBe('- 項目A');

    fireEvent.change(editor, { target: { value: '- 項目A\n- 項目B' } });
    fireEvent.blur(editor);

    expect(screen.queryByTestId('ai-section-editor-highlights_this_week')).toBeNull();
    expect(screen.getByText('項目B')).toBeTruthy();
  });

  it('keeps edits and shows only the save error when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('週次AIレスポンスの更新に失敗しました: 403'));

    render(
      <AiResponsePanel
        isLoading={false}
        errorMessage={null}
        onSave={onSave}
        response={{
          status: 'AVAILABLE',
          destination_issue_id: 10,
          highlights_this_week: 'Original highlights',
          next_week_actions: 'Next actions',
          risks_decisions: 'Risks'
        }}
      />
    );

    fireEvent.click(screen.getByTestId('ai-section-view-highlights_this_week'));
    const editor = screen.getByTestId('ai-section-editor-highlights_this_week') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'Edited highlights' } });
    fireEvent.blur(editor);

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('週次AIレスポンスの更新に失敗しました: 403'));
    expect(screen.queryByText('未保存の変更があります')).toBeNull();
    expect(screen.getByText('Edited highlights')).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
