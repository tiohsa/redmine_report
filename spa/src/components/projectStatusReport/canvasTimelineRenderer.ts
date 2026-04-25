export type ChevronDrawOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  pointDepth: number;
  hasLeftNotch: boolean;
  fill: string;
  trackFill?: string;
  stroke: string;
  progress?: number;
  separatorColor?: string;
  accent?: string;
  shadow?: boolean;
};

export type DiamondDrawOptions = {
  centerX: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  trackFill?: string;
  stroke: string;
  progress?: number;
  shadow?: boolean;
};

export type TriangleDrawOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  trackFill?: string;
  stroke: string;
  progress?: number;
  shadow?: boolean;
};

export type StrokeTextOptions = {
  text: string;
  x: number;
  y: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  font: string;
  textAlign?: CanvasTextAlign;
  textBaseline?: CanvasTextBaseline;
};

const CHEVRON_ACCENT_HEIGHT = 4;
const CHEVRON_RIGHT_HEAD_RATIO = 0.62;

const getChevronMetrics = (width: number, pointDepth: number) => {
  const rightHeadDepth = Math.min(pointDepth * CHEVRON_RIGHT_HEAD_RATIO, Math.max(width * 0.16, 10));

  return {
    rightHeadDepth
  };
};

const createChevronPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  pointDepth: number,
  hasLeftNotch: boolean
) => {
  const { rightHeadDepth } = getChevronMetrics(width, pointDepth);
  const rightBaseX = x + Math.max(width - rightHeadDepth, 4);
  const rightTipX = x + width;
  const radius = Math.min(height / 2, 8); // Modern rounding

  ctx.beginPath();
  if (hasLeftNotch) {
    ctx.moveTo(x, y);
    ctx.lineTo(rightBaseX, y);
    ctx.lineTo(rightTipX, y + height / 2);
    ctx.lineTo(rightBaseX, y + height);
    ctx.lineTo(x, y + height);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(rightBaseX, y);
    ctx.lineTo(rightTipX, y + height / 2);
    ctx.lineTo(rightBaseX, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
  }
  ctx.closePath();
};

const createDiamondPath = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  width: number,
  height: number
) => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  ctx.beginPath();
  ctx.moveTo(centerX, y);
  ctx.lineTo(centerX + halfWidth, y + halfHeight);
  ctx.lineTo(centerX, y + height);
  ctx.lineTo(centerX - halfWidth, y + halfHeight);
  ctx.closePath();
};

const createTrianglePath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y + height / 2);
  ctx.lineTo(x, y + height);
  ctx.closePath();
};

const fillShape = (
  ctx: CanvasRenderingContext2D,
  fill: string,
  _x: number,
  _y: number,
  _width: number,
  _height: number
) => {
  ctx.fillStyle = fill;
  ctx.fill();
};

const fillProgressShape = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  trackFill: string,
  progress?: number
) => {
  const clampedProgress = Math.max(0, Math.min(100, Number(progress ?? 100)));
  fillShape(ctx, trackFill, x, y, width, height);

  if (clampedProgress <= 0) return;

  const progressWidth = Math.max(0, Math.min(width, (width * clampedProgress) / 100));
  if (progressWidth <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, progressWidth, height);
  ctx.clip();
  fillShape(ctx, fill, x, y, width, height);
  ctx.restore();
};

const withShadow = (ctx: CanvasRenderingContext2D, enabled?: boolean) => {
  if (!enabled) return;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'; // MiniMax standard shadow opacity
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
};

export const prepareHiDPICanvas = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D | null => {
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    return null;
  }
  if (!context) return null;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(dpr, dpr);
  context.clearRect(0, 0, width, height);

  return context;
};

export const drawChevron = (ctx: CanvasRenderingContext2D, options: ChevronDrawOptions) => {
  const {
    x,
    y,
    width,
    height,
    pointDepth,
    hasLeftNotch,
    fill,
    trackFill = '#d9e2ec',
    stroke,
    progress = 100,
    accent,
    shadow
  } = options;
  const { rightHeadDepth } = getChevronMetrics(width, pointDepth);
  const rightBaseX = x + Math.max(width - rightHeadDepth, 4);
  const accentY = y + height + 2;

  ctx.save();
  withShadow(ctx, shadow);
  createChevronPath(ctx, x, y, width, height, pointDepth, hasLeftNotch);
  ctx.save();
  ctx.clip();
  fillProgressShape(ctx, x, y, width, height, fill, trackFill, progress);

  ctx.restore();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = 'miter';
  createChevronPath(ctx, x, y, width, height, pointDepth, hasLeftNotch);
  ctx.stroke();

  if (accent) {
    ctx.beginPath();
    ctx.moveTo(x + 4, accentY);
    ctx.lineTo(rightBaseX - 2, accentY);
    ctx.strokeStyle = accent;
    ctx.lineWidth = CHEVRON_ACCENT_HEIGHT;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  ctx.restore();
};

export const drawDiamond = (ctx: CanvasRenderingContext2D, options: DiamondDrawOptions) => {
  const { centerX, y, width, height, fill, trackFill = '#d9e2ec', stroke, progress = 100, shadow } = options;
  const halfWidth = width / 2;

  ctx.save();
  withShadow(ctx, shadow);
  createDiamondPath(ctx, centerX, y, width, height);
  ctx.save();
  ctx.clip();
  fillProgressShape(ctx, centerX - halfWidth, y, width, height, fill, trackFill, progress);
  ctx.restore();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  createDiamondPath(ctx, centerX, y, width, height);
  ctx.stroke();
  ctx.restore();
};

export const drawTriangle = (ctx: CanvasRenderingContext2D, options: TriangleDrawOptions) => {
  const { x, y, width, height, fill, trackFill = '#d9e2ec', stroke, progress = 100, shadow } = options;

  ctx.save();
  withShadow(ctx, shadow);
  createTrianglePath(ctx, x, y, width, height);
  ctx.save();
  ctx.clip();
  fillProgressShape(ctx, x, y, width, height, fill, trackFill, progress);
  ctx.restore();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  createTrianglePath(ctx, x, y, width, height);
  ctx.stroke();
  ctx.restore();
};

export const drawStrokeText = (ctx: CanvasRenderingContext2D, options: StrokeTextOptions) => {
  const {
    text,
    x,
    y,
    fill,
    stroke = '#ffffff',
    strokeWidth = 3,
    font,
    textAlign = 'center',
    textBaseline = 'middle'
  } = options;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = textAlign;
  ctx.textBaseline = textBaseline;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
};

export const truncateCanvasText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string => {
  if (maxWidth <= 0) return '';
  ctx.save();
  ctx.font = font;
  const metrics = ctx.measureText(text);
  if (metrics.width <= maxWidth) {
    ctx.restore();
    return text;
  }

  const ellipsis = '…';
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  if (ellipsisWidth > maxWidth) {
    ctx.restore();
    return '';
  }

  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  ctx.restore();
  return truncated + ellipsis;
};
