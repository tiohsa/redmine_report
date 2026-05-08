import { describe, expect, it, vi } from 'vitest';
import { UI_SANS_FONT_FAMILY } from './fonts';
import { drawExecutiveBar } from './executiveTimelineRenderer';

const mocks = vi.hoisted(() => ({
  drawStrokeTextMock: vi.fn(),
  truncateCanvasTextMock: vi.fn((_: CanvasRenderingContext2D, text: string) => text)
}));

vi.mock('./canvasTimelineRenderer', () => ({
  drawStrokeText: (...args: unknown[]) => mocks.drawStrokeTextMock(...args),
  truncateCanvasText: (...args: unknown[]) => mocks.truncateCanvasTextMock(...args)
}));

describe('drawExecutiveBar', () => {
  it('does not render a progress percentage label on the bar', () => {
    const ctx = {
      beginPath: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      roundRect: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      fillStyle: '#000000'
    } as unknown as CanvasRenderingContext2D;

    drawExecutiveBar(ctx, {
      x: 10,
      y: 20,
      width: 120,
      height: 24,
      fill: '#1456f0',
      progress: 65,
      label: 'Feature work',
      chartScale: 1
    });

    expect(mocks.truncateCanvasTextMock).toHaveBeenCalledWith(ctx, 'Feature work', 200, `700 11px ${UI_SANS_FONT_FAMILY}`);
    expect(mocks.drawStrokeTextMock).toHaveBeenCalledTimes(1);
    expect(mocks.drawStrokeTextMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        text: 'Feature work'
      })
    );
    expect(mocks.drawStrokeTextMock.mock.calls.some(([, options]) => options.text === '65%')).toBe(false);
  });
});
