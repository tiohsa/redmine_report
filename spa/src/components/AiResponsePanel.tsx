import { renderMarkdown } from '../utils/markdownRenderer';
import type { AiResponseView } from '../types/weeklyReport';
import { t } from '../i18n';

type AiResponsePanelProps = {
  response: AiResponseView | null;
  isLoading: boolean;
  errorMessage: string | null;
};

const Section = ({
  title,
  body,
  headerColor
}: {
  title: string;
  body?: string | null;
  headerColor: string;
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
        {html ? (
          <div
            className="markdown-body text-sm text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">{t('common.noInfo')}</p>
        )}
      </div>
    </div>
  );
};

export const AiResponsePanel = ({ response, isLoading, errorMessage }: AiResponsePanelProps) => {
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
          body={response.highlights_this_week}
          headerColor="bg-[#1e5fa0]"
        />
        <Section
          title={t('aiPanel.sectionNextActions')}
          body={response.next_week_actions}
          headerColor="bg-[#5b9bd5]"
        />
        <Section
          title={t('aiPanel.sectionRisks')}
          body={response.risks_decisions}
          headerColor="bg-[#ef4444]"
        />
      </div>
    </div>
  );
};
