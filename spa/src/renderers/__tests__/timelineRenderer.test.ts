import { describe, expect, it } from 'vitest';
import { BackgroundRenderer } from '../BackgroundRenderer';

describe('BackgroundRenderer', () => {
  it('calculates line positions', () => {
    const renderer = new BackgroundRenderer();
    const positions = renderer.getMonthLinePositions(4, 1200);

    expect(positions.length).toBe(5);
    expect(positions[0]).toBe(0);
    expect(positions[positions.length - 1]).toBe(1200);
  });
});
