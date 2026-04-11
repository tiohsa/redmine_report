export type ChevronDrawOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  pointDepth: number;
  hasLeftNotch: boolean;
  fill: string;
  stroke: string;
  progress?: number;
  separatorColor?: string;
  shadow?: boolean;
};

export type DiamondDrawOptions = {
  centerX: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  shadow?: boolean;
};

export type TriangleDrawOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
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

const STRIPE_BG = '#f8fafc';
const STRIPE_LINE = '#e2e8f0';
const PROGRESS_REMAINDER = '#cbd5e1';

const createChevronPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  pointDepth: number,
  hasLeftNotch: boolean
) => {
  const rightBaseX = x + Math.max(width - pointDepth, 0);
  const rightTipX = x + width;

  ctx.beginPath();
  if (hasLeftNotch) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + pointDepth, y + height / 2);
    ctx.lineTo(x, y + height);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + height);
  }
  ctx.lineTo(rightBaseX, y + height);
  ctx.lineTo(rightTipX, y + height / 2);
  ctx.lineTo(rightBaseX, y);
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

const fillPendingStripe = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  ctx.save();
  ctx.fillStyle = STRIPE_BG;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = STRIPE_LINE;
  ctx.lineWidth = 2;
  for (let offset = -height; offset < width + height; offset += 6) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset - height, y + height);
    ctx.stroke();
  }
  ctx.restore();
};

const fillShape = (
  ctx: CanvasRenderingContext2D,
  fill: string,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  if (fill === 'url(#stripePattern)') {
    fillPendingStripe(ctx, x, y, width, height);
    return;
  }
  ctx.fillStyle = fill;
  ctx.fill();
};

const withShadow = (ctx: CanvasRenderingContext2D, enabled?: boolean) => {
  if (!enabled) return;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
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
    stroke,
    progress,
    separatorColor = 'white',
    shadow
  } = options;

  ctx.save();
  withShadow(ctx, shadow);
  createChevronPath(ctx, x, y, width, height, pointDepth, hasLeftNotch);
  ctx.save();
  ctx.clip();

  if (progress !== undefined && progress >= 0 && progress < 100) {
    const progressWidth = (width * progress) / 100;
    if (progressWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, progressWidth, height);
      ctx.clip();
      createChevronPath(ctx, x, y, width, height, pointDepth, hasLeftNotch);
      fillShape(ctx, fill, x, y, width, height);
      ctx.restore();
    }

    if (progressWidth < width) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + progressWidth, y, width - progressWidth, height);
      ctx.clip();
      createChevronPath(ctx, x, y, width, height, pointDepth, hasLeftNotch);
      ctx.fillStyle = PROGRESS_REMAINDER;
      ctx.fill();
      ctx.restore();
    }
  } else {
    fillShape(ctx, fill, x, y, width, height);
  }

  ctx.restore();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = stroke;
  createChevronPath(ctx, x, y, width, height, pointDepth, hasLeftNotch);
  ctx.stroke();

  if (hasLeftNotch && separatorColor !== 'transparent') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + pointDepth, y + height / 2);
    ctx.lineTo(x, y + height);
    ctx.strokeStyle = separatorColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
};

export const drawDiamond = (ctx: CanvasRenderingContext2D, options: DiamondDrawOptions) => {
  const { centerX, y, width, height, fill, stroke, shadow } = options;
  const halfWidth = width / 2;

  ctx.save();
  withShadow(ctx, shadow);
  createDiamondPath(ctx, centerX, y, width, height);
  ctx.save();
  ctx.clip();
  fillShape(ctx, fill, centerX - halfWidth, y, width, height);
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
  const { x, y, width, height, fill, stroke, shadow } = options;

  ctx.save();
  withShadow(ctx, shadow);
  createTrianglePath(ctx, x, y, width, height);
  ctx.save();
  ctx.clip();
  fillShape(ctx, fill, x, y, width, height);
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

export const drawRoundedOutline = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  stroke: string,
  strokeWidth: number,
  dash?: number[]
) => {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 6);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.setLineDash(dash ?? []);
  ctx.stroke();
  ctx.restore();
};
