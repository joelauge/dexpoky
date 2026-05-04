/**
 * Convert a base64 dataURL into a Blob.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error("Invalid data URL");
  const mime = match[1];
  const b64 = match[2];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Upload a captured scan (base64 data URL) to object storage and return a
 * URL that can be stored in `cards.original_scan_url`.
 *
 * Returns null on failure — the caller should treat the original scan as
 * optional and never block the save flow on it.
 */
export async function uploadScanImage(dataUrl: string): Promise<string | null> {
  try {
    const blob = dataUrlToBlob(dataUrl);
    const filename = `scan-${Date.now()}.${blob.type.includes("png") ? "png" : "jpg"}`;

    const metaRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: filename,
        size: blob.size,
        contentType: blob.type,
      }),
    });
    if (!metaRes.ok) return null;
    const { uploadURL, objectPath } = (await metaRes.json()) as {
      uploadURL: string;
      objectPath: string;
    };

    const putRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": blob.type },
      body: blob,
    });
    if (!putRes.ok) return null;

    return `${BASE}/api/storage${objectPath}`;
  } catch {
    return null;
  }
}
