import { useUiStore } from '../stores/uiStore';
import { buildIssueListUrl } from '../services/issueLinkService';

export const wireBarClickNavigation = (projectIdentifier: string, categoryId: number): void => {
  window.location.href = buildIssueListUrl(projectIdentifier, categoryId);
};

export const wireBarHover = (barKey: string | null): void => {
  const setHovered = useUiStore.getState().setHoveredBarKey;
  setHovered(barKey);
};
