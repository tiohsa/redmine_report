import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';

const DETAILS_TOP_PANE_DEFAULT_HEIGHT_PX = 320;
const DETAILS_TOP_PANE_MIN_HEIGHT_PX = 180;
const DETAILS_BOTTOM_PANE_MIN_HEIGHT_PX = 240;
const DETAILS_LAYOUT_FALLBACK_HEIGHT_PX = 760;

type DetailsVerticalResizeSession = {
  pointerId: number;
  startClientY: number;
  startTopPaneHeight: number;
  containerHeight: number;
};

type UseTaskDetailsLayoutOptions = {
  currentAutoFitKey: string | null;
  processFlowChartHeight: number;
};

export function useTaskDetailsLayout({
  currentAutoFitKey,
  processFlowChartHeight
}: UseTaskDetailsLayoutOptions) {
  const detailsLayoutRef = useRef<HTMLDivElement | null>(null);
  const [topPaneHeight, setTopPaneHeight] = useState(DETAILS_TOP_PANE_DEFAULT_HEIGHT_PX);
  const [verticalResizeSession, setVerticalResizeSession] = useState<DetailsVerticalResizeSession | null>(null);
  const verticalResizeRef = useRef<DetailsVerticalResizeSession | null>(null);
  const lastAutoFitKeyRef = useRef<string | null>(null);
  const manualResizeSuppressedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    verticalResizeRef.current = verticalResizeSession;
  }, [verticalResizeSession]);

  const clampTopPaneHeight = useCallback((nextHeight: number, containerHeight: number) => {
    const safeContainerHeight = Number.isFinite(containerHeight) && containerHeight > 0
      ? containerHeight
      : DETAILS_LAYOUT_FALLBACK_HEIGHT_PX;
    const maxHeight = Math.max(
      DETAILS_TOP_PANE_MIN_HEIGHT_PX,
      safeContainerHeight - DETAILS_BOTTOM_PANE_MIN_HEIGHT_PX
    );
    return Math.min(Math.max(nextHeight, DETAILS_TOP_PANE_MIN_HEIGHT_PX), maxHeight);
  }, []);

  const getContainerHeight = useCallback(() => {
    if (!detailsLayoutRef.current) {
      return DETAILS_LAYOUT_FALLBACK_HEIGHT_PX;
    }
    return (
      detailsLayoutRef.current.clientHeight ||
      detailsLayoutRef.current.getBoundingClientRect().height ||
      DETAILS_LAYOUT_FALLBACK_HEIGHT_PX
    );
  }, []);

  const markManualResize = useCallback(() => {
    if (currentAutoFitKey) {
      manualResizeSuppressedKeyRef.current = currentAutoFitKey;
    }
  }, [currentAutoFitKey]);

  const resetLayoutState = useCallback(() => {
    setTopPaneHeight(DETAILS_TOP_PANE_DEFAULT_HEIGHT_PX);
    setVerticalResizeSession(null);
    verticalResizeRef.current = null;
    lastAutoFitKeyRef.current = null;
    manualResizeSuppressedKeyRef.current = null;
  }, []);

  const startVerticalResize = useCallback((event: ReactPointerEvent) => {
    if (!detailsLayoutRef.current) return;
    markManualResize();
    const pointerId = event.pointerId;
    setVerticalResizeSession({
      pointerId,
      startClientY: event.clientY,
      startTopPaneHeight: topPaneHeight,
      containerHeight: detailsLayoutRef.current.clientHeight
    });
    (event.target as HTMLElement).setPointerCapture(pointerId);
  }, [markManualResize, topPaneHeight]);

  const startVerticalResizeWithMouse = useCallback((event: ReactMouseEvent) => {
    if (event.button !== 0 || !detailsLayoutRef.current) return;
    markManualResize();
    setVerticalResizeSession({
      pointerId: -1,
      startClientY: event.clientY,
      startTopPaneHeight: topPaneHeight,
      containerHeight: detailsLayoutRef.current.clientHeight
    });
  }, [markManualResize, topPaneHeight]);

  useEffect(() => {
    if (!verticalResizeSession) return;

    const updateHeight = (clientY: number) => {
      const deltaY = clientY - verticalResizeSession.startClientY;
      const nextHeight = clampTopPaneHeight(
        verticalResizeSession.startTopPaneHeight + deltaY,
        verticalResizeSession.containerHeight
      );
      setTopPaneHeight(nextHeight);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== verticalResizeSession.pointerId) return;
      updateHeight(event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== verticalResizeSession.pointerId) return;
      setVerticalResizeSession(null);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (verticalResizeSession.pointerId !== -1) return;
      updateHeight(event.clientY);
    };

    const handleMouseUp = () => {
      if (verticalResizeSession.pointerId !== -1) return;
      setVerticalResizeSession(null);
    };

    if (verticalResizeSession.pointerId === -1) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [clampTopPaneHeight, verticalResizeSession]);

  const updateVerticalResize = useCallback((clientY: number, pointerId?: number) => {
    if (!verticalResizeRef.current) return;
    if (pointerId !== undefined && pointerId !== verticalResizeRef.current.pointerId) return;
    const deltaY = clientY - verticalResizeRef.current.startClientY;
    const nextHeight = clampTopPaneHeight(
      verticalResizeRef.current.startTopPaneHeight + deltaY,
      verticalResizeRef.current.containerHeight
    );
    setTopPaneHeight(nextHeight);
  }, [clampTopPaneHeight]);

  const stopVerticalResize = useCallback((pointerId?: number) => {
    if (!verticalResizeRef.current) return;
    if (pointerId !== undefined && pointerId !== verticalResizeRef.current.pointerId) return;
    setVerticalResizeSession(null);
  }, []);

  const handleVerticalResizeKeyDown = useCallback((event: ReactKeyboardEvent) => {
    const step = event.shiftKey ? 50 : 24;
    const containerHeight = getContainerHeight();

    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      markManualResize();
      setTopPaneHeight((prev) => clampTopPaneHeight(prev - step, containerHeight));
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      markManualResize();
      setTopPaneHeight((prev) => clampTopPaneHeight(prev + step, containerHeight));
    }
  }, [clampTopPaneHeight, getContainerHeight, markManualResize]);

  useLayoutEffect(() => {
    if (!currentAutoFitKey || !detailsLayoutRef.current) return;
    if (lastAutoFitKeyRef.current === currentAutoFitKey) return;
    if (manualResizeSuppressedKeyRef.current === currentAutoFitKey) return;

    const nextHeight = clampTopPaneHeight(processFlowChartHeight, getContainerHeight());
    lastAutoFitKeyRef.current = currentAutoFitKey;
    setTopPaneHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, [clampTopPaneHeight, currentAutoFitKey, getContainerHeight, processFlowChartHeight]);

  return {
    detailsLayoutRef,
    topPaneHeight,
    verticalResizeSession,
    startVerticalResize,
    startVerticalResizeWithMouse,
    updateVerticalResize,
    stopVerticalResize,
    handleVerticalResizeKeyDown,
    resetLayoutState
  };
}
