/**
 * Card image capture utilities.
 *
 * Both exported functions work on the same video/canvas pair and can be called
 * sequentially (captureCardCrop first, captureBottomCrop second) — each call
 * completes synchronously and returns a data URL before the next one writes to
 * the canvas.
 */

const CARD_AR = 5 / 7;

/**
 * Compute the card guide region in source-video pixels.
 *
 * Replicates `object-cover` using the video element's *rendered* dimensions so
 * the crop always matches what the user sees regardless of whether the
 * viewfinder is a fixed 5:3 box (desktop) or a full-height panel (mobile).
 *
 * Returns null when the video isn't ready.
 */
function computeCardRegion(
  video: HTMLVideoElement,
  guideHeight: number,
): { cropX: number; cropY: number; nativeCropW: number; nativeCropH: number } | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null;

  const videoW  = video.videoWidth;
  const videoH  = video.videoHeight;
  const videoAR = videoW / videoH;

  const renderedW  = video.offsetWidth  || videoW;
  const renderedH  = video.offsetHeight || videoH;
  const viewportAR = renderedW / renderedH || 5 / 3;

  let visibleW: number;
  let visibleH: number;
  let offsetX: number;
  let offsetY: number;

  if (videoAR > viewportAR) {
    visibleH = videoH;
    visibleW = videoH * viewportAR;
    offsetX  = (videoW - visibleW) / 2;
    offsetY  = 0;
  } else {
    visibleW = videoW;
    visibleH = videoW / viewportAR;
    offsetX  = 0;
    offsetY  = (videoH - visibleH) / 2;
  }

  const nativeCropH = visibleH * guideHeight;
  const nativeCropW = nativeCropH * CARD_AR;
  const cropX = offsetX + (visibleW - nativeCropW) / 2;
  const cropY = offsetY + (visibleH - nativeCropH) / 2;

  return { cropX, cropY, nativeCropW, nativeCropH };
}

/**
 * Capture the full card guide region as a JPEG data URL.
 *
 * Resolution strategy: the camera is requested at the highest resolution the
 * device supports (see startCamera). The crop is taken at native resolution.
 * If the native crop height exceeds `maxOutputH` it is scaled DOWN — this caps
 * file size while keeping all real detail. Never upscales (no fake pixels).
 *
 * @param video        the live <video> element
 * @param canvas       a hidden <canvas> to scratch onto
 * @param guideHeight  fraction of viewport height the card guide occupies (0..1)
 * @param maxOutputH   cap output height (default 1400 px)
 */
export function captureCardCrop(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
  guideHeight: number,
  maxOutputH = 1400,
): string | null {
  if (!video || !canvas) return null;
  const region = computeCardRegion(video, guideHeight);
  if (!region) return null;

  const { cropX, cropY, nativeCropW, nativeCropH } = region;

  const scale    = nativeCropH > maxOutputH ? maxOutputH / nativeCropH : 1;
  canvas.width   = Math.round(nativeCropW * scale);
  canvas.height  = Math.round(nativeCropH * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    video,
    Math.round(cropX), Math.round(cropY),
    Math.round(nativeCropW), Math.round(nativeCropH),
    0, 0, canvas.width, canvas.height,
  );

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Capture only the bottom strip of the card guide — the area that contains
 * the set code, card number, and rarity symbol (e.g. "PFL EN 002/094 ●").
 *
 * This is sent alongside the full card image so the vision model gets a
 * zoomed-in view of exactly where the small identifier text lives.
 *
 * @param video          the live <video> element
 * @param canvas         a hidden <canvas> to scratch onto (same one as captureCardCrop)
 * @param guideHeight    fraction of viewport height the card guide occupies (0..1)
 * @param bottomFraction fraction of the card height to capture from the bottom (default 0.22)
 */
export function captureBottomCrop(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
  guideHeight: number,
  bottomFraction = 0.22,
): string | null {
  if (!video || !canvas) return null;
  const region = computeCardRegion(video, guideHeight);
  if (!region) return null;

  const { cropX, cropY, nativeCropW, nativeCropH } = region;

  // Bottom strip: full card width, bottom bottomFraction of card height.
  const stripH = nativeCropH * bottomFraction;
  const stripY = cropY + nativeCropH - stripH;

  canvas.width  = Math.round(nativeCropW);
  canvas.height = Math.round(stripH);

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    video,
    Math.round(cropX), Math.round(stripY),
    Math.round(nativeCropW), Math.round(stripH),
    0, 0, canvas.width, canvas.height,
  );

  // High quality — this small image is specifically for OCR.
  return canvas.toDataURL("image/jpeg", 0.95);
}
