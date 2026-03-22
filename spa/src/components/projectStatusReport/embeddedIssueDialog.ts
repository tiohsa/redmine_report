import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export const MAX_DIALOG_VIEWPORT_HEIGHT_RATIO = 0.9;
export const MIN_DIALOG_HEIGHT_PX = 320;
export const DEFAULT_DIALOG_WIDTH_PX = 1600;
export const COMPACT_ICON_BUTTON_SIZE = 24;
export const COMPACT_ACTION_BUTTON_HEIGHT = 28;
export const COMPACT_ACTION_BUTTON_MIN_WIDTH = 88;
export const ISSUE_DIALOG_STYLE_ID = 'rr-embedded-issue-dialog-style';

type ObserverWindow = Window & {
  ResizeObserver?: typeof ResizeObserver;
  MutationObserver?: typeof MutationObserver;
};

type MaybeRef = RefObject<HTMLElement | null> | undefined;

type EmbeddedIssueDialogStyleOptions = {
  contentPadding?: string;
  extraCss?: string;
  styleId?: string;
};

const ISSUE_DIALOG_HIDE_SELECTORS = [
  '#top-menu',
  '#header',
  '#main-menu',
  '#sidebar',
  '#footer',
  '#quick-search',
  '#content > h2',
  '#content > .contextual',
  '#issue-form > p.buttons',
  '#issue-form > .buttons',
  '#issue-form > input[name="commit"]',
  '#issue-form > button[name="commit"]',
  '#issue-form > input[name="continue"]',
  '#issue-form > button[name="continue"]',
  '#issue-form > input[type="submit"]',
  '#issue-form > a[href*="preview"]',
  '#issue-form > a[href*="/issues"]',
  '#issue-form > a[onclick*="history.back"]',
  '#edit_issue > p.buttons',
  '#edit_issue > .buttons',
  '#edit_issue > input[name="commit"]',
  '#edit_issue > button[name="commit"]',
  '#edit_issue > input[name="continue"]',
  '#edit_issue > button[name="continue"]',
  '#edit_issue > input[type="submit"]',
  '#edit_issue > a[href*="preview"]',
  '#edit_issue > a[href*="/issues"]',
  '#edit_issue > a[onclick*="history.back"]',
  '#new_issue > p.buttons',
  '#new_issue > .buttons',
  '#new_issue > input[name="commit"]',
  '#new_issue > button[name="commit"]',
  '#new_issue > input[name="continue"]',
  '#new_issue > button[name="continue"]',
  '#new_issue > input[type="submit"]',
  '#new_issue > a[href*="preview"]',
  '#new_issue > a[href*="/issues"]',
  '#new_issue > a[onclick*="history.back"]',
  '#redmine-report-bulk-issue-creation-root',
];

const ISSUE_DIALOG_ERROR_SELECTORS = [
  '#errorExplanation',
  '.errorExplanation',
  '#flash_error',
  '.flash.error',
  '.flash-error',
  '.conflict',
];

const getElementOuterHeight = (element: HTMLElement | null): number => {
  if (!element) return 0;
  return Math.ceil(element.getBoundingClientRect().height);
};

const getDocumentScrollHeight = (element: HTMLElement): number =>
  Math.max(
    element.scrollHeight,
    element.clientHeight,
    element.offsetHeight,
    Math.ceil(element.getBoundingClientRect().height),
  );

export const getEmbeddedDialogContentHeight = (doc: Document): number => {
  const querySelector = typeof doc.querySelector === 'function'
    ? doc.querySelector.bind(doc)
    : null;
  const candidates = [
    querySelector?.<HTMLElement>('#content') ?? null,
    querySelector?.<HTMLElement>('#main') ?? null,
    doc.body,
    doc.documentElement,
  ];

  for (const element of candidates) {
    if (!element) continue;
    const height = getDocumentScrollHeight(element);
    if (height > 0) return height;
  }

  return 0;
};

export const getEmbeddedDialogDefaultHeight = (): number =>
  Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO);

export const applyEmbeddedIssueDialogStyles = (
  doc: Document,
  { contentPadding = '16px', extraCss = '', styleId = ISSUE_DIALOG_STYLE_ID }: EmbeddedIssueDialogStyleOptions = {},
): void => {
  if (typeof doc.getElementById === 'function' && doc.getElementById(styleId)) return;
  if (typeof doc.createElement !== 'function' || !doc.head?.appendChild) return;

  const style = doc.createElement('style');
  style.id = styleId;
  style.textContent = `
${ISSUE_DIALOG_HIDE_SELECTORS.join(', ')} { display: none !important; }
html, body, #wrapper, #main { height: auto !important; min-height: 0 !important; }
html, body { overflow-y: auto !important; overflow-x: hidden !important; }
body { background: #fff !important; }
#wrapper, #main, #content {
  margin: 0 !important;
  width: 100% !important;
  background: #fff !important;
}
#content {
  padding: ${contentPadding} !important;
}
${extraCss}
`;
  doc.head.appendChild(style);
};

