const destinationKey = (projectId: number, versionId: number) =>
  `redmine_ai_weekly.destinationIssueId.${projectId}.${versionId}`;

const lastVersionKey = (projectId: number) =>
  `redmine_ai_weekly.lastVersionId.${projectId}`;

export const weeklyDestinationStorage = {
  getDestinationIssueId(projectId: number, versionId: number): number | null {
    const raw = window.localStorage.getItem(destinationKey(projectId, versionId));
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },

  setDestinationIssueId(projectId: number, versionId: number, issueId: number): void {
    window.localStorage.setItem(destinationKey(projectId, versionId), String(issueId));
  },

  clearDestinationIssueId(projectId: number, versionId: number): void {
    window.localStorage.removeItem(destinationKey(projectId, versionId));
  },

  getLastVersionId(projectId: number): number | null {
    const raw = window.localStorage.getItem(lastVersionKey(projectId));
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },

  setLastVersionId(projectId: number, versionId: number): void {
    window.localStorage.setItem(lastVersionKey(projectId), String(versionId));
  }
};
