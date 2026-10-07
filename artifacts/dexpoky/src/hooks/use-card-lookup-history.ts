import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { addLookupHistory, lookupHistoryStorageKey, parseLookupHistory, type LookupHistoryEntry } from "@/lib/card-lookup-history";

const CHANGED = "dexpoky:lookup-history-changed";
function read(userId: string) {
  try {
    return { entries: parseLookupHistory(localStorage.getItem(lookupHistoryStorageKey(userId))), available: true };
  } catch {
    return { entries: [] as LookupHistoryEntry[], available: false };
  }
}

export function useCardLookupHistory() {
  const { user } = useUser();
  const userId = user?.id;
  const [snapshot, setSnapshot] = useState<{ userId?: string; entries: LookupHistoryEntry[]; available: boolean }>({
    entries: [], available: true,
  });
  useEffect(() => {
    if (!userId) { setSnapshot({ entries: [], available: true }); return; }
    const reload = () => setSnapshot({ userId, ...read(userId) });
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === lookupHistoryStorageKey(userId)) reload();
    };
    const onChange = (event: Event) => { if ((event as CustomEvent<string>).detail === userId) reload(); };
    reload();
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGED, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGED, onChange);
    };
  }, [userId]);

  const record = useCallback((entry: LookupHistoryEntry) => {
    if (!userId) return;
    const stored = read(userId);
    const entries = addLookupHistory(stored.entries, entry);
    try {
      if (!stored.available) throw new Error("Browser storage unavailable");
      localStorage.setItem(lookupHistoryStorageKey(userId), JSON.stringify(entries));
      setSnapshot({ userId, entries, available: true });
      window.dispatchEvent(new CustomEvent(CHANGED, { detail: userId }));
    } catch {
      setSnapshot((previous) => ({
        userId,
        entries: addLookupHistory(previous.userId === userId ? previous.entries : stored.entries, entry),
        available: false,
      }));
    }
  }, [userId]);
  return {
    userId, record,
    entries: snapshot.userId === userId ? snapshot.entries : [],
    storageAvailable: snapshot.userId === userId ? snapshot.available : true,
  };
}
