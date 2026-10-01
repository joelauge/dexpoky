export interface PhotoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Map a guide in an object-cover, center-positioned preview back to camera pixels. */
export function cardPhotoCrop(
  source: { width: number; height: number },
  preview: { width: number; height: number },
  frame: PhotoRect,
): PhotoRect {
  if (![source.width, source.height, preview.width, preview.height, frame.width, frame.height]
    .every((n) => Number.isFinite(n) && n > 0) ||
    !Number.isFinite(frame.x) || !Number.isFinite(frame.y) ||
    frame.x < 0 || frame.y < 0 ||
    frame.x + frame.width > preview.width + 0.5 ||
    frame.y + frame.height > preview.height + 0.5) {
    throw new Error("The card frame is outside the camera preview.");
  }
  const scale = Math.max(preview.width / source.width, preview.height / source.height);
  const offsetX = (source.width * scale - preview.width) / 2;
  const offsetY = (source.height * scale - preview.height) / 2;
  const x = Math.max(0, (frame.x + offsetX) / scale);
  const y = Math.max(0, (frame.y + offsetY) / scale);
  return {
    x, y,
    width: Math.min(frame.width / scale, source.width - x),
    height: Math.min(frame.height / scale, source.height - y),
  };
}