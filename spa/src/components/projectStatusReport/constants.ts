

export type StatusStyle = {
  fill: string;
  text: string;
  stroke: string;
  label: string;
  textStroke?: string;
  textStrokeWidth?: string;
};

export const STATUS: Record<'COMPLETED' | 'IN_PROGRESS' | 'PENDING', StatusStyle> = {
  COMPLETED: {
    fill: '#1e3a8a',
    text: '#ffffff',
    stroke: '#1e3a8a',
    label: '完了',
    textStroke: 'transparent',
    textStrokeWidth: '0px'
  },
  IN_PROGRESS: {
    fill: '#2563eb',
    text: '#1e3a8a',
    stroke: '#2563eb',
    label: '進行中',
    textStroke: '#ffffff',
    textStrokeWidth: '3px'
  },
  PENDING: {
    fill: '#f1f5f9',
    text: '#475569',
    stroke: '#94a3b8',
    label: '未着手',
    textStroke: '#ffffff',
    textStrokeWidth: '3px'
  }
};


