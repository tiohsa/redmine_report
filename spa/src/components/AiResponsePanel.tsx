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

const PANEL_CARD_BASE = 'overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-brand-glow';
const PANEL_SECTION_BODY = 'p-5';
const PANEL_EMPTY_STATE = 'rounded-[24px] border border-gray-100 bg-gray-50/50 px-6 py-8 text-center font-sans';
const PANEL_ALERT = 'rounded-[16px] border px-4 py-3 text-sm font-sans';

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
    <div className={`${PANEL_CARD_BASE} flex flex-col h-full`}>
      <div
        className={`${headerColor} px-6 py-6 text-white text-[20px] font-display font-semibold tracking-wide flex items-center justify-between min-h-[68px] opacity-95`}
      >
        <span>{title}</span>
      </div>
      <div className={`${PANEL_SECTION_BODY} flex-1`}>
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
            className="w-full min-h-[190px] rounded-[11px] border border-gray-200 bg-white px-3 py-2.5 text-[16px] text-[#222222] font-sans leading-[1.50] outline-none shadow-none focus:border-[#45515e]"
            data-testid={`ai-section-editor-${sectionKey}`}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            className="rounded-xl -m-1 p-1.5 cursor-text hover:bg-slate-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
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
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">{t('common.noInfo')}</p>
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
      <div className="rounded-[16px] border border-gray-100 bg-white px-8 py-12 text-center shadow-subtle animate-pulse">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-100 border-t-[var(--color-brand-6)] mb-4"></div>
        <p className="text-[14px] text-[#45515e] font-sans font-medium">{t('aiPanel.loading')}</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        className={`${PANEL_ALERT} border-red-200 bg-red-50 text-red-700`}
        role="alert"
      >
        <span className="font-bold">{t('common.errorPrefix')}</span> {errorMessage}
      </div>
    );
  }

  if (!response || response.status === 'NOT_SAVED') {
    return (
      <div className={PANEL_EMPTY_STATE}>
        <p className="text-slate-600 text-sm font-medium mb-2">{t('aiPanel.notSaved')}</p>
        <p className="text-slate-400 text-xs leading-6">
          {t('aiPanel.notSavedHint')}
        </p>
      </div>
    );
  }

  if (response.status === 'FETCH_FAILED' || response.status === 'FORBIDDEN') {
    return (
      <div
        className={`${PANEL_ALERT} border-amber-200 bg-amber-50 text-amber-800`}
        role="alert"
      >
        {response.message || t('aiPanel.fetchFailed')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {response.status === 'PARTIAL' && (
        <div className="rounded-[16px] border border-amber-100 bg-amber-50 px-5 py-3.5 text-[14px] text-amber-800 flex items-center gap-3 shadow-sm font-sans mb-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="font-medium">{t('aiPanel.partial')}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <Section
          title={t('aiPanel.sectionHighlights')}
          body={editableSections.highlights_this_week}
          headerColor="bg-[var(--color-brand-6)]"
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
          headerColor="bg-[var(--color-brand-00)]"
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
          headerColor="bg-[var(--color-brand-02)]"
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
