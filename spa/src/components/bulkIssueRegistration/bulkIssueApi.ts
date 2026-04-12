import { t } from '../../i18n';
import { WeeklyApiError } from '../../services/scheduleReportApi';

export type BulkIssuePayload = {
    subject: string;
    tracker_id?: number;
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
    // Post to project-specific endpoint to avoid needing numerical project ID
    const path = `/projects/${projectIdentifier}/issues`;
    const formData = new URLSearchParams();
    
    // Standard form parameters
    formData.set('utf8', '✓');
    formData.set('issue[parent_issue_id]', String(parentIssueId));
    formData.set('issue[subject]', payload.subject);

    // Only append fields if they are not null or undefined
    if (payload.tracker_id != null) formData.set('issue[tracker_id]', String(payload.tracker_id));
    if (payload.status_id != null) formData.set('issue[status_id]', String(payload.status_id));
    if (payload.priority_id != null) formData.set('issue[priority_id]', String(payload.priority_id));
    if (payload.assigned_to_id != null) formData.set('issue[assigned_to_id]', String(payload.assigned_to_id));
    if (payload.start_date != null) formData.set('issue[start_date]', payload.start_date);
    if (payload.due_date != null) formData.set('issue[due_date]', payload.due_date);
    if (payload.done_ratio != null) formData.set('issue[done_ratio]', String(payload.done_ratio));
    if (payload.estimated_hours != null) formData.set('issue[estimated_hours]', String(payload.estimated_hours));

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
