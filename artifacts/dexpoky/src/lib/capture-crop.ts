/**
 * Crop a video frame to just the card-shaped guide visible inside the
 * 5:3 viewfinder. Mirrors the on-screen overlay so the bytes we send to
 * the vision API contain only the card itself — smaller upload, faster
 * inference, and less background noise to confuse the model.
 *
 * Both scanners render the same overlay geometry:
 *   - Outer viewport aspect: 5:3 (`aspectRatio: "5 / 3"`)
 *   - Card guide aspect: 5:7 (Pokémon card ratio)
 *   - Card guide height: a fraction of the viewport height (e.g. 0.88)
 *   - The guide is centered both horizontally and vertically
 *   - The video uses `object-cover` to fill the viewport
 *
 * @param video        the live <video> element
 * @param canvas       a hidden <canvas> we can scratch onto
 * @param guideHeight  fraction of viewport height the card guide occupies (0..1)
 * @returns            base64 JPEG data URL, or null if the video isn't ready
 */
export function captureCardCrop(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
  guideHeight: number,
): string | null {
  if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
    return null;
  }

  const VIEWPORT_AR = 5 / 3;
  const CARD_AR     = 5 / 7;

  const videoW = video.videoWidth;
  const videoH = video.videoHeight;
  const videoAR = videoW / videoH;

  // Replicate `object-cover`: scale the video so the SHORTER axis fills the
  // viewport, then crop the overflow on the LONGER axis.
  let visibleW: number;
  let visibleH: number;
  let offsetX: number;
  let offsetY: number;

  if (videoAR > VIEWPORT_AR) {
    // Video is wider than the box → top/bottom of video aligns to box; left/right cropped
    visibleH = videoH;
    visibleW = videoH * VIEWPORT_AR;
    offsetX  = (videoW - visibleW) / 2;
    offsetY  = 0;
  } else {
    // Video is taller than the box → left/right of video aligns to box; top/bottom cropped
    visibleW = videoW;
    visibleH = videoW / VIEWPORT_AR;
    offsetX  = 0;
    offsetY  = (videoH - visibleH) / 2;
  }

  // Card guide region inside the visible viewport, in source-video pixels.
  const cropH = visibleH * guideHeight;
  const cropW = cropH * CARD_AR;
  const cropX = offsetX + (visibleW - cropW) / 2;
  const cropY = offsetY + (visibleH - cropH) / 2;

  canvas.width  = Math.round(cropW);
  canvas.height = Math.round(cropH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    video,
    Math.round(cropX), Math.round(cropY), Math.round(cropW), Math.round(cropH),
    0, 0, canvas.width, canvas.height,
  );
  // Slightly higher quality is fine because the cropped region is much smaller.
  return canvas.toDataURL("image/jpeg", 0.85);
}
