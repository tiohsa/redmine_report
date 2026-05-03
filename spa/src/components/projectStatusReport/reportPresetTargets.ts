import type { CategoryBar, ProjectInfo } from '../../services/scheduleReportTypes';
import type { ReportPreset, ReportPresetTarget } from '../../services/reportPresetStorage';

export function buildReportPresetTargets(
  bars: CategoryBar[],
  availableProjects: ProjectInfo[]
): ReportPresetTarget[] {
  const projectMap = new Map(
    availableProjects.map((project) => [project.project_id, project])
  );

  const targetMap = new Map<string, ReportPresetTarget>();

  for (const bar of bars) {
    if (!bar.version_id) continue;

    const project = projectMap.get(bar.project_id);
    if (!project) continue;

    const key = `${bar.project_id}:${bar.version_id}`;
    if (targetMap.has(key)) continue;

    targetMap.set(key, {
      projectId: bar.project_id,
      projectIdentifier: project.identifier,
      projectName: project.name,
      versionId: bar.version_id,
      versionName: bar.version_name || 'No version'
    });
  }

  return Array.from(targetMap.values());
}

export function filterBarsByReportPreset(
  bars: CategoryBar[],
  preset: ReportPreset | null
): CategoryBar[] {
  if (!preset) return bars;

  const targetKeys = new Set(
    preset.targets.map((target) => `${target.projectId}:${target.versionId}`)
  );

  return bars.filter((bar) => {
    if (!bar.version_id) return false;
    return targetKeys.has(`${bar.project_id}:${bar.version_id}`);
  });
}

