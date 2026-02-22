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
      alert(t('bulkIssue.parentIssueRequired'));
      return;
    }

    const lines = bulkText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
      alert(t('bulkIssue.emptySubjects'));
      return;
    }

    setIsSubmitting(true);
    try {
      for (const subject of lines) {
        const payload: BulkIssuePayload = { subject };
        await createIssue(projectIdentifier, parentIssueId, payload);
      }
      alert(t('bulkIssue.success'));
      setBulkText('');
      setIsOpen(false);
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
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
        <span className="text-[13px]">{t('bulkIssue.panelTitle')}</span>
      </button>

      {isOpen && (
        <div className="mt-4">
          <textarea
            className="w-full h-32 p-3 border border-slate-300 rounded focus:outline-none focus:border-blue-500 font-mono text-[13px] bg-white text-slate-800"
            placeholder={t('bulkIssue.placeholder')}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-[13px] py-1.5 px-4 rounded shadow-sm transition-colors cursor-pointer"
              onClick={() => setIsOpen(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] py-1.5 px-4 rounded shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
              disabled={isSubmitting || bulkText.trim() === '' || !parentIssueId}
              onClick={handleSubmit}
            >
              {isSubmitting ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