export const getEmbeddedIssueDialogErrorMessage = (doc: Document): string | null => {
  const querySelector = typeof doc.querySelector === 'function'
    ? doc.querySelector.bind(doc)
    : null;

  for (const selector of ISSUE_DIALOG_ERROR_SELECTORS) {
    const element = querySelector?.<HTMLElement>(selector) ?? null;
    const text = element?.textContent?.trim();
    if (text) return text;
  }
  return null;
};

export const bindIframeEscapeHandler = (
  doc: Document,
  onClose: () => void,
): (() => void) => {
  const onIframeEsc = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  doc.addEventListener('keydown', onIframeEsc, true);
  return () => {
    doc.removeEventListener('keydown', onIframeEsc, true);
  };
};

export const useEmbeddedIssueDialogLayout = ({
  isOpen,
  iframeRef,
  headerRef,
  footerRef,
  sectionRef,
  errorRef,
}: {
  isOpen: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  headerRef?: MaybeRef;
  footerRef?: MaybeRef;
  sectionRef?: MaybeRef;
  errorRef?: MaybeRef;
}) => {
  const [dialogHeightPx, setDialogHeightPx] = useState<number | null>(null);
  const iframeSizeObserverCleanupRef = useRef<(() => void) | null>(null);
  const dialogResizeCleanupRef = useRef<(() => void) | null>(null);

  const measureDialogHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) {
      setDialogHeightPx(getEmbeddedDialogDefaultHeight());
      return;
    }

    const maxHeightPx = getEmbeddedDialogDefaultHeight();
    const chromeHeight =
      getElementOuterHeight(headerRef?.current ?? null) +
      getElementOuterHeight(errorRef?.current ?? null) +
      getElementOuterHeight(sectionRef?.current ?? null) +
      getElementOuterHeight(footerRef?.current ?? null);
    const iframeContentHeight = getEmbeddedDialogContentHeight(doc);
    const nextHeight = Math.min(
      maxHeightPx,
      Math.max(MIN_DIALOG_HEIGHT_PX, chromeHeight + iframeContentHeight),
    );

    setDialogHeightPx(nextHeight);
  }, [errorRef, footerRef, headerRef, iframeRef, sectionRef]);

  const bindIframeSizeObservers = useCallback((doc: Document) => {
    iframeSizeObserverCleanupRef.current?.();

    const cleanupCallbacks: Array<() => void> = [];
    const iframeWindow = iframeRef.current?.contentWindow as ObserverWindow | null;
    const resizeObserverCtor = iframeWindow?.ResizeObserver ?? window.ResizeObserver;
    const mutationObserverCtor = iframeWindow?.MutationObserver ?? window.MutationObserver;

    if (typeof resizeObserverCtor !== 'undefined') {
      const resizeObserver = new resizeObserverCtor(() => {
        measureDialogHeight();
      });
      const querySelector = typeof doc.querySelector === 'function'
        ? doc.querySelector.bind(doc)
        : null;
      const resizeTargets = [
        querySelector?.<HTMLElement>('#content') ?? null,
        querySelector?.<HTMLElement>('#main') ?? null,
        doc.body,
        doc.documentElement,
      ].filter((element): element is HTMLElement => Boolean(element));

      resizeTargets.forEach((element) => resizeObserver.observe(element));
      cleanupCallbacks.push(() => resizeObserver.disconnect());
    }

    if (typeof mutationObserverCtor !== 'undefined' && doc.body) {
      const mutationObserver = new mutationObserverCtor(() => {
        measureDialogHeight();
      });
      mutationObserver.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      cleanupCallbacks.push(() => mutationObserver.disconnect());
    }

    iframeSizeObserverCleanupRef.current = () => {
      cleanupCallbacks.forEach((cleanup) => cleanup());
    };
  }, [iframeRef, measureDialogHeight]);

  const resetLayout = useCallback(() => {
    iframeSizeObserverCleanupRef.current?.();
    iframeSizeObserverCleanupRef.current = null;
    dialogResizeCleanupRef.current?.();
    dialogResizeCleanupRef.current = null;
    setDialogHeightPx(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetLayout();
      return;
    }

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        measureDialogHeight();
      })
      : null;

    const handleResize = () => {
      measureDialogHeight();
    };

    [headerRef?.current, footerRef?.current, sectionRef?.current, errorRef?.current]
      .filter((element): element is HTMLElement => Boolean(element))
      .forEach((element) => resizeObserver?.observe(element));

    window.addEventListener('resize', handleResize);
    dialogResizeCleanupRef.current = () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };

    measureDialogHeight();

    return () => {
      dialogResizeCleanupRef.current?.();
      dialogResizeCleanupRef.current = null;
    };
  }, [errorRef, footerRef, headerRef, isOpen, measureDialogHeight, resetLayout, sectionRef]);

  useEffect(() => () => {
    resetLayout();
  }, [resetLayout]);

  return {
    dialogHeightPx,
    measureDialogHeight,
    bindIframeSizeObservers,
    resetLayout,
  };
};
