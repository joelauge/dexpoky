export function pageSurfaceOffset(x: number, y: number, width: number, height: number, curl = 0, hinge = false) {
  const nx = x / (width / 2);
  const ny = y / (height / 2);
  const restBow = 0.022 * Math.max(0, 1 - nx * nx) * (0.84 + 0.16 * Math.max(0, 1 - ny * ny));
  const fromHinge = hinge ? (x + width / 2) / width : Math.abs(nx);
  const s = Math.max(0, Math.min(1, fromHinge));
  // Integrate a rotating tangent along the sheet instead of lifting an almost
  // planar edge. This is a length-preserving circular arc, anchored at the spine.
  const angle = 2 * curl / width;
  const bend = Math.abs(angle) < 1e-5
    ? width * angle * s * s / 2
    : width * (1 - Math.cos(angle * s)) / angle;
  return restBow + bend;
}

export function pageSurfaceRotation(x: number, y: number, width: number, height: number, curl = 0, hinge = false) {
  const epsilon = 0.012;
  const left = Math.max(-width / 2, x - epsilon);
  const right = Math.min(width / 2, x + epsilon);
  const span = right - left;
  const dx = (pageSurfaceOffset(right, y, width, height, curl, hinge) - pageSurfaceOffset(left, y, width, height, curl, hinge)) / span;
  const dy = (pageSurfaceOffset(x, y + epsilon, width, height, curl, hinge) - pageSurfaceOffset(x, y - epsilon, width, height, curl, hinge)) / (2 * epsilon);
  const horizontalTangent = 1 + (
    pageSurfaceShift(right, width, curl, hinge) -
    pageSurfaceShift(left, width, curl, hinge)
  ) / span;
  // Normal of the actual pulled-in sheet, not just the undeformed x/z graph.
  return {
    x: Math.atan(dy),
    // Preserve the sign of the horizontal tangent: the outer edge really folds
    // past 90°, rather than having its normal flattened back onto the front.
    y: Math.atan2(-dx, horizontalTangent * Math.hypot(1, dy)),
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
export function pageTurnAmplitude(width: number, _height: number, pocketWidth?: number, pocketPitch?: number) {
  if (pocketWidth === undefined) return width * 0.9;
  // A wide rigid pocket cannot follow a tight arc without hovering far above
  // the paper. Keep the normal lift under 4% of page width; usual grids still
  // get the full bend, while wide pockets use a physically shallower arc.
  const maxLift = width * 0.04;
  const halfPocket = pocketWidth / 2;
  const minRadius = (halfPocket * halfPocket + maxLift * maxLift) / (2 * maxLift) + 0.094;
  const limit = Math.min(1.8, width / minRadius);
  if (!pocketPitch || pocketPitch <= pocketWidth) return width * limit / 2;
  // On the concave face, lifting rigid pockets toward the normal shortens
  // their spacing. Corner-to-paper clearance alone cannot prevent neighboring
  // pocket planes from intersecting. Bound the arc by their tangent intersection.
  const margin = (pocketPitch - pocketWidth) * 0.12;
  let low = 0, high = limit;
  for (let iteration = 0; iteration < 24; iteration++) {
    const angle = (low + high) / 2;
    const radius = width / angle;
    const lift = pagePocketClearance(width, pocketWidth, width * angle / 2, 0.094);
    const intersection = (radius - 0.099 - lift) * Math.tan(pocketPitch / (2 * radius));
    if (intersection >= halfPocket + margin) low = angle; else high = angle;
  }
  return width * low / 2;
}

/** Exact horizontal pull-in of the arc, based only on resting coordinates. */
export function pageSurfaceShift(x: number, width: number, curl = 0, hinge = true) {
  if (!curl) return 0;
  const s = Math.max(0, Math.min(1, hinge ? (x + width / 2) / width : Math.abs(x / (width / 2))));
  if (s === 0) return 0;
  const angle = 2 * curl / width;
  return Math.abs(angle) < 1e-5
    ? -width * angle * angle * s ** 3 / 6
    : width * (Math.sin(angle * s) / angle - s);
}

/** Clearance for a rigid pocket above a curved sheet, measured along its normal. */
export function pagePocketClearance(width: number, pocketWidth: number, curl: number, surfaceDepth = 0) {
  const angle = Math.abs(2 * curl / width);
  if (angle < 1e-5) return 0;
  const radius = Math.max(1e-6, width / angle - surfaceDepth);
  const halfPocket = Math.min(pocketWidth / 2, radius);
  // Sagitta at the pocket's tangent-plane edge; rationalized for small bends.
  return halfPocket * halfPocket / (radius + Math.sqrt(radius * radius - halfPocket * halfPocket));
}
