import React, { useState } from 'react';
import { t } from '../../i18n';
import { createIssue, BulkIssuePayload } from './bulkIssueApi';

interface BulkIssueRegistrationPanelProps {
  projectId: number;
  projectIdentifier: string;
  parentIssueId?: number;
}

type IssueRow = {
  id: string; // unique local ID for React key
  subject: string;
  status_id?: number;
  start_date: string;
  due_date: string;
  done_ratio: number;
  estimated_hours: string;
};

export const BulkIssueRegistrationPanel: React.FC<BulkIssueRegistrationPanelProps> = ({
  projectId,
  projectIdentifier,
  parentIssueId
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!parentIssueId) {
      alert('親チケットが保存されていません。まずはチケットを作成してください。');
      return;
    }

    const lines = bulkText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
      alert('登録するチケットの件名を入力してください。');
      return;
    }

    setIsSubmitting(true);
    try {
      for (const subject of lines) {
        const payload: BulkIssuePayload = { subject };
        await createIssue(projectIdentifier, parentIssueId, payload);
      }
      alert('一括登録が完了しました。');
      setBulkText('');
      setIsOpen(false);
    } catch (err: any) {
      alert(`エラーが発生しました: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-6 border-t border-slate-200 pt-4 pb-2" id="bulk-registration-accordion-container">
      <button
        type="button"
        className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold bg-transparent border-0 p-0 hover:text-blue-600 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span
          className="inline-block transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
        <span className="text-[13px]">チケット一括登録</span>
      </button>

      {isOpen && (
        <div className="mt-4">
          <textarea
            className="w-full h-32 p-3 border border-slate-300 rounded focus:outline-none focus:border-blue-500 font-mono text-[13px] bg-white text-slate-800"
            placeholder="作成するチケットの件名を1行に1つずつ入力してください..."
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-[13px] py-1.5 px-4 rounded shadow-sm transition-colors cursor-pointer"
              onClick={() => setIsOpen(false)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] py-1.5 px-4 rounded shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
              disabled={isSubmitting || bulkText.trim() === '' || !parentIssueId}
              onClick={handleSubmit}
            >
              {isSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
