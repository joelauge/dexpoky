import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { File } from "@google-cloud/storage";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import {
  canonicalCardMediaObjectPath,
  createCardMediaUploadClaim,
  getDisplayVideoDimensions,
  inspectStoredCardMedia,
  validateMediaOrientation,
  verifyCardMediaUploadClaim,
  type CardMediaInput,
} from "./card-media.js";

const userId = "user_abc123";
const uploadedPath = "/objects/uploads/6d7cd680-f46e-46e8-8faa-7a470251c6ad";
const photoUrl = "/api/storage/objects/uploads/6d7cd680-f46e-46e8-8faa-7a470251c6ad";
const execFileAsync = promisify(execFile);

function storedFile(buffer: Buffer, contentType: string): File {
  return {
    getMetadata: vi.fn().mockResolvedValue([{ contentType, size: String(buffer.byteLength) }]),
    download: vi.fn().mockResolvedValue([buffer]),
  } as unknown as File;
}

const imageInput = (overrides: Partial<CardMediaInput> = {}): CardMediaInput => ({
  url: photoUrl,
  kind: "image",
  width: 900,
  height: 1400,
  uploadClaim: "claim",
  ...overrides,
});

beforeEach(() => vi.stubEnv("SESSION_SECRET", "test-card-media-signing-secret"));
afterEach(() => vi.unstubAllEnvs());

describe("card media upload proof", () => {
  it("issues a proof bound to its owner, uploaded object, scope, and expiration", () => {
    const issuedAt = 1_800_000_000_000;
    const claim = createCardMediaUploadClaim(userId, uploadedPath, issuedAt);

    expect(verifyCardMediaUploadClaim(claim, userId, uploadedPath, issuedAt)).toBe(true);
    expect(verifyCardMediaUploadClaim(claim, "another-user", uploadedPath, issuedAt)).toBe(false);
    expect(verifyCardMediaUploadClaim(claim, userId, `${uploadedPath}-other`, issuedAt)).toBe(false);
    expect(verifyCardMediaUploadClaim(claim, userId, uploadedPath, issuedAt + 15 * 60 * 1000 + 1000)).toBe(false);
    expect(verifyCardMediaUploadClaim(`${claim}x`, userId, uploadedPath, issuedAt)).toBe(false);
  });

  it("only accepts local object-serving URLs for upload-backed media", () => {
    expect(canonicalCardMediaObjectPath(photoUrl)).toBe(uploadedPath);
    expect(canonicalCardMediaObjectPath("https://example.com/image.jpg")).toBeNull();
    expect(canonicalCardMediaObjectPath("/api/storage/public-objects/photo.jpg")).toBeNull();
    expect(canonicalCardMediaObjectPath("/api/storage/objects/../private/file")).toBeNull();
    expect(canonicalCardMediaObjectPath(`${photoUrl}?token=x`)).toBeNull();
  });

  it("validates 9:16 and 16:9 video framing with five-percent tolerance", () => {
    expect(() => validateMediaOrientation(900, 1600)).not.toThrow();
    expect(() => validateMediaOrientation(1600, 900)).not.toThrow();
    expect(() => validateMediaOrientation(900, 1400)).toThrow(/9:16 or landscape 16:9/);
    expect(() => validateMediaOrientation(0, 1600)).toThrow(/positive integers/);
  });

  it("converts ffprobe-coded dimensions into native display dimensions for rotated video", () => {
    expect(getDisplayVideoDimensions(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(getDisplayVideoDimensions(1920, 1080, -90)).toEqual({ width: 1080, height: 1920 });
    expect(getDisplayVideoDimensions(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
    expect(getDisplayVideoDimensions(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
  });
});

describe("uploaded photo inspection", () => {
  it("accepts a real JPEG and returns dimensions read from the stored bytes", async () => {
    const buffer = await sharp({
      create: { width: 900, height: 1400, channels: 3, background: "#d8365b" },
    }).jpeg().toBuffer();

    await expect(inspectStoredCardMedia(storedFile(buffer, "image/jpeg"), imageInput()))
      .resolves.toEqual({ width: 900, height: 1400, durationSeconds: null });
  });

  it("uses the browser-visible dimensions of an EXIF-rotated phone JPEG", async () => {
    const buffer = await sharp({
      create: { width: 1400, height: 900, channels: 3, background: "#d8365b" },
    }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const input = imageInput({ width: 900, height: 1400 });

    await expect(inspectStoredCardMedia(storedFile(buffer, "image/jpeg"), input))
      .resolves.toEqual({ width: 900, height: 1400, durationSeconds: null });
  });

  it("uses ffprobe display-matrix dimensions for a rotated MP4 upload", async () => {
    const directory = await mkdtemp(join(tmpdir(), "card-media-rotation-test-"));
    const rawPath = join(directory, "raw.mp4");
    const rotatedPath = join(directory, "rotated.mp4");
    try {
      await execFileAsync("ffmpeg", [
        "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "color=c=black:s=192x108:d=1",
        "-c:v", "libx264", "-movflags", "+faststart", "-y", rawPath,
      ], { timeout: 15_000 });
      await execFileAsync("ffmpeg", [
        "-hide_banner", "-loglevel", "error",
        "-display_rotation", "90", "-i", rawPath,
        "-c", "copy", "-movflags", "+faststart", "-y", rotatedPath,
      ], { timeout: 15_000 });

      const buffer = await readFile(rotatedPath);
      const file = {
        getMetadata: vi.fn().mockResolvedValue([{ contentType: "video/mp4", size: String(buffer.byteLength) }]),
        createReadStream: () => Readable.from([buffer]),
      } as unknown as File;
      await expect(inspectStoredCardMedia(file, {
        url: photoUrl,
        kind: "video",
        width: 108,
        height: 192,
        durationSeconds: 1,
        uploadClaim: "claim",
      })).resolves.toEqual({ width: 108, height: 192, durationSeconds: 1 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects an uploaded image whose submitted dimensions are forged", async () => {
    const buffer = await sharp({
      create: { width: 900, height: 1400, channels: 3, background: "#d8365b" },
    }).png().toBuffer();

    await expect(inspectStoredCardMedia(
      storedFile(buffer, "image/png"),
      imageInput({ width: 1400 }),
    )).rejects.toThrow(/dimensions do not match/);
  });

  it("rejects a MIME declaration that does not match the decoded image", async () => {
    const buffer = await sharp({
      create: { width: 900, height: 1400, channels: 3, background: "#d8365b" },
    }).jpeg().toBuffer();

    await expect(inspectStoredCardMedia(storedFile(buffer, "image/png"), imageInput()))
      .rejects.toThrow(/does not match its declared MIME type/);
  });

  it("rejects photos larger than 10 MiB based on storage metadata", async () => {
    const file = {
      getMetadata: vi.fn().mockResolvedValue([{ contentType: "image/jpeg", size: String(10 * 1024 * 1024 + 1) }]),
    } as unknown as File;
    await expect(inspectStoredCardMedia(file, imageInput())).rejects.toThrow(/10 MiB/);
  });
});