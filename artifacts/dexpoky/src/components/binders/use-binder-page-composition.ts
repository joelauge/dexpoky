import { useEffect, useMemo, useState } from "react";
import type { BinderPage } from "@workspace/api-client-react";
import {
  activeSpreadPageIndexes,
  adjacentSpreadPageIndexes,
  pageGeometrySignature,
  stablePageCompositionKey,
  updatePageCompositionLru,
} from "./binder-page-window";

export function useBinderPageComposition(pages: BinderPage[], spreadIndex: number, binderId?: string | number) {
  const indexes = useMemo(
    () => adjacentSpreadPageIndexes(pages.length, spreadIndex),
    [pages.length, spreadIndex],
  );
  const activeIndexes = useMemo(
    () => activeSpreadPageIndexes(pages.length, spreadIndex),
    [pages.length, spreadIndex],
  );
  const windowPages = indexes.map((index) => pages[index]);
  const activePages = activeIndexes.map((index) => pages[index]);
  const windowKeys = windowPages.map((page) => stablePageCompositionKey(page, binderId));
  const activeKeys = activePages.map((page) => stablePageCompositionKey(page, binderId));
  const layoutSignature = JSON.stringify(windowPages.map(pageGeometrySignature));
  const windowSignature = JSON.stringify(windowKeys);
  const [lru, setLru] = useState<string[]>(() =>
    updatePageCompositionLru([], windowKeys, activeKeys, 6, false),
  );

  useEffect(() => {
    setLru((previous) => updatePageCompositionLru(previous, windowKeys, activeKeys, 6, false));
    let idleHandle = 0;
    let timeoutHandle = 0;
    let cancelled = false;
    const compose = () => {
      if (cancelled) return;
      setLru((previous) => updatePageCompositionLru(previous, windowKeys, activeKeys, 6, true));
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) idleHandle = idleWindow.requestIdleCallback(compose, { timeout: 160 });
    else timeoutHandle = window.setTimeout(compose, 48);
    return () => {
      cancelled = true;
      if (idleHandle && idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleHandle);
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
    };
  }, [binderId, windowSignature, layoutSignature, activeKeys.join("|")]);

  const composedKeys = new Set([...lru, ...activeKeys]);
  return {
    windowPages: windowPages.filter((page): page is BinderPage => !!page),
    activePageKeys: activeKeys,
    composedPageKeys: composedKeys,
  };
}