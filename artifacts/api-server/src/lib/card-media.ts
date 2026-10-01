import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import type { File } from "@google-cloud/storage";
import type { CardMedia } from "@workspace/db";

const execFileAsync = promisify(execFile);
const CLAIM_SCOPE = "card-media-upload";
const CLAIM_LIFETIME_SECONDS = 15 * 60;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 60;

interface UploadClaim {
  v: 1;
  scope: typeof CLAIM_SCOPE;
  userId: string;
  objectPath: string;
  issuedAt: number;
  expiresAt: number;
}

export interface CardMediaInput {
  url: string;
  kind: "image" | "video";
  width: number;
  height: number;
  durationSeconds?: number | null;
  uploadClaim: string;
}

export class CardMediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardMediaValidationError";
  }
}

export class CardMediaInspectorUnavailableError extends Error {
  constructor() {
    super("Video verification is unavailable because ffprobe is missing from the server PATH");
    this.name = "CardMediaInspectorUnavailableError";
  }
}

function signingSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to sign card media uploads");
  return secret;
}

function signature(encodedPayload: string): Buffer {
  return createHmac("sha256", signingSecret()).update(encodedPayload).digest();
}

export function canonicalCardMediaObjectPath(url: string): string | null {
  const match = /^\/api\/storage\/objects\/(uploads\/[A-Za-z0-9._-]+)$/.exec(url);
  if (!match) return null;
  return `/objects/${match[1]}`;
}

