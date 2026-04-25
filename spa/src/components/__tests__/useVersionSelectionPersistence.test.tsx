import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useVersionSelectionPersistence } from '../useVersionSelectionPersistence';

const storageKey = (rootProjectIdentifier: string) =>
  `redmine_report.schedule.selectedVersions.${rootProjectIdentifier || 'default'}`;

describe('useVersionSelectionPersistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores stored selections, filters unavailable versions, and normalizes storage', async () => {
    window.localStorage.setItem(storageKey('ecookbook'), JSON.stringify(['v2', 'v3', 123]));

    const { result } = renderHook(
      ({ rootProjectIdentifier, allVersions }) =>
        useVersionSelectionPersistence(rootProjectIdentifier, allVersions),
      {
        initialProps: {
          rootProjectIdentifier: 'ecookbook',
          allVersions: ['v1', 'v2']
        }
      }
    );

    await waitFor(() => {
      expect(result.current.selectedVersions).toEqual(['v2']);
    });

    expect(window.localStorage.getItem(storageKey('ecookbook'))).toBe(JSON.stringify(['v2']));

    act(() => {
      result.current.setSelectedVersions(['v1']);
    });

    expect(window.localStorage.getItem(storageKey('ecookbook'))).toBe(JSON.stringify(['v1']));
  });

  it('switches selection when the root project changes', async () => {
    window.localStorage.setItem(storageKey('ecookbook'), JSON.stringify(['v2']));
    window.localStorage.setItem(storageKey('child'), JSON.stringify(['v1']));

    const { result, rerender } = renderHook(
      ({ rootProjectIdentifier, allVersions }) =>
        useVersionSelectionPersistence(rootProjectIdentifier, allVersions),
      {
        initialProps: {
          rootProjectIdentifier: 'ecookbook',
          allVersions: ['v1', 'v2']
        }
      }
    );

    await waitFor(() => {
      expect(result.current.selectedVersions).toEqual(['v2']);
    });

    rerender({
      rootProjectIdentifier: 'child',
      allVersions: ['v1', 'v2']
    });

    await waitFor(() => {
      expect(result.current.selectedVersions).toEqual(['v1']);
    });

    act(() => {
      result.current.setSelectedVersions(['v2']);
    });

    expect(window.localStorage.getItem(storageKey('child'))).toBe(JSON.stringify(['v2']));
  });
});
