import type { ReportPresetTarget } from './reportPresetStorage';
import { t } from '../i18n';
import { requestJson, requestJsonWithBody, weeklyError } from './apiClient';

export type ReportDetailResponse = {
  status: 'AVAILABLE' | 'NOT_SAVED' | 'ERROR';
  saved_at: string | null;
  highlights_this_week: string[];
  next_week_actions: string[];
  risks: string[];
  decisions: string[];
  destination_issue_id: number;
  error_code?: string;
  message?: string;
};

export type ReportDetailUpdatePayload = {
  destination_issue_id: number;
  targets: { project_id: number; version_id: number }[];
  highlights_this_week: string[];
  next_week_actions: string[];
  risks: string[];
  decisions: string[];
};

export type ReportDetailUpdateResponse = {
  saved: boolean;
  revision?: number;
  saved_at?: string;
  destination_issue_id?: number;
  error_code?: string;
  message?: string;
};

export type ReportDetailAiCommentPayload = {
  destination_issue_id: number;
  project_id: number;
  version_id: number;
  week_from: string;
  week_to: string;
  week: string;
  markdown: string;
  generated_at: string;
};

export type ReportDetailAiCommentResponse = {
  saved: boolean;
  revision?: number;
  saved_at?: string;
  destination_issue_id?: number;
  error_code?: string;
  message?: string;
};

export const fetchReportDetail = async (
  projectIdentifier: string,
  params: {
    destination_issue_id: number;
    targets: { project_id: number; version_id: number }[];
  }
): Promise<ReportDetailResponse> => {
  const query = new URLSearchParams();
  query.set('destination_issue_id', String(params.destination_issue_id));
  query.set('targets', JSON.stringify(params.targets));

  return requestJson<ReportDetailResponse>(
    `/projects/${projectIdentifier}/schedule_report/report_detail?${query.toString()}`,
    weeklyError((status) => t('reportDetail.fetchDetailFailed', { status, defaultValue: `Failed to fetch report detail (${status})` }))
  );
};

export const updateReportDetail = async (
  projectIdentifier: string,
  payload: ReportDetailUpdatePayload
): Promise<ReportDetailUpdateResponse> =>
  requestJsonWithBody<ReportDetailUpdateResponse>(
    `/projects/${projectIdentifier}/schedule_report/report_detail`,
    'PATCH',
    payload,
    weeklyError((status) => t('reportDetail.saveDetailFailed', { status, defaultValue: `Failed to save report detail (${status})` }))
  );

export const addReportDetailAiComment = async (
  projectIdentifier: string,
  payload: ReportDetailAiCommentPayload
): Promise<ReportDetailAiCommentResponse> =>
  requestJsonWithBody<ReportDetailAiCommentResponse>(
    `/projects/${projectIdentifier}/schedule_report/report_detail/ai_comment`,
    'POST',
    payload,
    weeklyError((status) =>
      t('reportDetail.saveAiCommentFailed', {
        status,
        defaultValue: `Failed to add AI comment (${status})`
      })
    )
  );

export const buildTargetsFromPreset = (
  targets: ReportPresetTarget[]
): { project_id: number; version_id: number }[] =>
  targets.map((target) => ({ project_id: target.projectId, version_id: target.versionId }));
