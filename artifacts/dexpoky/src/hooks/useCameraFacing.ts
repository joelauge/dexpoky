import { useState, useRef, useEffect, useCallback } from "react";

export const CAMERA_FACING_KEY = "dexpoky:cameraFacing";

function readFacingMode(): "environment" | "user" {
  try {
    const v = localStorage.getItem(CAMERA_FACING_KEY);
    if (v === "user" || v === "environment") return v;
  } catch { /* ignore */ }
  return "environment";
}

/**
 * Persists and synchronises the camera facing preference across both scanner
 * pages (and any other tabs via the `storage` event).  Returns the current
 * facing mode, a ref to the same value (for use inside callbacks without
 * stale-closure issues), and a setter that also writes to localStorage.
 */
export function useCameraFacing() {
  const [facingMode, setFacingModeState] = useState<"environment" | "user">(readFacingMode);
  const facingModeRef = useRef<"environment" | "user">(facingMode);

  const setFacingMode = useCallback((next: "environment" | "user") => {
    facingModeRef.current = next;
    setFacingModeState(next);
    try { localStorage.setItem(CAMERA_FACING_KEY, next); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CAMERA_FACING_KEY) return;
      const next = e.newValue;
      if (next === "user" || next === "environment") {
        facingModeRef.current = next;
        setFacingModeState(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { facingMode, facingModeRef, setFacingMode };
}
