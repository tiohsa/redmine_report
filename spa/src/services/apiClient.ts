import { t } from '../i18n';

export type ResponseErrorParser = (res: Response) => Promise<Error>;
export type ErrorMessageFactory = (status: number) => string;

const SAME_ORIGIN_CREDENTIALS: RequestCredentials = 'same-origin';
const JSON_CONTENT_TYPE = 'application/json';

export class WeeklyApiError extends Error {
  status: number;
  code?: string;
  retryable?: boolean;

  constructor(message: string, status: number, code?: string, retryable?: boolean) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export const appendQuery = (path: string, query: URLSearchParams | string) => {
  const suffix = typeof query === 'string' ? query : query.toString();
  return suffix ? `${path}?${suffix}` : path;
};

const csrfToken = () =>
  (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || '';

const jsonHeaders = (headers?: HeadersInit): HeadersInit => ({
  'Content-Type': JSON_CONTENT_TYPE,
  'X-CSRF-Token': csrfToken(),
  ...(headers || {})
});

export const request = (path: string, init?: RequestInit) =>
  fetch(path, { credentials: SAME_ORIGIN_CREDENTIALS, ...init });

export const parseFetchScheduleReportError = async (res: Response) => {
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  return new Error(String(body.error || t('api.fetchScheduleReport', { status: res.status })));
};

const parseWeeklyError = async (res: Response, fallback: string) => {
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  return new WeeklyApiError(
    String(body.message || body.error || fallback),
    res.status,
    typeof body.code === 'string' ? body.code : undefined,
    typeof body.retryable === 'boolean' ? body.retryable : undefined
  );
};

export const weeklyError = (messageForStatus: ErrorMessageFactory): ResponseErrorParser => (res) =>
  parseWeeklyError(res, messageForStatus(res.status));

export const requestJson = async <T>(
  path: string,
  parseError: ResponseErrorParser,
  init?: RequestInit
): Promise<T> => {
  const res = await request(path, init);
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as T;
};

export const requestJsonWithBody = <T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  parseError: ResponseErrorParser,
  init?: Omit<RequestInit, 'method' | 'body'>
) =>
  requestJson<T>(path, parseError, {
    ...init,
    method,
    headers: jsonHeaders(init?.headers),
    body: JSON.stringify(body)
  });
