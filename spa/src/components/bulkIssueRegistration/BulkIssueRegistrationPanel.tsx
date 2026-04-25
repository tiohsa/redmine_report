import React, { useState } from 'react';
import { t } from '../../i18n';
import { createIssue, BulkIssuePayload } from './bulkIssueApi';
import { reportStyles } from '../designSystem';

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
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  const handleSubmit = async (e: React.MouseEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!parentIssueId) {
      setFeedback({ type: 'error', text: t('bulkIssue.parentIssueRequired') });
      return;
    }

    const lines = bulkText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
      setFeedback({ type: 'error', text: t('bulkIssue.emptySubjects') });
      return;
    }

    setIsSubmitting(true);
    try {
      for (const subject of lines) {
        const payload: BulkIssuePayload = { subject };
        await createIssue(projectIdentifier, parentIssueId, payload);
      }
      setFeedback({ type: 'info', text: t('bulkIssue.success') });
      setBulkText('');
      setIsOpen(false);
    } catch (err: any) {
      setFeedback({ type: 'error', text: t('common.alertError', { message: err.message }) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-6 rounded-[24px] border border-gray-100 bg-white p-5 shadow-subtle" id="bulk-registration-accordion-container">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 font-semibold text-[#222222] transition-colors hover:text-[var(--color-primary-600)]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span
            className="inline-block transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
        <span className="text-[13px] uppercase tracking-[0.14em]">{t('bulkIssue.panelTitle')}</span>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4">
          {feedback ? (
            <div className={feedback.type === 'error' ? reportStyles.alertError : reportStyles.alertInfo} role="alert">
              {feedback.text}
            </div>
          ) : null}
          <textarea
            className={`${reportStyles.textarea} ${reportStyles.textareaMono} h-32 bg-[#f8fafc]`}
            placeholder={t('bulkIssue.placeholder')}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              className={reportStyles.pillSecondary}
              onClick={() => setIsOpen(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className={reportStyles.pillPrimary}
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
