/** Bound GPU buffer allocation; CSS artwork keeps native screen resolution. */
export function binderPixelRatio(width: number, height: number, deviceRatio: number, maxBufferSize: number) {
  const w = Math.max(1, width), h = Math.max(1, height);
  return Math.min(
    Math.max(0.1, deviceRatio || 1),
    1.5,
    maxBufferSize / Math.max(w, h),
    Math.sqrt(4_000_000 / (w * h)),
  );
}