export function createCardMediaUploadClaim(
  userId: string,
  objectPath: string,
  now = Date.now(),
): string {
  if (!/^\/objects\/uploads\/[A-Za-z0-9._-]+$/.test(objectPath)) {
    throw new CardMediaValidationError("Invalid upload object path");
  }
  const issuedAt = Math.floor(now / 1000);
  const payload: UploadClaim = {
    v: 1,
    scope: CLAIM_SCOPE,
    userId,
    objectPath,
    issuedAt,
    expiresAt: issuedAt + CLAIM_LIFETIME_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload).toString("base64url")}`;
}

export function verifyCardMediaUploadClaim(
  claim: string,
  userId: string,
  objectPath: string,
  now = Date.now(),
): boolean {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required to verify card media uploads");
  }
  try {
    const [encodedPayload, encodedSignature, extra] = claim.split(".");
    if (!encodedPayload || !encodedSignature || extra !== undefined) return false;
    const suppliedSignature = Buffer.from(encodedSignature, "base64url");
    const expectedSignature = signature(encodedPayload);
    if (suppliedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(suppliedSignature, expectedSignature)) return false;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<UploadClaim>;
    const nowSeconds = Math.floor(now / 1000);
    return payload.v === 1 &&
      payload.scope === CLAIM_SCOPE &&
      payload.userId === userId &&
      payload.objectPath === objectPath &&
      typeof payload.issuedAt === "number" &&
      typeof payload.expiresAt === "number" &&
      payload.issuedAt <= nowSeconds + 30 &&
      payload.expiresAt >= nowSeconds &&
      payload.expiresAt > payload.issuedAt &&
      payload.expiresAt - payload.issuedAt <= CLAIM_LIFETIME_SECONDS;
  } catch {
    return false;
  }
}

export function validateMediaOrientation(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new CardMediaValidationError("Media dimensions must be positive integers");
  }
  const ratio = width / height;
  const portrait = ratio >= (9 / 16) * 0.95 && ratio <= (9 / 16) * 1.05;
  const landscape = ratio >= (16 / 9) * 0.95 && ratio <= (16 / 9) * 1.05;
  if (!portrait && !landscape) {
    throw new CardMediaValidationError("Videos must use a portrait 9:16 or landscape 16:9 aspect ratio");
  }
}

export function getDisplayVideoDimensions(
  width: number,
  height: number,
  rotationDegrees: number,
): { width: number; height: number } {
  if (!Number.isFinite(rotationDegrees)) {
    throw new CardMediaValidationError("Video has invalid rotation metadata");
  }
  const normalizedRotation = ((rotationDegrees % 360) + 360) % 360;
  if (normalizedRotation % 90 !== 0) {
    throw new CardMediaValidationError("Video rotation must be a multiple of 90 degrees");
  }
  return normalizedRotation === 90 || normalizedRotation === 270
    ? { width: height, height: width }
    : { width, height };
}

function imageMimeForFormat(format: string | undefined): string | null {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return null;
}

function assertDimensionsMatch(actualWidth: number, actualHeight: number, input: CardMediaInput): void {
  if (input.width !== actualWidth || input.height !== actualHeight) {
    throw new CardMediaValidationError("Submitted dimensions do not match the uploaded media");
  }
}

export async function inspectStoredCardMedia(
  file: File,
  input: CardMediaInput,
): Promise<Pick<CardMedia, "width" | "height" | "durationSeconds">> {
  const [metadata] = await file.getMetadata();
  const contentType = String(metadata.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const size = Number(metadata.size);
  const maxSize = input.kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxSize) {
    throw new CardMediaValidationError(
      input.kind === "image" ? "Photos must be no larger than 10 MiB" : "Videos must be no larger than 100 MiB",
    );
  }

  if (input.kind === "image") {
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      throw new CardMediaValidationError("Photos must be JPEG, PNG, or WebP");
    }
    const [buffer] = await file.download();
    if (buffer.byteLength !== size) throw new CardMediaValidationError("Uploaded photo size does not match storage metadata");
    let image: sharp.Metadata;
    try {
      image = await sharp(buffer, { failOn: "error" }).metadata();
    } catch {
      throw new CardMediaValidationError("The uploaded photo is not a valid image");
    }
    if (imageMimeForFormat(image.format) !== contentType || !image.width || !image.height) {
      throw new CardMediaValidationError("Uploaded photo content does not match its declared MIME type");
    }
    const displayWidth = image.autoOrient?.width ?? image.width;
    const displayHeight = image.autoOrient?.height ?? image.height;
    assertDimensionsMatch(displayWidth, displayHeight, input);
    return { width: displayWidth, height: displayHeight, durationSeconds: null };
  }

  if (!["video/mp4", "video/webm"].includes(contentType)) {
    throw new CardMediaValidationError("Videos must be MP4 or WebM");
  }
  const tempDir = await mkdtemp(join(tmpdir(), "dexpoky-card-media-"));
  const videoPath = join(tempDir, randomUUID());
  try {
    await pipeline(file.createReadStream(), createWriteStream(videoPath));
    if ((await stat(videoPath)).size !== size) {
      throw new CardMediaValidationError("Uploaded video size does not match storage metadata");
    }
    let probe: {
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        duration?: string;
        tags?: { rotate?: string };
        side_data_list?: Array<{ rotation?: number }>;
      }>;
      format?: { format_name?: string; duration?: string };
    };
    try {
      const result = await execFileAsync("ffprobe", [
        "-v", "error", "-show_entries",
        "format=format_name,duration:stream=codec_type,width,height,duration:stream_tags=rotate:stream_side_data=rotation",
        "-of", "json", videoPath,
      ], { timeout: 15_000, maxBuffer: 1024 * 1024 });
      probe = JSON.parse(result.stdout) as typeof probe;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CardMediaInspectorUnavailableError();
      }
      throw new CardMediaValidationError("The uploaded video could not be decoded");
    }
    const expectedFormats = contentType === "video/mp4" ? ["mp4"] : ["webm"];
    const formatNames = String(probe.format?.format_name ?? "").split(",");
    if (!formatNames.some((format) => expectedFormats.includes(format))) {
      throw new CardMediaValidationError("Uploaded video content does not match its declared MIME type");
    }
    const video = probe.streams?.find((stream) => stream.codec_type === "video");
    const codedWidth = Number(video?.width);
    const codedHeight = Number(video?.height);
    const rotation = Number(video?.side_data_list?.find((sideData) => sideData.rotation != null)?.rotation ??
      video?.tags?.rotate ?? 0);
    const displayDimensions = getDisplayVideoDimensions(codedWidth, codedHeight, rotation);
    const width = displayDimensions.width;
    const height = displayDimensions.height;
    const duration = Math.max(Number(video?.duration ?? 0), Number(probe.format?.duration ?? 0));
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        !Number.isFinite(duration) || duration <= 0 || duration > MAX_VIDEO_DURATION_SECONDS) {
      throw new CardMediaValidationError("Videos must have valid dimensions and be no longer than 60 seconds");
    }
    assertDimensionsMatch(width, height, input);
    validateMediaOrientation(width, height);
    if (input.durationSeconds != null &&
        (!Number.isFinite(input.durationSeconds) || Math.abs(input.durationSeconds - duration) > 0.5)) {
      throw new CardMediaValidationError("Submitted duration does not match the uploaded video");
    }
    return { width, height, durationSeconds: duration };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
