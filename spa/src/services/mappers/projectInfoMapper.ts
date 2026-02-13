import type { ProjectInfo } from '../scheduleReportApi';

export const mapProjectInfo = (projects: ProjectInfo[]): ProjectInfo[] =>
    projects.map((p) => ({
        project_id: p.project_id,
        identifier: p.identifier,
        name: p.name,
        level: p.level,
        parent_project_id: p.parent_project_id ?? null,
        selectable: p.selectable ?? true
    }));
