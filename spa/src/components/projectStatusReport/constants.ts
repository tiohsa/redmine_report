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
  return '#3b82f6';
};

export const getProgressTrackColor = () => '#d9e2ec';

export const buildStatusStyles = (): Record<'COMPLETED' | 'IN_PROGRESS' | 'PENDING', StatusStyle> => ({
  COMPLETED: {
    code: 'COMPLETED',
    fill: '#1456f0', // Brand Blue (brand-6)
    text: '#ffffff',
    stroke: '#1456f0',
    label: t('status.completed'),
    accent: '#ffffff',
    progressText: '#ffffff',
    dateText: '#475569',
    textStroke: 'transparent',
    textStrokeWidth: '0px'
  },
  IN_PROGRESS: {
    code: 'IN_PROGRESS',
    fill: '#3daeff', // Sky Blue (brand-00)
    text: '#ffffff',
    stroke: '#3daeff',
    label: t('status.inProgress'),
    accent: '#ea5ec1', // Brand Pink accent
    progressText: '#ffffff',
    dateText: '#475569',
    textStroke: 'transparent',
    textStrokeWidth: '0px'
  },
  PENDING: {
    code: 'PENDING',
    fill: '#f2f3f5', // Border Light (Surface)
    text: '#45515e', // Dark Gray (Text-04)
    stroke: '#e5e7eb', // Border Gray
    label: t('status.pending'),
    accent: '#8e8e93', // Mid Gray
    progressText: '#45515e',
    dateText: '#475569',
    textStroke: 'transparent',
    textStrokeWidth: '0px'
  }
});
