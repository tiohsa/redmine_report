import { t } from '../../i18n';
import { WeeklyApiError } from '../../services/scheduleReportApi';

export type BulkIssuePayload = {
    subject: string;
    status_id?: number;
    priority_id?: number;
    assigned_to_id?: number;
    start_date?: string | null;
    due_date?: string | null;
    done_ratio?: number;
    estimated_hours?: number;
};

export const createIssue = async (
    projectIdentifier: string,
    parentIssueId: number,
    payload: BulkIssuePayload
): Promise<any> => {
    // Use standard web endpoint instead of REST JSON endpoint to keep session-based auth.
    const path = '/issues';
    const formData = new URLSearchParams();
    formData.set('issue[project_id]', String(projectIdentifier));
    formData.set('issue[parent_issue_id]', String(parentIssueId));
    formData.set('issue[subject]', payload.subject);

    if (payload.status_id !== undefined) formData.set('issue[status_id]', String(payload.status_id));
    if (payload.priority_id !== undefined) formData.set('issue[priority_id]', String(payload.priority_id));
    if (payload.assigned_to_id !== undefined) formData.set('issue[assigned_to_id]', String(payload.assigned_to_id));
    if (payload.start_date !== undefined && payload.start_date !== null) formData.set('issue[start_date]', payload.start_date);
    if (payload.due_date !== undefined && payload.due_date !== null) formData.set('issue[due_date]', payload.due_date);
    if (payload.done_ratio !== undefined) formData.set('issue[done_ratio]', String(payload.done_ratio));
    if (payload.estimated_hours !== undefined) formData.set('issue[estimated_hours]', String(payload.estimated_hours));

    const res = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || ''
        },
        body: formData.toString()
    });

    if (!res.ok) {
        const errorBody = await res.text().catch(() => '');
        const messages = errorBody || t('api.fetchFailed');
        throw new WeeklyApiError(messages, res.status);
    }

    return { success: true };
};
