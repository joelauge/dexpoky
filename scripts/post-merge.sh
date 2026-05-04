#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
pnpm exec tsc --build lib/api-client-react/tsconfig.json
