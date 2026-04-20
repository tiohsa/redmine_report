import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';

const versionSelectionStorageKey = (rootProjectIdentifier: string) =>
  `redmine_report.schedule.selectedVersions.${rootProjectIdentifier || 'default'}`;

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

const areSameVersions = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((version, index) => version === right[index]);

export const useVersionSelectionPersistence = (rootProjectIdentifier: string, allVersions: string[]) => {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const skipNextPersistRef = useRef(false);

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
    if (allVersions.length === 0) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    writeStoredVersionSelection(rootProjectIdentifier, selectedVersions);
  }, [allVersions.length, rootProjectIdentifier, selectedVersions]);

  return {
    selectedVersions,
    setSelectedVersions
  };
};
