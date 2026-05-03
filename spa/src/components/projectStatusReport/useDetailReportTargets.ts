import type { CategoryBar, ProjectInfo } from '../../services/scheduleReportTypes';
import type { DetailReportTarget } from '../../services/detailReportTargetStorage';
import { detailReportTargetKey } from '../../services/detailReportTargetStorage';
import type { TimelineLane } from './timeline';

export function buildDetailReportTargets(
  bars: CategoryBar[],
  availableProjects: ProjectInfo[]
): DetailReportTarget[] {
  const projectMap = new Map(
    availableProjects.map((project) => [project.project_id, project])
  );

  const targetMap = new Map<string, DetailReportTarget>();

  for (const bar of bars) {
    if (!bar.version_id) continue;

    const project = projectMap.get(bar.project_id);
    if (!project) continue;

    const key = `${bar.project_id}:${bar.version_id}`;

    if (!targetMap.has(key)) {
      targetMap.set(key, {
        projectId: bar.project_id,
        projectIdentifier: project.identifier,
        projectName: project.name,
        versionId: bar.version_id,
        versionName: bar.version_name || 'No version'
      });
    }
  }

  return Array.from(targetMap.values());
}

export function buildVisibleDetailReportTargets(lanes: TimelineLane[]): DetailReportTarget[] {
  const targetMap = new Map<string, DetailReportTarget>();

  for (const lane of lanes) {
    if (!lane.projectId || !lane.projectIdentifier || !lane.projectName || !lane.versionId) continue;

    const target: DetailReportTarget = {
      projectId: lane.projectId,
      projectIdentifier: lane.projectIdentifier,
      projectName: lane.projectName,
      versionId: lane.versionId,
      versionName: lane.versionName
    };
    targetMap.set(detailReportTargetKey(target), target);
  }

  return Array.from(targetMap.values());
}
