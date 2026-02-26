import { useEffect, useState } from 'react';
import { renderMarkdown } from '../utils/markdownRenderer';
import type { AiResponseView } from '../types/weeklyReport';
import { t } from '../i18n';

type AiResponsePanelProps = {
  response: AiResponseView | null;
  isLoading: boolean;
  errorMessage: string | null;
};

type EditableSectionKey = 'highlights_this_week' | 'next_week_actions' | 'risks_decisions';

type EditableSections = Record<EditableSectionKey, string>;

const Section = ({
  title,
  body,
  headerColor,
  sectionKey,
  isEditing,
  onStartEdit,
  onChange,
  onFinishEdit
}: {
  title: string;
  body: string;
  headerColor: string;
  sectionKey: EditableSectionKey;
  isEditing: boolean;
  onStartEdit: (key: EditableSectionKey) => void;
  onChange: (key: EditableSectionKey, value: string) => void;
  onFinishEdit: () => void;
}) => {
  const html = renderMarkdown(body);

  return (
    <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col h-full bg-white">
      <div
        className={`${headerColor} p-3 text-white text-md font-bold text-center flex items-center justify-center min-h-[50px]`}
      >
        {title}
      </div>
      <div className="p-5 flex-1">
        {isEditing ? (
          <textarea
            value={body}
            onChange={(event) => onChange(sectionKey, event.target.value)}
            onBlur={onFinishEdit}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                onFinishEdit();
              }
              if (event.key === 'Escape') {
                onFinishEdit();
              }
            }}
            autoFocus
            rows={8}
            className="w-full min-h-[180px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-gray-700 leading-relaxed outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
            data-testid={`ai-section-editor-${sectionKey}`}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            className="rounded-md -m-1 p-1 cursor-text hover:bg-slate-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
            onClick={() => onStartEdit(sectionKey)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onStartEdit(sectionKey);
              }
            }}
            data-testid={`ai-section-view-${sectionKey}`}
          >
            {html ? (
              <div
                className="markdown-body text-sm text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">{t('common.noInfo')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const AiResponsePanel = ({ response, isLoading, errorMessage }: AiResponsePanelProps) => {
  const [editingSection, setEditingSection] = useState<EditableSectionKey | null>(null);
  const [editableSections, setEditableSections] = useState<EditableSections>({
    highlights_this_week: '',
    next_week_actions: '',
    risks_decisions: ''
  });

  useEffect(() => {
    if (!response || (response.status !== 'AVAILABLE' && response.status !== 'PARTIAL')) {
      setEditingSection(null);
      setEditableSections({
        highlights_this_week: '',
        next_week_actions: '',
        risks_decisions: ''
      });
      return;
    }

    setEditingSection(null);
    setEditableSections({
      highlights_this_week: response.highlights_this_week ?? '',
      next_week_actions: response.next_week_actions ?? '',
      risks_decisions: response.risks_decisions ?? ''
    });
  }, [response]);

  if (isLoading) {
    return (
      <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-indigo-600 mb-2"></div>
        <p className="text-sm text-slate-500 font-medium">{t('aiPanel.loading')}</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        role="alert"
      >
        <span className="font-bold">{t('common.errorPrefix')}</span> {errorMessage}
      </div>
    );
  }

  if (!response || response.status === 'NOT_SAVED') {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-6 py-8 text-center">
        <p className="text-slate-500 text-sm mb-2">{t('aiPanel.notSaved')}</p>
        <p className="text-slate-400 text-xs">
          {t('aiPanel.notSavedHint')}
        </p>
      </div>
    );
  }

  if (response.status === 'FETCH_FAILED' || response.status === 'FORBIDDEN') {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
        role="alert"
      >
        {response.message || t('aiPanel.fetchFailed')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {response.status === 'PARTIAL' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {t('aiPanel.partial')}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <Section
          title={t('aiPanel.sectionHighlights')}
          body={editableSections.highlights_this_week}
          headerColor="bg-[#1e5fa0]"
          sectionKey="highlights_this_week"
          isEditing={editingSection === 'highlights_this_week'}
          onStartEdit={setEditingSection}
          onChange={(key, value) =>
            setEditableSections((prev) => ({
              ...prev,
              [key]: value
            }))
          }
          onFinishEdit={() => setEditingSection(null)}
        />
        <Section
          title={t('aiPanel.sectionNextActions')}
          body={editableSections.next_week_actions}
          headerColor="bg-[#5b9bd5]"
          sectionKey="next_week_actions"
          isEditing={editingSection === 'next_week_actions'}
          onStartEdit={setEditingSection}
          onChange={(key, value) =>
            setEditableSections((prev) => ({
              ...prev,
              [key]: value
            }))
          }
          onFinishEdit={() => setEditingSection(null)}
        />
        <Section
          title={t('aiPanel.sectionRisks')}
          body={editableSections.risks_decisions}
          headerColor="bg-[#ef4444]"
          sectionKey="risks_decisions"
          isEditing={editingSection === 'risks_decisions'}
          onStartEdit={setEditingSection}
          onChange={(key, value) =>
            setEditableSections((prev) => ({
              ...prev,
              [key]: value
            }))
          }
          onFinishEdit={() => setEditingSection(null)}
        />
      </div>
    </div>
  );
};
