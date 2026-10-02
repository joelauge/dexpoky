export function pageSurfaceOffset(x: number, y: number, width: number, height: number, curl = 0, hinge = false) {
  const nx = x / (width / 2);
  const ny = y / (height / 2);
  const restBow = 0.022 * Math.max(0, 1 - nx * nx) * (0.84 + 0.16 * Math.max(0, 1 - ny * ny));
  const fromHinge = hinge ? (x + width / 2) / width : Math.abs(nx);
  return restBow + curl * fromHinge * fromHinge * (0.82 + 0.18 * Math.max(0, 1 - ny * ny));
}

export function pageSurfaceRotation(x: number, y: number, width: number, height: number, curl = 0, hinge = false) {
  const epsilon = 0.012;
  const dx = (pageSurfaceOffset(x + epsilon, y, width, height, curl, hinge) - pageSurfaceOffset(x - epsilon, y, width, height, curl, hinge)) / (2 * epsilon);
  const dy = (pageSurfaceOffset(x, y + epsilon, width, height, curl, hinge) - pageSurfaceOffset(x, y - epsilon, width, height, curl, hinge)) / (2 * epsilon);
  return { x: Math.atan(dy), y: -Math.atan(dx) };
}

export function pageTurnCurl(progress: number, amplitude = 0.12) {
  const boundedProgress = Math.max(0, Math.min(1, progress));
  const recoveryCurve = 16 * boundedProgress * boundedProgress * (1 - boundedProgress) * (1 - boundedProgress);
  return amplitude * recoveryCurve;
}

export function clampViewAngle(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value));
}