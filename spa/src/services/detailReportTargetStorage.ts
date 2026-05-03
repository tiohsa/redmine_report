export type DetailReportTarget = {
  projectId: number;
  projectIdentifier: string;
  projectName: string;
  versionId: number;
  versionName: string;
};

export type DetailReportTargetSettings = {
  targets: DetailReportTarget[];
  selectedKey: string | null;
  updatedAt: string;
};

const detailReportTargetsKey = (rootProjectIdentifier: string) =>
  `redmine_report.detailReport.targets.${rootProjectIdentifier}`;

export const detailReportTargetKey = (target: Pick<DetailReportTarget, 'projectIdentifier' | 'versionId'>) =>
  `${target.projectIdentifier}:${target.versionId}`;

const isValidTarget = (value: unknown): value is DetailReportTarget => {
  if (!value || typeof value !== 'object') return false;

  const target = value as Partial<DetailReportTarget>;

  return (
    Number.isInteger(target.projectId) &&
    typeof target.projectIdentifier === 'string' &&
    target.projectIdentifier.length > 0 &&
    typeof target.projectName === 'string' &&
    target.projectName.length > 0 &&
    Number.isInteger(target.versionId) &&
    target.versionId > 0 &&
    typeof target.versionName === 'string' &&
    target.versionName.length > 0
  );
};

const readTargets = (rootProjectIdentifier: string): DetailReportTargetSettings | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(detailReportTargetsKey(rootProjectIdentifier));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DetailReportTargetSettings> | null;
    const targets = Array.isArray(parsed?.targets) ? parsed.targets.filter(isValidTarget) : [];
    const targetKeys = new Set(targets.map(detailReportTargetKey));
    const selectedKey = typeof parsed?.selectedKey === 'string' && targetKeys.has(parsed.selectedKey)
      ? parsed.selectedKey
      : null;

    if (targets.length === 0 || typeof parsed?.updatedAt !== 'string' || parsed.updatedAt.length === 0) {
      return null;
    }

    return {
      targets,
      selectedKey,
      updatedAt: parsed.updatedAt
    };
  } catch {
    return null;
  }
};

const writeTargets = (rootProjectIdentifier: string, settings: DetailReportTargetSettings) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(detailReportTargetsKey(rootProjectIdentifier), JSON.stringify(settings));
  } catch {
    // Ignore storage failures (private mode/quota).
  }
};

const clearTargets = (rootProjectIdentifier: string) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(detailReportTargetsKey(rootProjectIdentifier));
  } catch {
    // Ignore storage failures.
  }
};

export const detailReportTargetStorage = {
  load(rootProjectIdentifier: string): DetailReportTargetSettings | null {
    return readTargets(rootProjectIdentifier);
  },
  save(rootProjectIdentifier: string, targets: DetailReportTarget[], selectedKey: string | null = null): DetailReportTargetSettings {
    const validTargets = targets.filter(isValidTarget);
    const targetKeys = new Set(validTargets.map(detailReportTargetKey));
    const settings = {
      targets: validTargets,
      selectedKey: selectedKey && targetKeys.has(selectedKey) ? selectedKey : null,
      updatedAt: new Date().toISOString()
    };
    writeTargets(rootProjectIdentifier, settings);
    return settings;
  },
  select(rootProjectIdentifier: string, selectedKey: string | null): DetailReportTargetSettings | null {
    const settings = readTargets(rootProjectIdentifier);
    if (!settings) return null;

    const targetKeys = new Set(settings.targets.map(detailReportTargetKey));
    const nextSettings = {
      ...settings,
      selectedKey: selectedKey && targetKeys.has(selectedKey) ? selectedKey : null,
      updatedAt: new Date().toISOString()
    };
    writeTargets(rootProjectIdentifier, nextSettings);
    return nextSettings;
  },
  clear(rootProjectIdentifier: string): void {
    clearTargets(rootProjectIdentifier);
  }
};
