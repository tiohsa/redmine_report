import type { ProjectRow } from '../scheduleReportApi';

export const mapProjectRows = (rows: ProjectRow[]): ProjectRow[] =>
  rows.map((row) => ({
    project_id: row.project_id,
    identifier: row.identifier,
    name: row.name,
    parent_project_id: row.parent_project_id,
    level: row.level,
    expanded: row.expanded
  }));
