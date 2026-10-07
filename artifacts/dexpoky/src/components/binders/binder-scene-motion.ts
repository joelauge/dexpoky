export function pageSurfaceOffset(x: number, y: number, width: number, height: number, curl = 0, hinge = false) {
  const nx = x / (width / 2);
  const ny = y / (height / 2);
  const restBow = 0.022 * Math.max(0, 1 - nx * nx) * (0.84 + 0.16 * Math.max(0, 1 - ny * ny));
  const fromHinge = hinge ? (x + width / 2) / width : Math.abs(nx);
  const s = Math.max(0, Math.min(1, fromHinge));
  return restBow + curl * (0.65 * s * s + 0.35 * s * s * s) * (0.82 + 0.18 * Math.max(0, 1 - ny * ny));
}

export function pageSurfaceRotation(x: number, y: number, width: number, height: number, curl = 0, hinge = false) {
  const epsilon = 0.012;
  const dx = (pageSurfaceOffset(x + epsilon, y, width, height, curl, hinge) - pageSurfaceOffset(x - epsilon, y, width, height, curl, hinge)) / (2 * epsilon);
  const dy = (pageSurfaceOffset(x, y + epsilon, width, height, curl, hinge) - pageSurfaceOffset(x, y - epsilon, width, height, curl, hinge)) / (2 * epsilon);
  const horizontalTangent = 1 + (
    pageSurfaceShift(x + epsilon, width, curl, hinge) -
    pageSurfaceShift(x - epsilon, width, curl, hinge)
  ) / (2 * epsilon);
  // Normal of the actual pulled-in sheet, not just the undeformed x/z graph.
  const normalY = -horizontalTangent * dy;
  return {
    x: Math.atan2(-normalY, horizontalTangent),
    y: Math.atan2(-dx, Math.hypot(normalY, horizontalTangent)),
  };
}

export function pageTurnCurl(progress: number, amplitude = 0.12) {
  const boundedProgress = Math.max(0, Math.min(1, progress));
  const recoveryCurve = 16 * boundedProgress * boundedProgress * (1 - boundedProgress) * (1 - boundedProgress);
  return amplitude * recoveryCurve;
}

export function clampViewAngle(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value));
}
/** Peak turn bend, scaled to the sheet so small and large pages both visibly flex. */
export function pageTurnAmplitude(width: number, height: number) {
  return Math.max(0.1, Math.min(0.62, 0.15 * width + 0.02 * height));
}

/** Small-slope arc-length correction toward the hinge, based only on resting coordinates. */
export function pageSurfaceShift(x: number, width: number, curl = 0, hinge = true) {
  if (!curl) return 0;
  const s = Math.max(0, Math.min(1, hinge ? (x + width / 2) / width : Math.abs(x / (width / 2))));
  if (s === 0) return 0;
  const integral = (1.69 * s ** 3) / 3 + (2.73 * s ** 4) / 4 + (1.1025 * s ** 5) / 5;
  return -0.5 * curl * curl * integral / width;
}
