export type ReportPresetTarget = {
  projectId: number;
  projectIdentifier: string;
  projectName: string;
  versionId: number;
  versionName: string;
};

export type ReportPreset = {
  id: string;
  name: string;
  targets: ReportPresetTarget[];
  detailReportIssueId?: number | null;
  detailReportIssueStatus?: 'UNBOUND' | 'VALID' | 'INVALID' | 'FORBIDDEN' | 'NOT_FOUND' | 'PROJECT_MISMATCH';
  detailReportIssueValidatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReportPresetSettings = {
  presets: ReportPreset[];
  activePresetId?: string | null;
};

const reportPresetsKey = (rootProjectIdentifier: string) =>
  `redmine_report.reportPresets.${rootProjectIdentifier}`;

const activeReportPresetKey = (rootProjectIdentifier: string) =>
  `redmine_report.activeReportPresetId.${rootProjectIdentifier}`;

const validIssueStatuses = new Set([
  'UNBOUND',
  'VALID',
  'INVALID',
  'FORBIDDEN',
  'NOT_FOUND',
  'PROJECT_MISMATCH'
]);

const nowIso = () => new Date().toISOString();

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const toPositiveInteger = (value: unknown): number | null => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

export const sanitizeReportPresetTargets = (targets: unknown): ReportPresetTarget[] => {
  if (!Array.isArray(targets)) return [];

  const seen = new Set<string>();
  const sanitized: ReportPresetTarget[] = [];

  targets.forEach((target) => {
    if (!target || typeof target !== 'object') return;
    const row = target as Record<string, unknown>;
    const projectId = toPositiveInteger(row.projectId);
    const versionId = toPositiveInteger(row.versionId);
    if (!projectId || !versionId) return;

    const key = `${projectId}:${versionId}`;
    if (seen.has(key)) return;
    seen.add(key);

    sanitized.push({
      projectId,
      projectIdentifier: typeof row.projectIdentifier === 'string' ? row.projectIdentifier : '',
      projectName: typeof row.projectName === 'string' && row.projectName.trim() ? row.projectName.trim() : `Project ${projectId}`,
      versionId,
      versionName: typeof row.versionName === 'string' && row.versionName.trim() ? row.versionName.trim() : 'No version'
    });
  });

  return sanitized;
};

const sanitizePreset = (preset: unknown): ReportPreset | null => {
  if (!preset || typeof preset !== 'object') return null;
  const row = preset as Record<string, unknown>;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) return null;

  const targets = sanitizeReportPresetTargets(row.targets);
  if (targets.length === 0) return null;

  const createdAt = typeof row.createdAt === 'string' && row.createdAt ? row.createdAt : nowIso();
  const updatedAt = typeof row.updatedAt === 'string' && row.updatedAt ? row.updatedAt : createdAt;
  const issueId = row.detailReportIssueId == null ? null : toPositiveInteger(row.detailReportIssueId);
  const rawStatus = typeof row.detailReportIssueStatus === 'string' ? row.detailReportIssueStatus : undefined;

  return {
    id: typeof row.id === 'string' && row.id ? row.id : makeId(),
    name,
    targets,
    detailReportIssueId: issueId,
    detailReportIssueStatus: rawStatus && validIssueStatuses.has(rawStatus) ? rawStatus as ReportPreset['detailReportIssueStatus'] : (issueId ? 'VALID' : 'UNBOUND'),
    detailReportIssueValidatedAt: typeof row.detailReportIssueValidatedAt === 'string' ? row.detailReportIssueValidatedAt : null,
    createdAt,
    updatedAt
  };
};

const loadPresets = (rootProjectIdentifier: string): ReportPreset[] => {
  try {
    const raw = localStorage.getItem(reportPresetsKey(rootProjectIdentifier));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed?.presets;
    if (!Array.isArray(rows)) return [];
    return rows.map(sanitizePreset).filter((preset): preset is ReportPreset => Boolean(preset));
  } catch {
    return [];
  }
};

const persistPresets = (rootProjectIdentifier: string, presets: ReportPreset[]) => {
  localStorage.setItem(reportPresetsKey(rootProjectIdentifier), JSON.stringify(presets));
};

export const reportPresetStorage = {
  load(rootProjectIdentifier: string): ReportPresetSettings {
    const presets = loadPresets(rootProjectIdentifier);
    const activePresetId = this.getActivePresetId(rootProjectIdentifier);
    return {
      presets,
      activePresetId: activePresetId && presets.some((preset) => preset.id === activePresetId) ? activePresetId : null
    };
  },

  save(rootProjectIdentifier: string, settings: ReportPresetSettings): void {
    const presets = (settings.presets || [])
      .map(sanitizePreset)
      .filter((preset): preset is ReportPreset => Boolean(preset));
    persistPresets(rootProjectIdentifier, presets);
    this.setActivePresetId(
      rootProjectIdentifier,
      settings.activePresetId && presets.some((preset) => preset.id === settings.activePresetId)
        ? settings.activePresetId
        : null
    );
  },

  list(rootProjectIdentifier: string): ReportPreset[] {
    return loadPresets(rootProjectIdentifier);
  },

  getActivePresetId(rootProjectIdentifier: string): string | null {
    return localStorage.getItem(activeReportPresetKey(rootProjectIdentifier));
  },

  setActivePresetId(rootProjectIdentifier: string, presetId: string | null): void {
    if (presetId) {
      localStorage.setItem(activeReportPresetKey(rootProjectIdentifier), presetId);
      return;
    }
    localStorage.removeItem(activeReportPresetKey(rootProjectIdentifier));
  },

  create(rootProjectIdentifier: string, input: { name: string; targets: ReportPresetTarget[] }): ReportPreset {
    const name = input.name.trim();
    const targets = sanitizeReportPresetTargets(input.targets);
    if (!name || targets.length === 0) {
      throw new Error('Invalid report preset');
    }
    const timestamp = nowIso();
    const preset: ReportPreset = {
      id: makeId(),
      name,
      targets,
      detailReportIssueId: null,
      detailReportIssueStatus: 'UNBOUND',
      detailReportIssueValidatedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const presets = loadPresets(rootProjectIdentifier);
    persistPresets(rootProjectIdentifier, [...presets, preset]);
    return preset;
  },

  update(rootProjectIdentifier: string, preset: ReportPreset): ReportPreset {
    const sanitized = sanitizePreset({ ...preset, updatedAt: nowIso() });
    if (!sanitized) throw new Error('Invalid report preset');
    const presets = loadPresets(rootProjectIdentifier);
    const nextPresets = presets.some((row) => row.id === sanitized.id)
      ? presets.map((row) => (row.id === sanitized.id ? sanitized : row))
      : [...presets, sanitized];
    persistPresets(rootProjectIdentifier, nextPresets);
    return sanitized;
  },

  remove(rootProjectIdentifier: string, presetId: string): void {
    const presets = loadPresets(rootProjectIdentifier).filter((preset) => preset.id !== presetId);
    persistPresets(rootProjectIdentifier, presets);
    if (this.getActivePresetId(rootProjectIdentifier) === presetId) {
      this.setActivePresetId(rootProjectIdentifier, null);
    }
  }
};

