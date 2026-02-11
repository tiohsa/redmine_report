import { describe, expect, it } from 'vitest';
import { useUiStore } from '../uiStore';

describe('useUiStore', () => {
  it('updates filters', () => {
    useUiStore.getState().setFilters({ months: 6 });
    expect(useUiStore.getState().filters.months).toBe(6);
  });
});
