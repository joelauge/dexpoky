import { Router, type Request, type Response } from "express";
import { spawn } from "child_process";

const router = Router();

function getSecret(): string | undefined {
  return process.env.BACKUP_SECRET;
}

function checkAuth(req: Request, res: Response): boolean {
  const secret = getSecret();
  if (!secret) {
    res.status(503).json({ error: "BACKUP_SECRET env var not configured" });
    return false;
  }
  const header = req.headers.authorization ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : (req.query.token as string | undefined);
  if (!provided || provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/**
 * GET /api/admin/backup/db
 *
 * Streams a fresh pg_dump (-Fc custom format, gzip-compressed) directly in
 * the response body. Restore with:
 *   gunzip db.dump.gz && pg_restore -d <target_db> db.dump
 *
 * Auth: Authorization: Bearer <BACKUP_SECRET>
 *       or ?token=<BACKUP_SECRET>
 *
 * curl example:
 *   curl -H "Authorization: Bearer <secret>" \
 *        https://dexpoky.com/api/admin/backup/db \
 *        -o db.dump.gz
 */
router.get("/admin/backup/db", (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    res.status(503).json({ error: "DATABASE_URL not configured" });
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `dexpoky-db-${ts}.dump.gz`;

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Backup-Timestamp", ts);

  // pg_dump -Fc (custom binary format) piped through gzip
  const dump = spawn("pg_dump", ["--no-password", "-Fc", dbUrl], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const gzip = spawn("gzip", ["-9"], {
    stdio: [dump.stdout, "pipe", "pipe"],
  });

  dump.stderr.on("data", (d: Buffer) => req.log?.warn(`pg_dump: ${d.toString().trim()}`));
  gzip.stderr.on("data", (d: Buffer) => req.log?.warn(`gzip: ${d.toString().trim()}`));

  gzip.stdout.pipe(res);

  gzip.on("close", (code) => {
    if (code !== 0) req.log?.error(`gzip exited ${code}`);
  });

  dump.on("error", (err) => {
    req.log?.error({ err }, "pg_dump error");
    if (!res.headersSent) res.status(500).json({ error: "pg_dump failed" });
  });

  gzip.on("error", (err) => {
    req.log?.error({ err }, "gzip error");
    if (!res.headersSent) res.status(500).json({ error: "gzip failed" });
  });

  req.on("close", () => {
    dump.kill();
    gzip.kill();
  });
});

export default router;
