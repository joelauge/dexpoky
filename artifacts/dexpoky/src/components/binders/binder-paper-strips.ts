import { pageSurfaceOffset, pageSurfaceRotation, pageSurfaceShift } from "./binder-scene-motion";

/** Shared edge positions make neighboring paper facets meet, rather than intersect. */
export function pageBackingStrip(left: number, right: number, width: number, height: number,
  depth: number, curl = 0, hinge = false, fromRight = false) {
  const edge = (x: number) => {
    const surfaceX = fromRight ? -x : x;
    const rotation = pageSurfaceRotation(surfaceX, 0, width, height, curl, hinge);
    const angle = fromRight ? -rotation.y : rotation.y;
    return {
      x: x + (fromRight ? -1 : 1) * pageSurfaceShift(surfaceX, width, curl, hinge) + Math.sin(angle) * depth,
      z: pageSurfaceOffset(surfaceX, 0, width, height, curl, hinge) + Math.cos(angle) * depth,
    };
  };
  const start = edge(left), end = edge(right);
  const dx = end.x - start.x, dz = end.z - start.z;
  return {
    start, end,
    x: (start.x + end.x) / 2,
    z: (start.z + end.z) / 2,
    length: Math.hypot(dx, dz),
    rotation: Math.atan2(-dz, dx),
  };
}
