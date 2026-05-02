import { type StrokeTextOptions, drawStrokeText, truncateCanvasText } from './canvasTimelineRenderer';

export type ExecutiveBarOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  progress?: number;
  label?: string;
  chartScale: number;
};

export type ExecutiveMilestoneOptions = {
  centerX: number;
  y: number;
  size: number;
  fill: string;
  label?: string;
  chartScale: number;
};

export type ExecutiveHeaderOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  borderColor: string;
  textColor: string;
};

/**
 * Draw the executive task bar with rounded corners and right-aligned progress %.
 */
export const drawExecutiveBar = (ctx: CanvasRenderingContext2D, options: ExecutiveBarOptions) => {
  const { x, y, width, height, fill, progress = 0, label, chartScale } = options;
  const radius = height / 2; // Full pill radius

  ctx.save();

  // Draw background (light track)
  ctx.fillStyle = '#e2e8f0'; // Light slate for background
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();

  // Draw progress (filled area)
  const clampedProgress = Math.max(0, Math.min(100, progress));
  if (clampedProgress > 0) {
    const progressWidth = (width * clampedProgress) / 100;
    ctx.save();
    // Use the whole bar's path for clipping to ensure rounded ends
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.clip();
    
    // Fill a rectangle up to progressWidth. 
    // The left side will be rounded by the clip, the right side will be a straight line.
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, progressWidth, height);
    ctx.restore();
  }

  // Draw Label (Above the bar)
  if (label) {
    const labelFont = `700 ${Math.max(10, Math.round(11 * chartScale))}px "DM Sans", sans-serif`;
    const displayTitle = truncateCanvasText(ctx, label, Math.max(width, 200), labelFont);
    drawStrokeText(ctx, {
      text: displayTitle,
      x: x,
      y: y - 8 * chartScale,
      fill: '#1e293b',
      stroke: '#ffffff',
      strokeWidth: 3,
      font: labelFont,
      textAlign: 'left'
    });
  }

  // Draw Progress % Text (Outside to the right, blue)
  if (clampedProgress >= 0) {
    const progressText = `${Math.round(clampedProgress)}%`;
    const progressFont = `700 ${Math.max(12, Math.round(13 * chartScale))}px "DM Sans", sans-serif`;
    drawStrokeText(ctx, {
      text: progressText,
      x: x + width + 8 * chartScale,
      y: y + height / 2,
      fill: fill, // Use the same blue as the bar
      stroke: '#ffffff',
      strokeWidth: 3,
      font: progressFont,
      textAlign: 'left'
    });
  }

  ctx.restore();
};

/**
 * Draw an executive milestone as an orange diamond with angled text.
 */
export const drawExecutiveMilestone = (ctx: CanvasRenderingContext2D, options: ExecutiveMilestoneOptions) => {
  const { centerX, y, size, fill, label, chartScale } = options;
  const halfSize = size / 2;
  const centerY = y + halfSize;

  ctx.save();
  
  // Draw diamond (◆)
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - halfSize);
  ctx.lineTo(centerX + halfSize, centerY);
  ctx.lineTo(centerX, centerY + halfSize);
  ctx.lineTo(centerX - halfSize, centerY);
  ctx.closePath();
  ctx.fill();

  // Draw angled text (-45 degrees) near the diamond
  if (label) {
    ctx.translate(centerX + halfSize + 4 * chartScale, centerY - halfSize - 4 * chartScale);
    ctx.rotate(-Math.PI / 4);
    
    const labelFont = `700 ${Math.max(10, Math.round(11 * chartScale))}px "DM Sans", sans-serif`;
    drawStrokeText(ctx, {
      text: label,
      x: 0,
      y: 0,
      fill: '#1e293b',
      stroke: '#ffffff',
      strokeWidth: 3,
      font: labelFont,
      textAlign: 'left',
      textBaseline: 'bottom'
    });
  }

  ctx.restore();
};

/**
 * Draw executive timeline header (months only).
 */
export const drawExecutiveHeader = (ctx: CanvasRenderingContext2D, options: ExecutiveHeaderOptions) => {
  const { x, y, width, height, label, borderColor, textColor } = options;
  
  ctx.save();
  ctx.strokeStyle = borderColor;
  ctx.strokeRect(x, y, width, height);

  drawStrokeText(ctx, {
    text: label,
    x: x + width / 2,
    y: y + height / 2,
    fill: textColor,
    strokeWidth: 0,
    font: '600 12px "DM Sans", sans-serif'
  });
  
  ctx.restore();
};

/**
 * Draw red today line.
 */
export const drawExecutiveTodayLine = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number
) => {
  ctx.save();
  ctx.strokeStyle = '#ef4444'; // Red-500
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + height);
  ctx.stroke();
  ctx.restore();
};
