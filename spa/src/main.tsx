import React from 'react';
import { createRoot } from 'react-dom/client';
import { ScheduleReportPage } from './components/ScheduleReportPage';
import { setLocale } from './i18n';
import { useUiStore } from './stores/uiStore';
import './main.css';

const mount = document.getElementById('schedule-report-root');

if (mount) {
  const identifier = (mount as HTMLElement).dataset.projectId || '';
  setLocale((mount as HTMLElement).dataset.locale);
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
