#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
pnpm exec tsc --build lib/api-client-react/tsconfig.json

# Sync to GitHub
if [ -n "$GITHUB_TOKEN" ]; then
  echo "[github-sync] pushing to github.com/joelauge/dexpoky..."
  git push https://$GITHUB_TOKEN@github.com/joelauge/dexpoky.git HEAD:main --quiet
  echo "[github-sync] done"
else
  echo "[github-sync] GITHUB_TOKEN not set — skipping"
fi

# Full backup: DB dump + object storage → GitHub Release
if [ -n "$GITHUB_TOKEN" ] && [ -n "$DATABASE_URL" ]; then
  echo "[backup] running full backup..."
  pnpm --filter @workspace/scripts run backup || echo "[backup] WARNING: backup failed (non-blocking)"
else
  echo "[backup] skipping — GITHUB_TOKEN or DATABASE_URL not set"
fi
