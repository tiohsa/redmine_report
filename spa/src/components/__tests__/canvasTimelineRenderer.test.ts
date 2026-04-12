import { describe, expect, it } from 'vitest';
import { drawChevron, drawDiamond, drawTriangle } from '../projectStatusReport/canvasTimelineRenderer';

const getContext = () => {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('canvas context is unavailable');
  return context as any;
};

describe('canvasTimelineRenderer', () => {
  it('draws a chevron with a straight left edge and optional accent line', () => {
    const context = getContext();

    drawChevron(context, {
      x: 10,
      y: 20,
      width: 120,
      height: 36,
      pointDepth: 22,
      hasLeftNotch: true,
      fill: '#253248',
      stroke: '#1c2433',
      accent: '#f97316'
    });

    const moveCalls = context.moveTo.mock.calls as Array<[number, number]>;
    const lineCalls = context.lineTo.mock.calls as Array<[number, number]>;

    expect(moveCalls.some(([x, y]) => x === 10 && y === 20)).toBe(true);
    expect(lineCalls.some(([x, y]) => x === 10 && y === 56)).toBe(true);
    expect(moveCalls.some(([x, y]) => x > 10 && y === 58)).toBe(true);
    expect(lineCalls.some(([, y]) => y === 58)).toBe(true);
  });

  it('draws single-day triangle and diamond markers on canvas', () => {
    const triangleContext = getContext();
    drawTriangle(triangleContext, {
      x: 5,
      y: 8,
      width: 20,
      height: 24,
      fill: '#253248',
      stroke: '#1c2433'
    });

    expect(triangleContext.moveTo).toHaveBeenCalledWith(5, 8);
    expect(triangleContext.lineTo).toHaveBeenCalledWith(25, 20);
    expect(triangleContext.lineTo).toHaveBeenCalledWith(5, 32);

    const diamondContext = getContext();
    drawDiamond(diamondContext, {
      centerX: 20,
      y: 10,
      width: 24,
      height: 24,
      fill: '#253248',
      stroke: '#1c2433'
    });

    expect(diamondContext.moveTo).toHaveBeenCalledWith(20, 10);
    expect(diamondContext.lineTo).toHaveBeenCalledWith(32, 22);
    expect(diamondContext.lineTo).toHaveBeenCalledWith(20, 34);
    expect(diamondContext.lineTo).toHaveBeenCalledWith(8, 22);
  });
});
