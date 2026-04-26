import { useEffect, useState } from 'react';
import { renderMarkdown } from '../utils/markdownRenderer';
import type { AiResponseView } from '../types/weeklyReport';
import { t } from '../i18n';
import { reportStyles } from './designSystem';

type AiResponsePanelProps = {
  response: AiResponseView | null;
  isLoading: boolean;
  errorMessage: string | null;
  onSave?: (sections: EditableSections) => Promise<AiResponseView>;
  onDirtyChange?: (dirty: boolean) => void;
};

type EditableSectionKey = 'highlights_this_week' | 'next_week_actions' | 'risks_decisions';

export type EditableSections = Record<EditableSectionKey, string>;

const PANEL_SECTION_BODY = 'p-4';

const emptySections = (): EditableSections => ({
  highlights_this_week: '',
  next_week_actions: '',
  risks_decisions: ''
});

const sectionsFromResponse = (response: AiResponseView): EditableSections => ({
  highlights_this_week: response.highlights_this_week ?? '',
  next_week_actions: response.next_week_actions ?? '',
  risks_decisions: response.risks_decisions ?? ''
});

const sectionsEqual = (left: EditableSections, right: EditableSections) =>
  left.highlights_this_week === right.highlights_this_week &&
  left.next_week_actions === right.next_week_actions &&
  left.risks_decisions === right.risks_decisions;

const Section = ({
  title,
  body,
  headerColor,
  sectionKey,
  isEditing,
  onStartEdit,
  onChange,
  onFinishEdit,
  isDirty
}: {
  title: string;
  body: string;
  headerColor: string;
  sectionKey: EditableSectionKey;
  isEditing: boolean;
  onStartEdit: (key: EditableSectionKey) => void;
  onChange: (key: EditableSectionKey, value: string) => void;
  onFinishEdit: () => void;
  isDirty: boolean;
}) => {
  const html = renderMarkdown(body);

  return (
    <div className={`${reportStyles.surfaceElevated} flex h-full flex-col overflow-hidden transition-all duration-500 hover:shadow-brand-glow-offset ${isDirty ? 'ring-1 ring-amber-200' : ''}`}>
      <div className={`${headerColor} h-1.5`} />
      <div className="flex min-h-[56px] items-center justify-between border-b border-gray-100 px-4 py-3">
        <span className="text-[16px] font-display font-medium tracking-tight text-[#222222]">{title}</span>
      </div>
      <div className={PANEL_SECTION_BODY}>
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
            className={`${reportStyles.textarea} min-h-[220px] bg-[#f8fafc] text-[14px]`}
            data-testid={`ai-section-editor-${sectionKey}`}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            className="cursor-text rounded-[16px] p-2 -m-2 transition-all duration-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
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
                className="markdown-body font-sans text-[14px] leading-relaxed text-[#45515e]"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <p className="py-6 text-center text-[12px] italic text-slate-400 font-sans">{t('common.noInfo')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const AiResponsePanel = ({ response, isLoading, errorMessage, onSave, onDirtyChange }: AiResponsePanelProps) => {
  const [editingSection, setEditingSection] = useState<EditableSectionKey | null>(null);
  const [baselineSections, setBaselineSections] = useState<EditableSections>(emptySections);
  const [editableSections, setEditableSections] = useState<EditableSections>(emptySections);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const dirty = !sectionsEqual(baselineSections, editableSections);

  useEffect(() => {
    if (!response || (response.status !== 'AVAILABLE' && response.status !== 'PARTIAL')) {
      setEditingSection(null);
      setBaselineSections(emptySections());
      setEditableSections(emptySections());
      setSaveError(null);
      setSavedMessage(null);
      return;
    }

    const nextSections = sectionsFromResponse(response);
    setEditingSection(null);
    setBaselineSections(nextSections);
    setEditableSections(nextSections);
    setSaveError(null);
    setSavedMessage(null);
  }, [response]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleDiscard = () => {
    setEditableSections(baselineSections);
    setEditingSection(null);
    setSaveError(null);
    setSavedMessage(null);
  };

  const handleSave = async () => {
    if (!onSave || !dirty || saving) return;

    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    try {
      const updatedResponse = await onSave(editableSections);
      const nextSections = sectionsFromResponse(updatedResponse);
      setBaselineSections(nextSections);
      setEditableSections(nextSections);
      setEditingSection(null);
      setSavedMessage(t('aiPanel.saved'));
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : t('aiPanel.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`${reportStyles.loadingState} animate-pulse`}>
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-100 border-t-[var(--color-brand-6)] mb-4"></div>
        <p className="text-[14px] text-[#45515e] font-sans font-medium">{t('aiPanel.loading')}</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        className={reportStyles.alertError}
        role="alert"
      >
        <span className="font-bold">{t('common.errorPrefix')}</span> {errorMessage}
      </div>
    );
  }

  if (!response || response.status === 'NOT_SAVED') {
    return (
      <div className={reportStyles.emptyState}>
        <p className="mb-2 text-sm font-medium text-slate-600">{t('aiPanel.notSaved')}</p>
        <p className="text-xs leading-6 text-slate-400">{t('aiPanel.notSavedHint')}</p>
      </div>
    );
  }

  if (response.status === 'FETCH_FAILED' || response.status === 'FORBIDDEN') {
    return (
      <div className={reportStyles.alertWarning} role="alert">
        {response.message || t('aiPanel.fetchFailed')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] font-medium">
          {saveError ? (
            <span className="text-red-700" role="alert">{saveError}</span>
          ) : dirty ? (
            <span className="text-amber-700">{t('aiPanel.unsavedChanges')}</span>
          ) : savedMessage ? (
            <span className="text-emerald-700">{savedMessage}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              className="h-8 rounded-[9999px] border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
              onClick={handleDiscard}
              disabled={saving}
            >
              {t('aiPanel.discardChanges')}
            </button>
          )}
          <button
            type="button"
            className="h-8 rounded-[9999px] bg-[var(--color-brand-6)] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[var(--color-primary-700)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleSave}
            disabled={!dirty || saving || !onSave}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {response.status === 'PARTIAL' && (
        <div className={`${reportStyles.alertWarning} mb-2 flex items-center gap-3`}>
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
          isDirty={baselineSections.highlights_this_week !== editableSections.highlights_this_week}
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
          isDirty={baselineSections.next_week_actions !== editableSections.next_week_actions}
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
          isDirty={baselineSections.risks_decisions !== editableSections.risks_decisions}
        />
      </div>
    </div>
  );
};
