import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WeeklyApiError,
  generateWeeklyReport,
  prepareWeeklyPrompt,
  saveWeeklyReport,
  validateWeeklyDestination
} from '../../services/scheduleReportApi';
import { weeklyDestinationStorage } from '../../services/weeklyDestinationStorage';
import type {
  DestinationValidationResult,
  WeeklyGenerateResponse,
  WeeklyPrepareResponse
} from '../../types/weeklyReport';
import { t, tList } from '../../i18n';
import { CreateDestinationIssueDialog } from './CreateDestinationIssueDialog';

type Props = {
  open: boolean;
  projectIdentifier: string;
  projectId: number;
  versionId: number;
  versionName: string;
  onClose: () => void;
};

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

const defaultWeek = () => {
  const now = new Date();
  const day = now.getDay();
  const mondayDiff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayDiff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toDateInput(monday), to: toDateInput(sunday) };
};

const normalizeMarkdown = (markdown: string) =>
  markdown
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n')
    .trim();

const isoWeekKey = (dateInput: string) => {
  const date = new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

export const VersionAiDialog = ({
  open,
  projectIdentifier,
  projectId,
  versionId,
  versionName,
  onClose
}: Props) => {
  const [weekFrom, setWeekFrom] = useState(defaultWeek().from);
  const [weekTo, setWeekTo] = useState(defaultWeek().to);
  const [destinationIssueId, setDestinationIssueId] = useState<string>('');
  const [validation, setValidation] = useState<DestinationValidationResult | null>(null);
  const [prepared, setPrepared] = useState<WeeklyPrepareResponse | null>(null);
  const [promptText, setPromptText] = useState('');
  const [generated, setGenerated] = useState<WeeklyGenerateResponse | null>(null);
  const [editableMarkdown, setEditableMarkdown] = useState('');
  const [loadingPrepare, setLoadingPrepare] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingValidate, setLoadingValidate] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createTicketOpen, setCreateTicketOpen] = useState(false);

  const persistDestinationIssueId = useCallback((issueId: number) => {
    weeklyDestinationStorage.setDestinationIssueId(projectId, versionId, issueId);
  }, [projectId, versionId]);

  const validateDestinationById = useCallback(async (destinationId: number) => {
    setLoadingValidate(true);
    setError(null);
    setMessage(null);
    setValidation(null);

    try {
      const result = await validateWeeklyDestination(projectIdentifier, {
        project_id: projectId,
        version_id: versionId,
        destination_issue_id: destinationId
      });
      setValidation(result);
      if (result.valid) {
        persistDestinationIssueId(destinationId);
        setMessage(t('weeklyDialog.destinationValidatedAndSaved'));
      }
    } catch (e) {
      const err = e as WeeklyApiError;
      setValidation({ valid: false, reason_code: err.code || 'INVALID_INPUT', reason_message: err.message });
      setError(err.message);
    } finally {
      setLoadingValidate(false);
    }
  }, [persistDestinationIssueId, projectIdentifier, projectId, versionId]);

  useEffect(() => {
    if (!open) return;
    const mapped = weeklyDestinationStorage.getPreferredDestinationIssueId(projectId, versionId);
    setDestinationIssueId(mapped ? String(mapped) : '');
    setValidation(null);
    setPrepared(null);
    setPromptText('');
    setGenerated(null);
    setEditableMarkdown('');
    setError(null);
    setMessage(null);
    weeklyDestinationStorage.setLastVersionId(projectId, versionId);
    if (mapped && mapped > 0) {
      void validateDestinationById(mapped);
    }
  }, [open, projectId, versionId, validateDestinationById]);

  const destinationIdNumber = Number(destinationIssueId);
  const destinationValid = validation?.valid === true;

  const saveEnabled = useMemo(() => {
    return (
      !!editableMarkdown.trim() &&
      Number.isFinite(destinationIdNumber) &&
      destinationIdNumber > 0 &&
      destinationValid
    );
  }, [editableMarkdown, destinationIdNumber, destinationValid]);

  const currentStep = useMemo(() => {
    if (generated) return 4;
    if (prepared) return 3;
    if (destinationValid) return 2;
    return 1;
  }, [destinationValid, prepared, generated]);

  if (!open) return null;

  const validateDestination = async () => {
    await validateDestinationById(destinationIdNumber);
  };

  const saveMapping = () => {
    if (!destinationValid || !Number.isFinite(destinationIdNumber) || destinationIdNumber <= 0) return;
    persistDestinationIssueId(destinationIdNumber);
    setMessage(t('weeklyDialog.saveSetting'));
  };

  const preparePrompt = async () => {
    setLoadingPrepare(true);
    setPrepared(null);
    setGenerated(null);
    setEditableMarkdown('');
    setError(null);
    setMessage(null);
    try {
      const result = await prepareWeeklyPrompt(projectIdentifier, {
        project_id: projectId,
        version_id: versionId,
        week_from: weekFrom,
        week_to: weekTo,
        top_topics_limit: 10,
        top_tickets_limit: 30
      });
      setPrepared(result);
      setPromptText(result.prompt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingPrepare(false);
    }
  };

  const submitToLlm = async () => {
    setLoadingGenerate(true);
    setGenerated(null);
    setEditableMarkdown('');
    setError(null);
    setMessage(null);
    try {
      const result = await generateWeeklyReport(projectIdentifier, {
        project_id: projectId,
        version_id: versionId,
        week_from: weekFrom,
        week_to: weekTo,
        top_topics_limit: 10,
        top_tickets_limit: 30,
        prompt: promptText
      });
      setGenerated(result);
      setEditableMarkdown(normalizeMarkdown(result.markdown));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingGenerate(false);
    }
  };

  const saveReport = async () => {
    const week = generated?.header_preview.week || prepared?.header_preview.week || isoWeekKey(weekFrom);
    const generatedAt = generated?.header_preview.generated_at || prepared?.header_preview.generated_at || new Date().toISOString();
    if (!week) {
      setError(t('weeklyDialog.weekCalculationFailed'));
      return;
    }
    setLoadingSave(true);
    setError(null);
    setMessage(null);
    try {
      const saveResult = await saveWeeklyReport(projectIdentifier, {
        project_id: projectId,
        version_id: versionId,
        week_from: weekFrom,
        week_to: weekTo,
        week,
        destination_issue_id: destinationIdNumber,
        markdown: editableMarkdown,
        generated_at: generatedAt
      });
      setMessage(t('weeklyDialog.reportSaved', { revision: saveResult.revision }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingSave(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-100"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-none px-6 py-4 border-b border-slate-50 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <svg className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3L14.5 9L21 11.5L14.5 14L12 21L9.5 14L3 11.5L9.5 9L12 3Z" fill="currentColor" fillOpacity="0.2" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{t('weeklyDialog.title')}</h2>
              <p className="text-xs text-slate-500 font-medium">{versionName}</p>
            </div>
          </div>
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors cursor-pointer"
            onClick={onClose}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex-none px-8 py-4 bg-slate-50/50 flex items-center justify-between border-b border-slate-100">
          {tList('weeklyDialog.steps').map((label, idx) => {
            const step = idx + 1;
            return (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5 relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${currentStep >= step ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-110' : 'bg-white border-2 border-slate-200 text-slate-400'
                    }`}>
                    {currentStep > step ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    ) : step}
                  </div>
                  <span className={`text-[10px] font-bold tracking-wider uppercase ${currentStep >= step ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {label}
                  </span>
                </div>
                {idx < 3 && (
                  <div className="flex-1 h-0.5 mx-4 bg-slate-200 overflow-hidden">
                    <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: currentStep > step ? '100%' : '0%' }}></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
          {/* Section 1: Target Selection */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
              {t('weeklyDialog.sectionTarget')}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{t('weeklyDialog.startDate')}</label>
                <input
                  type="date"
                  className="w-full h-10 px-4 rounded-xl border-none bg-slate-50 text-slate-700 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                  value={weekFrom}
                  onChange={(e) => setWeekFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{t('weeklyDialog.endDate')}</label>
                <input
                  type="date"
                  className="w-full h-10 px-4 rounded-xl border-none bg-slate-50 text-slate-700 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                  value={weekTo}
                  onChange={(e) => setWeekTo(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{t('weeklyDialog.destinationIssueId')}</label>
              <div className="flex items-center gap-3">
                <div className="relative group w-48">
                  <input
                    type="number"
                    min={1}
                    placeholder={t('weeklyDialog.issueIdPlaceholder')}
                    value={destinationIssueId}
                    onChange={(e) => {
                      setDestinationIssueId(e.target.value);
                      setValidation(null);
                    }}
                    className="w-full h-10 pl-4 pr-10 rounded-xl border-none bg-slate-50 text-slate-700 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                  {validation && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {validation.valid ? (
                        <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                      ) : (
                        <svg className="w-5 h-5 text-rose-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  title={t('weeklyDialog.createDestinationIssue')}
                  onClick={() => setCreateTicketOpen(true)}
                  className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-indigo-600 transition-all cursor-pointer flex-shrink-0"
                >
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={validateDestination}
                  disabled={loadingValidate || !destinationIssueId}
                  className="h-10 px-6 rounded-xl bg-slate-700 text-white text-[11px] font-black tracking-tight hover:bg-slate-800 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-slate-100"
                >
                  {loadingValidate ? t('weeklyDialog.validating') : t('weeklyDialog.validateDestination')}
                </button>
                <button
                  type="button"
                  onClick={saveMapping}
                  disabled={!destinationValid}
                  className="h-10 px-6 rounded-xl bg-emerald-600 text-white text-[11px] font-black tracking-tight hover:bg-emerald-700 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-50"
                >
                  {t('weeklyDialog.saveSetting')}
                </button>
                {message && !error && currentStep < 3 && <span className="text-[11px] font-black text-emerald-600 animate-in fade-in slide-in-from-left-2">{message}</span>}
              </div>
            </div>
          </section>

          {/* Section 2: AI Prompt */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                {t('weeklyDialog.sectionPrompt')}
              </div>
              <button
                type="button"
                onClick={preparePrompt}
                disabled={loadingPrepare}
                className="group relative h-10 px-6 overflow-hidden rounded-xl bg-indigo-700 text-white text-[11px] font-black tracking-tight transition-all hover:bg-indigo-800 hover:shadow-xl hover:shadow-indigo-100 disabled:opacity-70 cursor-pointer"
              >
                <div className="relative z-10 flex items-center gap-2">
                  {loadingPrepare ? (
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  )}
                  {loadingPrepare ? t('weeklyDialog.promptPreparing') : t('weeklyDialog.preparePrompt')}
                </div>
              </button>
            </div>
            {promptText && (
              <div className="relative group animate-in zoom-in-95 duration-300">
                <textarea
                  className="w-full min-h-[160px] p-4 rounded-2xl bg-slate-50 border-none text-xs text-slate-700 font-mono leading-relaxed focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                />
                <button
                  className="absolute top-4 right-4 p-2 bg-white rounded-lg shadow-sm text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all border border-slate-100 cursor-pointer"
                  title={t('common.copy')}
                  onClick={() => {
                    navigator.clipboard.writeText(promptText);
                    setMessage(t('common.copied'));
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6a2 2 0 002-2V7a2 2 0 00-2-2h-6a2 2 0 00-2 2zM8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2"></path></svg>
                </button>
              </div>
            )}
            {prepared && (
              <div className="px-4 py-2 bg-indigo-50/50 rounded-lg text-[10px] text-indigo-600 font-bold tracking-tight inline-flex items-center gap-2">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>
                {t('weeklyDialog.preparedSummary', { week: prepared.header_preview.week, count: prepared.tickets.length })}
              </div>
            )}
          </section>

          {/* Section 3: AI Generation */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                {t('weeklyDialog.sectionPreview')}
              </div>
              <button
                type="button"
                onClick={submitToLlm}
                disabled={loadingGenerate || !promptText}
                className="group relative h-10 px-8 overflow-hidden rounded-xl bg-violet-700 text-white text-[11px] font-black tracking-tight transition-all hover:bg-violet-800 hover:shadow-xl hover:shadow-violet-100 disabled:opacity-50 cursor-pointer"
              >
                <div className="relative z-10 flex items-center gap-2">
                  {loadingGenerate ? (
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L14.5 9L21 11.5L14.5 14L12 21L9.5 14L3 11.5L9.5 9L12 3Z" fill="currentColor" fillOpacity="0.2" /></svg>
                  )}
                  {loadingGenerate ? t('weeklyDialog.generating') : t('weeklyDialog.sendToLlm')}
                </div>
              </button>
            </div>
            <div className="bg-slate-50 rounded-2xl p-6 min-h-[120px] relative animate-in slide-in-from-bottom-2 duration-500">
              <div className="prose prose-sm prose-slate max-w-none text-xs text-slate-700 leading-relaxed font-medium">
                <div className="mb-4 flex items-center gap-2 text-[10px] font-bold text-slate-400 border-b border-slate-100 pb-2">
                  {(generated?.header_preview.week || prepared?.header_preview.week || isoWeekKey(weekFrom) || '-')}{' '}
                  {(generated?.header_preview.generated_at || prepared?.header_preview.generated_at || '-')}
                </div>
                <textarea
                  aria-label={t('weeklyDialog.previewBodyAria')}
                  placeholder={t('weeklyDialog.previewPlaceholder')}
                  className="w-full min-h-[220px] whitespace-pre-wrap rounded-xl bg-white border border-slate-200 p-3 text-xs leading-relaxed font-sans focus:ring-2 focus:ring-violet-500/20"
                  value={editableMarkdown}
                  onChange={(e) => setEditableMarkdown(e.target.value)}
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="px-5 py-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 animate-in shake duration-500">
              <svg className="w-5 h-5 text-rose-500 flex-none" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
              <div className="text-xs font-bold text-rose-700 leading-snug">{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-none px-8 py-5 bg-white border-t border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {message && <span className="text-xs font-bold text-emerald-600 animate-in fade-in slide-in-from-bottom-1">{message}</span>}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-6 rounded-xl text-slate-500 text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={saveReport}
              disabled={!saveEnabled || loadingSave}
              className="relative group h-10 px-10 overflow-hidden rounded-xl bg-slate-900 text-white text-[11px] font-black tracking-tight transition-all hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-100 disabled:opacity-30 cursor-pointer"
            >
              <div className="relative z-10 flex items-center gap-2">
                {loadingSave ? (
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V3"></path></svg>
                )}
                {loadingSave ? t('weeklyDialog.saving') : t('weeklyDialog.saveReport')}
              </div>
            </button>
          </div>
        </div>
      </div>

      {createTicketOpen && (
        <CreateDestinationIssueDialog
          projectIdentifier={projectIdentifier}
          onCreated={async (newIssueId) => {
            if (newIssueId) {
              setDestinationIssueId(String(newIssueId));
              await validateDestinationById(newIssueId);
            }
          }}
          onClose={() => setCreateTicketOpen(false)}
        />
      )}
    </div>
  );
};
