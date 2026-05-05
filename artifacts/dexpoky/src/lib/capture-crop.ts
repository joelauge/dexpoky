/**
 * Crop a video frame to just the card-shaped guide visible inside the
 * viewfinder. Mirrors the on-screen overlay so the bytes we send to the
 * vision API contain only the card itself — less background noise and
 * more pixel detail per token.
 *
 * Both scanners render the same overlay geometry:
 *   - Card guide aspect: 5:7 (Pokémon card ratio)
 *   - Card guide height: a fraction of the viewport height (e.g. 0.88)
 *   - The guide is centered both horizontally and vertically
 *   - The video uses `object-cover` to fill the viewport
 *
 * Resolution strategy:
 *   The camera is requested at the highest resolution the device supports
 *   (see startCamera). The crop is taken at native video resolution to
 *   capture maximum detail. If the native crop is taller than `maxOutputH`
 *   pixels it is scaled DOWN to that limit before encoding — this caps the
 *   upload size while keeping all real detail. If the native crop is already
 *   below the limit it is used as-is (no fake upscaling).
 *
 * @param video        the live <video> element
 * @param canvas       a hidden <canvas> we can scratch onto
 * @param guideHeight  fraction of viewport height the card guide occupies (0..1)
 * @param maxOutputH   maximum output height in pixels (default 1400)
 * @returns            base64 JPEG data URL, or null if the video isn't ready
 */
export function captureCardCrop(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
  guideHeight: number,
  maxOutputH = 1400,
): string | null {
  if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
    return null;
  }

  // The viewfinder may be any aspect ratio depending on the device screen.
  // We derive the effective viewport AR from the video element's rendered size
  // so the crop always matches what the user sees in the guide overlay.
  const CARD_AR = 5 / 7;

  const videoW  = video.videoWidth;
  const videoH  = video.videoHeight;
  const videoAR = videoW / videoH;

  // Use the on-screen rendered dimensions to determine the effective viewport
  // aspect ratio — this handles both the 5:3 desktop layout and the
  // full-height mobile layout introduced in the scan-page redesign.
  const renderedW  = video.offsetWidth  || videoW;
  const renderedH  = video.offsetHeight || videoH;
  const viewportAR = renderedW / renderedH || 5 / 3;

  // Replicate `object-cover`: scale the video so the SHORTER axis fills the
  // viewport, then crop the overflow on the LONGER axis.
  let visibleW: number;
  let visibleH: number;
  let offsetX: number;
  let offsetY: number;

  if (videoAR > viewportAR) {
    // Video is wider than the box → full video height fills the viewport;
    // left/right edges of the video are cropped.
    visibleH = videoH;
    visibleW = videoH * viewportAR;
    offsetX  = (videoW - visibleW) / 2;
    offsetY  = 0;
  } else {
    // Video is taller than the box → full video width fills the viewport;
    // top/bottom of the video are cropped.
    visibleW = videoW;
    visibleH = videoW / viewportAR;
    offsetX  = 0;
    offsetY  = (videoH - visibleH) / 2;
  }

  // Card guide region in source-video pixels.
  const nativeCropH = visibleH * guideHeight;
  const nativeCropW = nativeCropH * CARD_AR;
  const cropX = offsetX + (visibleW - nativeCropW) / 2;
  const cropY = offsetY + (visibleH - nativeCropH) / 2;

  // Scale down to maxOutputH if native resolution exceeds it.
  // Never scale up — fake pixels don't help OCR.
  const scale = nativeCropH > maxOutputH ? maxOutputH / nativeCropH : 1;
  canvas.width  = Math.round(nativeCropW * scale);
  canvas.height = Math.round(nativeCropH * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    video,
    Math.round(cropX), Math.round(cropY),
    Math.round(nativeCropW), Math.round(nativeCropH),
    0, 0, canvas.width, canvas.height,
  );

  // Quality 0.92: card images compress very well (flat colors, clean edges)
  // so this gives noticeably better OCR clarity at only modest size increase.
  return canvas.toDataURL("image/jpeg", 0.92);
}
