import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useVersionSelectionPersistence } from '../useVersionSelectionPersistence';

const storageKey = (rootProjectIdentifier: string) =>
  `redmine_report.schedule.selectedVersions.${rootProjectIdentifier || 'default'}`;
const orderStorageKey = (rootProjectIdentifier: string) =>
  `redmine_report.schedule.versionOrder.${rootProjectIdentifier || 'default'}`;

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

  it('restores and normalizes stored version order independently from selection', async () => {
    window.localStorage.setItem(storageKey('ecookbook'), JSON.stringify(['v2']));
    window.localStorage.setItem(orderStorageKey('ecookbook'), JSON.stringify(['v2', 'v9', 'v1']));

    const { result } = renderHook(
      ({ rootProjectIdentifier, allVersions }) =>
        useVersionSelectionPersistence(rootProjectIdentifier, allVersions),
      {
        initialProps: {
          rootProjectIdentifier: 'ecookbook',
          allVersions: ['v1', 'v2', 'v3']
        }
      }
    );

    await waitFor(() => {
      expect(result.current.selectedVersions).toEqual(['v2']);
      expect(result.current.orderedVersions).toEqual(['v2', 'v1', 'v3']);
    });

    expect(window.localStorage.getItem(orderStorageKey('ecookbook'))).toBe(JSON.stringify(['v2', 'v1', 'v3']));

    act(() => {
      result.current.setSelectedVersions(['v1']);
    });
    expect(window.localStorage.getItem(orderStorageKey('ecookbook'))).toBe(JSON.stringify(['v2', 'v1', 'v3']));

    act(() => {
      result.current.setOrderedVersions(['v3', 'v2', 'v1']);
    });
    expect(window.localStorage.getItem(orderStorageKey('ecookbook'))).toBe(JSON.stringify(['v3', 'v2', 'v1']));
  });
});
