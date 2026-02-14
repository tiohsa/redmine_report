import { beforeEach, describe, expect, it } from 'vitest';
import { weeklyDestinationStorage } from '../../services/weeklyDestinationStorage';

describe('weeklyDestinationStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores destination issue by project and version', () => {
    weeklyDestinationStorage.setDestinationIssueId(10, 42, 123);

    expect(weeklyDestinationStorage.getDestinationIssueId(10, 42)).toBe(123);
    expect(weeklyDestinationStorage.getDestinationIssueId(10, 43)).toBeNull();
  });

  it('stores and restores last version by project', () => {
    weeklyDestinationStorage.setLastVersionId(10, 42);

    expect(weeklyDestinationStorage.getLastVersionId(10)).toBe(42);
    expect(weeklyDestinationStorage.getLastVersionId(11)).toBeNull();
  });
});
