import React from 'react';
import { createRoot } from 'react-dom/client';
import { ScheduleReportPage } from './components/ScheduleReportPage';
import { BulkIssueRegistrationPanel } from './components/bulkIssueRegistration/BulkIssueRegistrationPanel';
import { setLocale } from './i18n';
import { useUiStore } from './stores/uiStore';
import './main.css';

const mount = document.getElementById('schedule-report-root');
const bulkMount = document.getElementById('redmine-report-bulk-issue-creation-root');

if (mount) {
  const identifier = mount.dataset.projectId || '';
  setLocale(mount.dataset.locale);
  if (identifier) {
    useUiStore.getState().setRootProjectIdentifier(identifier);
    useUiStore.getState().setCurrentProjectIdentifier(identifier);
  }

  createRoot(mount).render(
    <React.StrictMode>
      <ScheduleReportPage />
    </React.StrictMode>
  );
}

if (bulkMount) {
  const projectId = Number(bulkMount.dataset.projectId);
  const projectIdentifier = bulkMount.dataset.projectIdentifier || '';
  const rawParentId = bulkMount.dataset.parentIssueId;
  const parentIssueId = rawParentId ? Number(rawParentId) : undefined;
  setLocale(bulkMount.dataset.locale);

  createRoot(bulkMount).render(
    <React.StrictMode>
      <BulkIssueRegistrationPanel
        projectId={projectId}
        projectIdentifier={projectIdentifier}
        parentIssueId={parentIssueId}
      />
    </React.StrictMode>
  );
}
