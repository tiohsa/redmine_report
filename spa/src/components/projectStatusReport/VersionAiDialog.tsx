import { useEffect, useMemo, useState } from 'react';
import {
  WeeklyApiError,
  generateWeeklyReport,
  saveWeeklyReport,
  validateWeeklyDestination
} from '../../services/scheduleReportApi';
import { weeklyDestinationStorage } from '../../services/weeklyDestinationStorage';
import type { DestinationValidationResult, WeeklyGenerateResponse } from '../../types/weeklyReport';

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
  const [generated, setGenerated] = useState<WeeklyGenerateResponse | null>(null);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingValidate, setLoadingValidate] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const mapped = weeklyDestinationStorage.getDestinationIssueId(projectId, versionId);
    setDestinationIssueId(mapped ? String(mapped) : '');
    setValidation(null);
    setGenerated(null);
    setError(null);
    setMessage(null);
    weeklyDestinationStorage.setLastVersionId(projectId, versionId);
  }, [open, projectId, versionId]);

  const destinationIdNumber = Number(destinationIssueId);
  const destinationValid = validation?.valid === true;

  const saveEnabled = useMemo(() => {
    return (
      !!generated?.markdown &&
      Number.isFinite(destinationIdNumber) &&
      destinationIdNumber > 0 &&
      destinationValid
    );
  }, [generated?.markdown, destinationIdNumber, destinationValid]);

  if (!open) return null;

  const validateDestination = async () => {
    setLoadingValidate(true);
    setError(null);
    setMessage(null);
    setValidation(null);

    try {
      const result = await validateWeeklyDestination(projectIdentifier, {
        project_id: projectId,
        version_id: versionId,
        destination_issue_id: destinationIdNumber
      });
      setValidation(result);
      setMessage(result.valid ? '検証OK' : result.reason_message || '検証NG');
    } catch (e) {
      const err = e as WeeklyApiError;
      setValidation({ valid: false, reason_code: err.code || 'INVALID_INPUT', reason_message: err.message });
      setError(err.message);
    } finally {
      setLoadingValidate(false);
    }
  };

  const saveMapping = () => {
    if (!destinationValid || !Number.isFinite(destinationIdNumber) || destinationIdNumber <= 0) return;
    weeklyDestinationStorage.setDestinationIssueId(projectId, versionId, destinationIdNumber);
    setMessage('設定を保存しました');
  };

  const startAnalysis = async () => {
    setLoadingGenerate(true);
    setGenerated(null);
    setError(null);
    setMessage(null);
    try {
      const result = await generateWeeklyReport(projectIdentifier, {
        project_id: projectId,
        version_id: versionId,
        week_from: weekFrom,
        week_to: weekTo,
        top_topics_limit: 10,
        top_tickets_limit: 30
      });
      setGenerated(result);
      setMessage('生成完了');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingGenerate(false);
    }
  };

  const saveReport = async () => {
    if (!generated) return;
    setLoadingSave(true);
    setError(null);
    setMessage(null);
    try {
      const saveResult = await saveWeeklyReport(projectIdentifier, {
        project_id: projectId,
        version_id: versionId,
        week_from: weekFrom,
        week_to: weekTo,
        week: generated.header_preview.week,
        destination_issue_id: destinationIdNumber,
        markdown: generated.markdown,
        generated_at: generated.header_preview.generated_at
      });
      setMessage(`保存完了 revision=${saveResult.revision}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingSave(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50" onClick={onClose}>
      <div
        className="mx-auto mt-6 max-h-[88vh] max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">生成AIレポート: {versionName}</h2>
          <button type="button" className="text-slate-500 hover:text-slate-800 cursor-pointer" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-700">
            週開始
            <input
              type="date"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
              value={weekFrom}
              onChange={(e) => setWeekFrom(e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-700">
            週終了
            <input
              type="date"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
              value={weekTo}
              onChange={(e) => setWeekTo(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 rounded border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">保存先チケット紐づけ</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              placeholder="Destination Issue ID"
              value={destinationIssueId}
              onChange={(e) => {
                setDestinationIssueId(e.target.value);
                setValidation(null);
              }}
              className="w-56 rounded border border-slate-300 px-2 py-1"
            />
            <button
              type="button"
              onClick={validateDestination}
              disabled={loadingValidate || !destinationIssueId}
              className="rounded bg-slate-700 px-3 py-1 text-white disabled:opacity-50 cursor-pointer"
            >
              {loadingValidate ? '検証中...' : '検証'}
            </button>
            <button
              type="button"
              onClick={saveMapping}
              disabled={!destinationValid}
              className="rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-50 cursor-pointer"
            >
              保存（設定を保存）
            </button>
            <span className="text-xs text-slate-500">
              {validation ? (validation.valid ? 'OK' : `NG: ${validation.reason_code}`) : '未検証'}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={startAnalysis}
            disabled={loadingGenerate}
            className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50 cursor-pointer"
          >
            {loadingGenerate ? '生成中...' : '開始'}
          </button>
          <button
            type="button"
            onClick={saveReport}
            disabled={!saveEnabled || loadingSave}
            className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50 cursor-pointer"
          >
            {loadingSave ? '保存中...' : '保存'}
          </button>
        </div>

        {error && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {message && <div className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}

        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">プレビュー</div>
          <pre className="max-h-80 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-800">
            {generated?.markdown || '未生成'}
          </pre>
        </div>
      </div>
    </div>
  );
};
