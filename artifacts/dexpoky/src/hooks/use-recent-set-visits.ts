import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { addSetVisit, parseSetVisits, setVisitStorageKey, type SetVisit } from "@/lib/recent-set-activity";

const VISITS_CHANGED = "dexpoky:set-visits-changed";

function readVisits(userId: string): { visits: SetVisit[]; available: boolean } {
  try {
    return { visits: parseSetVisits(window.localStorage.getItem(setVisitStorageKey(userId))), available: true };
  } catch {
    return { visits: [], available: false };
  }
}

export function recordSetVisit(userId: string, setId: string): boolean {
  try {
    const stored = readVisits(userId);
    if (!stored.available) return false;
    window.localStorage.setItem(setVisitStorageKey(userId), JSON.stringify(addSetVisit(stored.visits, setId)));
    window.dispatchEvent(new CustomEvent(VISITS_CHANGED, { detail: userId }));
    return true;
  } catch {
    return false;
  }
}

export function useRecentSetVisits() {
  const { user } = useUser();
  const userId = user?.id;
  const [snapshot, setSnapshot] = useState<{ userId?: string; visits: SetVisit[]; available: boolean }>({
    visits: [], available: true,
  });
  useEffect(() => {
    if (!userId) {
      setSnapshot({ visits: [], available: true });
      return;
    }
    const reload = () => setSnapshot({ userId, ...readVisits(userId) });
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === setVisitStorageKey(userId)) reload();
    };
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === userId) reload();
    };
    reload();
    window.addEventListener("storage", onStorage);
    window.addEventListener(VISITS_CHANGED, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(VISITS_CHANGED, onChange);
    };
  }, [userId]);
  return {
    visits: snapshot.userId === userId ? snapshot.visits : [],
    storageAvailable: snapshot.userId === userId ? snapshot.available : true,
  };
}