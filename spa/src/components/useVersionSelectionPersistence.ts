import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';

const versionSelectionStorageKey = (rootProjectIdentifier: string) =>
  `redmine_report.schedule.selectedVersions.${rootProjectIdentifier || 'default'}`;
const versionOrderStorageKey = (rootProjectIdentifier: string) =>
  `redmine_report.schedule.versionOrder.${rootProjectIdentifier || 'default'}`;

const readStoredVersionSelection = (rootProjectIdentifier: string): string[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(versionSelectionStorageKey(rootProjectIdentifier));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : null;
  } catch {
    return null;
  }
};

const writeStoredVersionSelection = (rootProjectIdentifier: string, versions: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(versionSelectionStorageKey(rootProjectIdentifier), JSON.stringify(versions));
  } catch {
    // Ignore storage failures
  }
};

const readStoredVersionOrder = (rootProjectIdentifier: string): string[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(versionOrderStorageKey(rootProjectIdentifier));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : null;
  } catch {
    return null;
  }
};

const writeStoredVersionOrder = (rootProjectIdentifier: string, versions: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(versionOrderStorageKey(rootProjectIdentifier), JSON.stringify(versions));
  } catch {
    // Ignore storage failures
  }
};

const normalizeVersionOrder = (storedOrder: string[] | null, allVersions: string[]): string[] => {
  const allVersionSet = new Set(allVersions);
  const storedExisting = (storedOrder || []).filter((version) => allVersionSet.has(version));
  const storedSet = new Set(storedExisting);
  const appended = allVersions.filter((version) => !storedSet.has(version));
  return [...storedExisting, ...appended];
};

const areSameVersions = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((version, index) => version === right[index]);

export const useVersionSelectionPersistence = (rootProjectIdentifier: string, allVersions: string[]) => {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [orderedVersions, setOrderedVersions] = useState<string[]>([]);
  const skipNextPersistRef = useRef(false);
  const skipNextOrderPersistRef = useRef(false);

  useEffect(() => {
    if (allVersions.length === 0) {
      setSelectedVersions([]);
      return;
    }

    skipNextPersistRef.current = true;
    setSelectedVersions((current) => {
      const stored = readStoredVersionSelection(rootProjectIdentifier);
      const nextVersions = stored !== null
        ? stored.filter((version) => allVersions.includes(version))
        : allVersions;

      if (areSameVersions(current, nextVersions)) {
        return current;
      }

      return nextVersions;
    });
  }, [allVersions, rootProjectIdentifier]);

  useEffect(() => {
    if (allVersions.length === 0) {
      setOrderedVersions([]);
      return;
    }

    skipNextOrderPersistRef.current = true;
    setOrderedVersions((current) => {
      const stored = readStoredVersionOrder(rootProjectIdentifier);
      const nextOrder = normalizeVersionOrder(stored, allVersions);
      if (areSameVersions(current, nextOrder)) {
        return current;
      }
      return nextOrder;
    });
  }, [allVersions, rootProjectIdentifier]);

  useEffect(() => {
    if (allVersions.length === 0) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    writeStoredVersionSelection(rootProjectIdentifier, selectedVersions);
  }, [allVersions.length, rootProjectIdentifier, selectedVersions]);

  useEffect(() => {
    if (allVersions.length === 0) return;
    if (skipNextOrderPersistRef.current) {
      skipNextOrderPersistRef.current = false;
      return;
    }

    writeStoredVersionOrder(rootProjectIdentifier, orderedVersions);
  }, [allVersions.length, orderedVersions, rootProjectIdentifier]);

  return {
    selectedVersions,
    setSelectedVersions,
    orderedVersions,
    setOrderedVersions
  };
};
