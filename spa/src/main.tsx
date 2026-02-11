import React from 'react';
import { createRoot } from 'react-dom/client';
import { ScheduleReportPage } from './components/ScheduleReportPage';
import './main.css';

const mount = document.getElementById('schedule-report-root');

if (mount) {
  createRoot(mount).render(
    <React.StrictMode>
      <ScheduleReportPage />
    </React.StrictMode>
  );
}
