import { t } from '../../i18n';

export type StatusStyle = {
  code: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  fill: string;
  text: string;
  stroke: string;
  label: string;
  accent?: string;
  progressText?: string;
  dateText?: string;
  textStroke?: string;
  textStrokeWidth?: string;
};

const clampProgress = (progress: number) => Math.max(0, Math.min(100, Number(progress || 0)));

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`;

const mixHex = (from: string, to: string, ratio: number) => {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const mix = Math.max(0, Math.min(1, ratio));

  return rgbToHex({
    r: start.r + (end.r - start.r) * mix,
    g: start.g + (end.g - start.g) * mix,
    b: start.b + (end.b - start.b) * mix
  });
};

export const getProgressFillColor = (progress: number) => {
  const value = clampProgress(progress);

  if (value <= 0) return '#94a3b8';
  if (value >= 100) return '#2563eb';

  if (value <= 30) {
    return mixHex('#f97316', '#fbbf24', value / 30);
  }
  if (value <= 65) {
    return mixHex('#fbbf24', '#3b82f6', (value - 30) / 35);
  }

  return mixHex('#3b82f6', '#2563eb', (value - 65) / 35);
};

export const getProgressTrackColor = () => '#d9e2ec';

export const buildStatusStyles = (): Record<'COMPLETED' | 'IN_PROGRESS' | 'PENDING', StatusStyle> => ({
  COMPLETED: {
    code: 'COMPLETED',
    fill: '#253248',
    text: '#1e293b',
    stroke: '#94a3b8',
    label: t('status.completed'),
    accent: '#2563eb',
    progressText: '#1f2937',
    dateText: '#475569',
    textStroke: 'transparent',
    textStrokeWidth: '0px'
  },
  IN_PROGRESS: {
    code: 'IN_PROGRESS',
    fill: '#253248',
    text: '#1e293b',
    stroke: '#94a3b8',
    label: t('status.inProgress'),
    accent: '#f97316',
    progressText: '#1f2937',
    dateText: '#475569',
    textStroke: 'transparent',
    textStrokeWidth: '0px'
  },
  PENDING: {
    code: 'PENDING',
    fill: '#253248',
    text: '#1e293b',
    stroke: '#94a3b8',
    label: t('status.pending'),
    accent: '#64748b',
    progressText: '#1f2937',
    dateText: '#475569',
    textStroke: 'transparent',
    textStrokeWidth: '0px'
  }
});
