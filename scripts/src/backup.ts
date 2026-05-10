/**
 * DexPoky full backup script
 *
 * Exports:
 *  1. PostgreSQL database → compressed pg_dump (.dump.gz)
 *  2. All Replit Object Storage files → tar.gz archive
 *
 * Uploads both as assets to a timestamped GitHub Release on
 * https://github.com/joelauge/dexpoky so they are accessible
 * for disaster-recovery re-hosting without polluting git history.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run backup
 *
 * Required env vars:
 *   DATABASE_URL                   — PostgreSQL connection string
 *   GITHUB_TOKEN                   — GitHub PAT with repo scope
 *   DEFAULT_OBJECT_STORAGE_BUCKET_ID — Replit GCS bucket ID
 */

import { execSync } from "child_process";
import { Storage } from "@google-cloud/storage";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const GITHUB_REPO = "joelauge/dexpoky";
const GITHUB_API = "https://api.github.com";
const SIDECAR = "http://127.0.0.1:1106";

// ── helpers ──────────────────────────────────────────────────────────────────

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function log(msg: string) {
  console.log(`[backup] ${msg}`);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function githubFetch(path: string, opts: RequestInit = {}) {
  const token = require_env("GITHUB_TOKEN");
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${path} → ${res.status}: ${body}`);
  }
  return res;
}

// ── step 1: pg_dump ───────────────────────────────────────────────────────────

async function dumpDatabase(tag: string, tmpDir: string): Promise<string> {
  const dbUrl = require_env("DATABASE_URL");
  const outPath = path.join(tmpDir, `db-${tag}.dump.gz`);

  log(`Running pg_dump → ${outPath} …`);
  // -Fc = custom format (binary, supports parallel restore via pg_restore)
  // gzip the output for a second compression pass
  execSync(
    `pg_dump --no-password -Fc "${dbUrl}" | gzip -9 > "${outPath}"`,
    { stdio: ["ignore", "inherit", "inherit"], shell: "/bin/sh" }
  );

  const bytes = fs.statSync(outPath).size;
  log(`DB dump complete — ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  return outPath;
}

// ── step 2: object storage export ────────────────────────────────────────────

function makeGcsClient(): Storage {
  return new Storage({
    credentials: {
      type: "external_account",
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${SIDECAR}/token`,
      credential_source: {
        url: `${SIDECAR}/credential`,
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
}

async function archiveStorage(tag: string, tmpDir: string): Promise<string | null> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    log("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set — skipping storage export");
    return null;
  }

  log(`Listing objects in bucket ${bucketId} …`);
  const gcs = makeGcsClient();
  const bucket = gcs.bucket(bucketId);
  const [files] = await bucket.getFiles();
  log(`Found ${files.length} objects`);

  // Filter out GCS directory marker objects (keys ending with "/")
  const realFiles = files.filter((f) => !f.name.endsWith("/"));
  log(`${realFiles.length} real files (excluding directory markers)`);

  if (realFiles.length === 0) {
    log("Bucket is empty — skipping storage archive");
    return null;
  }

  const filesDir = path.join(tmpDir, "storage-files");
  fs.mkdirSync(filesDir, { recursive: true });

  log("Downloading objects …");
  let downloaded = 0;
  await Promise.all(
    realFiles.map(async (file) => {
      const dest = path.join(filesDir, file.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await file.download({ destination: dest });
      downloaded++;
      if (downloaded % 20 === 0) log(`  ${downloaded}/${realFiles.length} …`);
    })
  );
  log(`Downloaded ${downloaded} objects`);

  const archivePath = path.join(tmpDir, `storage-${tag}.tar.gz`);
  log(`Creating archive → ${archivePath} …`);
  execSync(`tar -czf "${archivePath}" -C "${filesDir}" .`, { stdio: "inherit" });

  const bytes = fs.statSync(archivePath).size;
  log(`Storage archive complete — ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  return archivePath;
}

// ── step 3: GitHub Release ────────────────────────────────────────────────────

async function createRelease(tag: string): Promise<{ id: number; uploadUrl: string }> {
  log(`Creating GitHub Release ${tag} …`);
  const res = await githubFetch(`/repos/${GITHUB_REPO}/releases`, {
    method: "POST",
    body: JSON.stringify({
      tag_name: `backup-${tag}`,
      name: `Backup ${tag}`,
      body: "Automated DexPoky backup — database dump + object storage archive.",
      draft: false,
      prerelease: false,
    }),
  });
  const data = (await res.json()) as { id: number; upload_url: string };
  return { id: data.id, uploadUrl: data.upload_url.replace(/\{.*\}/, "") };
}

async function uploadAsset(uploadUrl: string, filePath: string) {
  const name = path.basename(filePath);
  const size = fs.statSync(filePath).size;
  log(`Uploading ${name} (${(size / 1024 / 1024).toFixed(2)} MB) …`);

  const body = fs.readFileSync(filePath);
  const res = await fetch(`${uploadUrl}?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${require_env("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
    },
    body,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Asset upload failed for ${name}: ${res.status} ${body}`);
  }
  log(`Uploaded ${name}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const tag = timestamp();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dexpoky-backup-"));
  log(`Working directory: ${tmpDir}`);

  try {
    const [dbPath, storagePath] = await Promise.all([
      dumpDatabase(tag, tmpDir),
      archiveStorage(tag, tmpDir),
    ]);

    const { uploadUrl } = await createRelease(tag);

    await uploadAsset(uploadUrl, dbPath);
    if (storagePath) await uploadAsset(uploadUrl, storagePath);

    log(`\nBackup complete! View at: https://github.com/${GITHUB_REPO}/releases/tag/backup-${tag}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    log("Cleaned up temp files");
  }
}

main().catch((err) => {
  console.error("[backup] FAILED:", err);
  process.exit(1);
});
