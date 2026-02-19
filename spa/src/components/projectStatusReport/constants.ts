import { t } from '../../i18n';

export type StatusStyle = {
  code: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  fill: string;
  text: string;
  stroke: string;
  label: string;
  textStroke?: string;
  textStrokeWidth?: string;
};

export const buildStatusStyles = (): Record<'COMPLETED' | 'IN_PROGRESS' | 'PENDING', StatusStyle> => ({
  COMPLETED: {
    code: 'COMPLETED',
    fill: '#1e3a8a',
    text: '#ffffff',
    stroke: '#1e3a8a',
    label: t('status.completed'),
    textStroke: 'transparent',
    textStrokeWidth: '0px'
  },
  IN_PROGRESS: {
    code: 'IN_PROGRESS',
    fill: '#2563eb',
    text: '#1e3a8a',
    stroke: '#2563eb',
    label: t('status.inProgress'),
    textStroke: '#ffffff',
    textStrokeWidth: '3px'
  },
  PENDING: {
    code: 'PENDING',
    fill: '#f1f5f9',
    text: '#475569',
    stroke: '#94a3b8',
    label: t('status.pending'),
    textStroke: '#ffffff',
    textStrokeWidth: '3px'
  }
});

