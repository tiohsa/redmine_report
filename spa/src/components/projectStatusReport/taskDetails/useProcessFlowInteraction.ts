import { addDays, format, parseISO } from 'date-fns';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { type TaskDetailIssue } from '../../../services/scheduleReportApi';
import {
  PROCESS_FLOW_DRAG_THRESHOLD_PX,
  type ProcessFlowDragMode,
  type ProcessFlowDragSession,
  type ProcessFlowStep
} from './processFlowGeometry';

type UseProcessFlowInteractionOptions = {
  pixelsPerDay?: number;
  issuesRef: MutableRefObject<TaskDetailIssue[]>;
  savingIssueIdsRef: MutableRefObject<Record<number, boolean>>;
  saveProcessFlowDates: (row: TaskDetailIssue, startDate: string, dueDate: string) => Promise<TaskDetailIssue | null>;
  onStepUpdated?: (updated: TaskDetailIssue) => void;
};

export const useProcessFlowInteraction = ({
  pixelsPerDay,
  issuesRef,
  savingIssueIdsRef,
  saveProcessFlowDates,
  onStepUpdated
}: UseProcessFlowInteractionOptions) => {
  const [processDragSession, setProcessDragSession] = useState<ProcessFlowDragSession | null>(null);
  const [suppressProcessClickIssueId, setSuppressProcessClickIssueId] = useState<number | null>(null);
  const processDragRef = useRef<ProcessFlowDragSession | null>(null);

  useEffect(() => {
    processDragRef.current = processDragSession;
  }, [processDragSession]);

  useEffect(() => {
    if (!processDragSession || !pixelsPerDay) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== processDragSession.pointerId) {
        return;
      }

      const session = processDragRef.current;
      if (!session) {
        return;
      }

      const deltaX = event.clientX - session.startClientX;
      if (Math.abs(deltaX) < PROCESS_FLOW_DRAG_THRESHOLD_PX && !session.moved) {
        return;
      }

      const deltaDays = Math.round(deltaX / pixelsPerDay);
      const originalStart = parseISO(session.originalStartDate);
      const originalDue = parseISO(session.originalDueDate);

      let nextStartDate = session.originalStartDate;
      let nextDueDate = session.originalDueDate;

      if (session.mode === 'move') {
        nextStartDate = format(addDays(originalStart, deltaDays), 'yyyy-MM-dd');
        nextDueDate = format(addDays(originalDue, deltaDays), 'yyyy-MM-dd');
      } else if (session.mode === 'resize-left') {
        const nextStart = addDays(originalStart, deltaDays);
        if (nextStart > originalDue) {
          return;
        }
        nextStartDate = format(nextStart, 'yyyy-MM-dd');
      } else {
        const nextDue = addDays(originalDue, deltaDays);
        if (nextDue < originalStart) {
          return;
        }
        nextDueDate = format(nextDue, 'yyyy-MM-dd');
      }

      setProcessDragSession((previous) => previous ? {
        ...previous,
        currentStartDate: nextStartDate,
        currentDueDate: nextDueDate,
        moved: true
      } : null);
    };

    const handlePointerUp = async (event: PointerEvent) => {
      if (event.pointerId !== processDragSession.pointerId) {
        return;
      }

      const session = processDragRef.current;
      if (!session) {
        return;
      }

      if (session.mode !== 'move' || session.moved) {
        setSuppressProcessClickIssueId(session.issueId);
      }

      if (session.moved) {
        const row = issuesRef.current.find((item) => item.issue_id === session.issueId);
        if (row) {
          const updated = await saveProcessFlowDates(row, session.currentStartDate, session.currentDueDate);
          if (updated) {
            onStepUpdated?.(updated);
          }
        }
      }

      setProcessDragSession(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [issuesRef, onStepUpdated, pixelsPerDay, processDragSession, saveProcessFlowDates]);

  const startProcessFlowDrag = useCallback((
    event: ReactPointerEvent<SVGRectElement>,
    step: ProcessFlowStep,
    mode: ProcessFlowDragMode
  ) => {
    if (savingIssueIdsRef.current[step.id] || !step.startDate || !step.dueDate) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const session: ProcessFlowDragSession = {
      issueId: step.id,
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      originalStartDate: step.startDate,
      originalDueDate: step.dueDate,
      currentStartDate: step.startDate,
      currentDueDate: step.dueDate,
      moved: false
    };

    processDragRef.current = session;
    setProcessDragSession(session);
  }, [savingIssueIdsRef]);

  const consumeSuppressedProcessClick = useCallback((issueId: number) => {
    if (suppressProcessClickIssueId !== issueId) {
      return false;
    }

    setSuppressProcessClickIssueId(null);
    return true;
  }, [suppressProcessClickIssueId]);

  const resetProcessFlowInteraction = useCallback(() => {
    processDragRef.current = null;
    setProcessDragSession(null);
    setSuppressProcessClickIssueId(null);
  }, []);

  return {
    processDragSession,
    startProcessFlowDrag,
    consumeSuppressedProcessClick,
    resetProcessFlowInteraction
  };
};
