import type {
  AiResponseTabsPayload,
  DestinationValidationResult,
  WeeklyGenerateResponse,
  WeeklyPrepareResponse,
  WeeklySaveResponse,
  WeeklyVersionItem
} from '../types/weeklyReport';
import { t } from '../i18n';
import { appendQuery, requestJson, requestJsonWithBody, weeklyError } from './apiClient';

export const fetchWeeklyVersions = async (
  projectIdentifier: string
): Promise<WeeklyVersionItem[]> => {
  const json = await requestJson<{ versions: WeeklyVersionItem[] }>(
    `/projects/${projectIdentifier}/schedule_report/weekly/versions`,
    weeklyError((status) => t('api.fetchWeeklyVersions', { status }))
  );
  return json.versions || [];
};

export const validateWeeklyDestination = async (
  projectIdentifier: string,
  payload: { project_id: number; version_id: number; destination_issue_id: number }
): Promise<DestinationValidationResult> =>
  requestJsonWithBody<DestinationValidationResult>(
    `/projects/${projectIdentifier}/schedule_report/weekly/destination/validate`,
    'POST',
    payload,
    weeklyError((status) => t('api.validateDestination', { status }))
  );

export const generateWeeklyReport = async (
  projectIdentifier: string,
  payload: {
    project_id: number;
    version_id: number;
    week_from: string;
    week_to: string;
    top_topics_limit?: number;
    top_tickets_limit?: number;
    prompt?: string;
  }
): Promise<WeeklyGenerateResponse> =>
  requestJsonWithBody<WeeklyGenerateResponse>(
    `/projects/${projectIdentifier}/schedule_report/weekly/generate`,
    'POST',
    payload,
    weeklyError((status) => t('api.generateWeeklyReport', { status }))
  );

export const prepareWeeklyPrompt = async (
  projectIdentifier: string,
  payload: {
    project_id: number;
    version_id: number;
    week_from: string;
    week_to: string;
    top_topics_limit?: number;
    top_tickets_limit?: number;
  }
): Promise<WeeklyPrepareResponse> =>
  requestJsonWithBody<WeeklyPrepareResponse>(
    `/projects/${projectIdentifier}/schedule_report/weekly/prepare`,
    'POST',
    payload,
    weeklyError((status) => t('api.prepareWeeklyPrompt', { status }))
  );

export const saveWeeklyReport = async (
  projectIdentifier: string,
  payload: {
    project_id: number;
    version_id: number;
    week_from: string;
    week_to: string;
    week: string;
    destination_issue_id: number;
    markdown: string;
    generated_at: string;
  }
): Promise<WeeklySaveResponse> =>
  requestJsonWithBody<WeeklySaveResponse>(
    `/projects/${projectIdentifier}/schedule_report/weekly/save`,
    'POST',
    payload,
    weeklyError((status) => t('api.saveWeeklyReport', { status }))
  );

export const fetchWeeklyAiResponses = async (
  projectIdentifier: string,
  params: {
    selected_project_identifier?: string;
    selected_version_id?: number;
  } = {}
): Promise<AiResponseTabsPayload> => {
  const query = new URLSearchParams();
  if (params.selected_project_identifier) {
    query.set('selected_project_identifier', params.selected_project_identifier);
  }
  if (params.selected_version_id) {
    query.set('selected_version_id', String(params.selected_version_id));
  }

  return requestJson<AiResponseTabsPayload>(
    appendQuery(`/projects/${projectIdentifier}/schedule_report/weekly/ai_responses`, query),
    weeklyError((status) => t('api.fetchWeeklyAiResponses', { status }))
  );
};
