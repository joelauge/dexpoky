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
