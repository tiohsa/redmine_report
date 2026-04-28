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
import { reportStyles } from '../designSystem';
import { Button } from '../ui/Button';
import { FieldLabel } from '../ui/FieldLabel';
import { Icon } from '../ui/Icon';

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
    <div className={reportStyles.dialogOverlay} onClick={onClose}>
      <div
        className={`${reportStyles.dialogPanel} ${reportStyles.dialogPanelLg} relative max-h-[95vh] animate-in fade-in zoom-in duration-300`}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className={reportStyles.dialogHeader}>
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-[var(--color-primary-200)]/55 p-2.5">
              <Icon name="sparkles" className="h-6 w-6 text-[var(--color-brand-6)]" />
            </div>
            <div>
              <h2 className={reportStyles.sectionHeading}>{t('weeklyDialog.title')}</h2>
              <p className="text-[14px] font-sans font-medium text-[#45515e]">{versionName}</p>
            </div>
          </div>
          <Button variant="icon-muted" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </Button>
        </div>

        {/* Step Indicator */}
        <div className="flex flex-none items-center justify-between border-b border-slate-100 bg-[#fbfdff] px-8 py-4">
          {tList('weeklyDialog.steps').map((label, idx) => {
            const step = idx + 1;
            return (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5 relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${currentStep >= step ? 'bg-[var(--color-brand-6)] text-white shadow-lg shadow-blue-100 scale-110' : 'bg-white border-2 border-slate-200 text-slate-400'
                    }`}>
                    {currentStep > step ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    ) : step}
                  </div>
                  <span className={`text-[10px] font-bold tracking-wider uppercase font-sans ${currentStep >= step ? 'text-[var(--color-brand-6)]' : 'text-slate-400'}`}>
                    {label}
                  </span>
                </div>
                {idx < 3 && (
                  <div className="flex-1 h-0.5 mx-4 bg-slate-200 overflow-hidden">
                    <div className="h-full bg-[var(--color-brand-6)] transition-all duration-1000" style={{ width: currentStep > step ? '100%' : '0%' }}></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-8 p-8 scrollbar-thin scrollbar-thumb-slate-200">
          {/* Section 1: Target Selection */}
          <section className="report-panel space-y-4 p-6">
            <div className="flex items-center gap-3 text-[14px] font-sans font-semibold text-[#222222]">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-6)]"></div>
              {t('weeklyDialog.sectionTarget')}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <FieldLabel>{t('weeklyDialog.startDate')}</FieldLabel>
                <input
                  type="date"
                  className={reportStyles.input}
                  value={weekFrom}
                  onChange={(e) => setWeekFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>{t('weeklyDialog.endDate')}</FieldLabel>
                <input
                  type="date"
                  className={reportStyles.input}
                  value={weekTo}
                  onChange={(e) => setWeekTo(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>{t('weeklyDialog.destinationIssueId')}</FieldLabel>
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
                    className={`${reportStyles.input} pr-10`}
                  />
                  {validation && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {validation.valid ? (
                        <Icon name="check-circle" className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Icon name="warning" className="h-5 w-5 text-rose-500" />
                      )}
                    </div>
                  )}
                </div>
                <Button
                  title={t('weeklyDialog.createDestinationIssue')}
                  onClick={() => setCreateTicketOpen(true)}
                  variant="icon-muted"
                  className="flex-shrink-0"
                >
                  <Icon name="plus" />
                </Button>
                <Button
                  onClick={validateDestination}
                  disabled={loadingValidate || !destinationIssueId}
                >
                  {loadingValidate ? t('weeklyDialog.validating') : t('weeklyDialog.validateDestination')}
                </Button>
                <Button
                  onClick={saveMapping}
                  disabled={!destinationValid}
                >
                  {t('weeklyDialog.saveSetting')}
                </Button>
                {message && !error && currentStep < 3 && <span className="text-[11px] font-black text-emerald-600 animate-in fade-in slide-in-from-left-2">{message}</span>}
              </div>
            </div>
          </section>

          {/* Section 2: AI Prompt */}
          <section className="report-panel space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[14px] font-sans font-semibold text-[#222222]">
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-6)]"></div>
                {t('weeklyDialog.sectionPrompt')}
              </div>
              <Button
                onClick={preparePrompt}
                disabled={loadingPrepare}
                className="group relative"
              >
                <div className="relative z-10 flex items-center gap-2">
                  {loadingPrepare ? (
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <Icon name="process" className="h-3.5 w-3.5 transition-transform group-hover:rotate-12" />
                  )}
                  {loadingPrepare ? t('weeklyDialog.promptPreparing') : t('weeklyDialog.preparePrompt')}
                </div>
              </Button>
            </div>
            {promptText && (
              <div className="relative group animate-in zoom-in-95 duration-300">
                <textarea
                  className={`${reportStyles.textarea} ${reportStyles.textareaMono} min-h-[160px] bg-[#f8fafc] p-6`}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                />
                <button
                  className="report-icon-button-muted absolute right-4 top-4 opacity-0 shadow-sm group-hover:opacity-100"
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
              <div className="inline-flex items-center gap-2 rounded-lg bg-indigo-50/50 px-4 py-2 text-[10px] font-bold tracking-tight text-indigo-600">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>
                {t('weeklyDialog.preparedSummary', { week: prepared.header_preview.week, count: prepared.tickets.length })}
              </div>
            )}
          </section>

          {/* Section 3: AI Generation */}
          <section className="report-panel space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[14px] font-sans font-semibold text-[#222222]">
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-6)]"></div>
                {t('weeklyDialog.sectionPreview')}
              </div>
              <Button
                onClick={submitToLlm}
                disabled={loadingGenerate || !promptText}
                className="group relative"
              >
                <div className="relative z-10 flex items-center gap-2">
                  {loadingGenerate ? (
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <Icon name="sparkles" className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                  )}
                  {loadingGenerate ? t('weeklyDialog.generating') : t('weeklyDialog.sendToLlm')}
                </div>
              </Button>
            </div>
            <div className="report-panel-muted relative min-h-[120px] animate-in slide-in-from-bottom-2 duration-500 p-6">
              <div className="prose prose-sm prose-slate max-w-none text-xs text-slate-700 leading-relaxed font-medium">
                <div className="mb-4 flex items-center gap-2 text-[10px] font-bold text-slate-400 border-b border-slate-100 pb-2">
                  {(generated?.header_preview.week || prepared?.header_preview.week || isoWeekKey(weekFrom) || '-')}{' '}
                  {(generated?.header_preview.generated_at || prepared?.header_preview.generated_at || '-')}
                </div>
                <textarea
                  aria-label={t('weeklyDialog.previewBodyAria')}
                  placeholder={t('weeklyDialog.previewPlaceholder')}
                  className={`${reportStyles.textarea} ${reportStyles.textareaMono} min-h-[220px] whitespace-pre-wrap bg-white p-3`}
                  value={editableMarkdown}
                  onChange={(e) => setEditableMarkdown(e.target.value)}
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="report-alert-error flex items-center gap-3 animate-in shake duration-500">
              <svg className="w-5 h-5 text-rose-500 flex-none" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
              <div className="text-xs font-bold text-rose-700 leading-snug">{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-none items-center justify-between border-t border-gray-100 bg-white px-8 py-6">
          <div className="flex items-center gap-2">
            {message && <span className="text-sm font-semibold text-emerald-600 animate-in fade-in slide-in-from-bottom-1">{message}</span>}
          </div>
          <div className="flex items-center gap-4">
              <Button variant="secondary" onClick={onClose}>
                {t('common.close')}
              </Button>
            <Button
              onClick={saveReport}
              disabled={!saveEnabled || loadingSave}
            >
              <div className="relative z-10 flex items-center gap-2">
                {loadingSave ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V3"></path></svg>
                )}
                {loadingSave ? t('weeklyDialog.saving') : t('weeklyDialog.saveReport')}
              </div>
            </Button>
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
