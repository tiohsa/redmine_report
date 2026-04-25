import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type TaskDetailIssue } from '../../../services/scheduleReportApi';
import { type TreeNodeType } from './shared';

export const useTaskDetailsTree = (
  issues: TaskDetailIssue[],
  selectedIssueId: number | null
) => {
  const issueRowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const registerIssueRowRef = useCallback((issueId: number, element: HTMLDivElement | null) => {
    issueRowRefs.current[issueId] = element;
  }, []);

  const treeRoots = useMemo(() => {
    const map = new Map<number, TreeNodeType>();
    issues.forEach(issue => {
      map.set(issue.issue_id, { ...issue, children: [] });
    });

    const roots: TreeNodeType[] = [];
    issues.forEach(issue => {
      const node = map.get(issue.issue_id)!;
      if (issue.parent_id && map.has(issue.parent_id)) {
        map.get(issue.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }, [issues]);

  useEffect(() => {
    if (!selectedIssueId) return;

    const rowElement = issueRowRefs.current[selectedIssueId];
    if (!rowElement) return;

    rowElement.scrollIntoView({
      block: 'center',
      inline: 'nearest'
    });
  }, [selectedIssueId, issues]);

  return {
    treeRoots,
    issueRowRefs,
    registerIssueRowRef
  };
};
