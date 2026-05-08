import { describe, expect, it } from 'vitest';
import { DENSITY_CONFIG } from '../shared';

describe('task details density config', () => {
  it('keeps the standard density one step smaller than the previous default sizing', () => {
    expect(DENSITY_CONFIG.standard).toMatchObject({
      subjectSize: 'text-[13px]',
      badgeSize: 'text-[10px]',
      idSize: 'text-[10px]',
      progressTextSize: 'text-[11px]',
      dateSize: 'text-[10px]'
    });
  });
});
