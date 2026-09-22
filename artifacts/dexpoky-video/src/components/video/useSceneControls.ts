import { useCallback, useMemo, useState } from 'react';

const stripRepeatSuffix = (key: string) => key.replace(/_r[12]$/, '');

function rotateFromIndex(durations: Record<string, number>, start: number) {
  const keys = Object.keys(durations);
  if (start <= 0) return durations;
  return Object.fromEntries(
    keys.map((_, index) => {
      const key = keys[(start + index) % keys.length];
      return [key, durations[key]];
    }),
  );
}

export function useSceneControls(baseDurations: Record<string, number>) {
  const sceneKeys = useMemo(() => Object.keys(baseDurations), [baseDurations]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [tick, setTick] = useState(0);

  const durations = useMemo(() => {
    if (!locked) return rotateFromIndex(baseDurations, activeIndex);
    const key = sceneKeys[activeIndex];
    return { [`${key}_r1`]: baseDurations[key], [`${key}_r2`]: baseDurations[key] };
  }, [activeIndex, baseDurations, locked, sceneKeys]);

  const totalDuration = useMemo(
    () => Object.values(baseDurations).reduce((sum, duration) => sum + duration, 0),
    [baseDurations],
  );
  const activeStartTime = sceneKeys
    .slice(0, activeIndex)
    .reduce((sum, key) => sum + baseDurations[key], 0);

  const onSceneChange = useCallback((rawKey: string) => {
    const index = sceneKeys.indexOf(stripRepeatSuffix(rawKey));
    if (index >= 0) setActiveIndex(index);
    setTick((value) => value + 1);
  }, [sceneKeys]);

  const jumpTo = useCallback((index: number) => {
    setActiveIndex(index);
    setPaused(false);
    setMountKey((value) => value + 1);
    setTick((value) => value + 1);
  }, []);

  const toggleLock = useCallback(() => {
    setLocked((value) => !value);
    setPaused(false);
    setMountKey((value) => value + 1);
    setTick((value) => value + 1);
  }, []);

  return {
    sceneKeys,
    activeIndex,
    locked,
    paused,
    mountKey,
    tick,
    durations,
    activeDuration: baseDurations[sceneKeys[activeIndex]] ?? 0,
    activeStartTime,
    totalDuration,
    onSceneChange,
    jumpTo,
    toggleLock,
    togglePause: () => setPaused((value) => !value),
  };
}