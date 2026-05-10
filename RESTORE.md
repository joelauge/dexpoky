# DexPoky — Restore & Re-hosting Guide

How to take a DexPoky backup from GitHub Releases and stand the app up on a fresh host.

---

## 1. Find Your Backup

Go to https://github.com/joelauge/dexpoky/releases and find the most recent release
tagged `backup-YYYY-MM-DD-THHmmss`. Download the two assets:

| File | Contents |
|---|---|
| `db-<timestamp>.dump.gz` | Full PostgreSQL dump (`pg_dump -Fc` + gzip) |
| `storage-<timestamp>.tar.gz` | All object storage files (card images, scan originals) |

---

## 2. Restore the Database

You need a fresh PostgreSQL 16+ instance. The dump is in `pg_dump` custom format.

```bash
# Decompress
gunzip db-<timestamp>.dump.gz
# → produces db-<timestamp>.dump

# Create a new database
createdb dexpoky

# Restore (parallel, 4 jobs)
pg_restore -d dexpoky -j 4 db-<timestamp>.dump
```

Or via a connection string:
```bash
pg_restore -d "postgres://user:pass@host:5432/dexpoky" -j 4 db-<timestamp>.dump
```

Set the `DATABASE_URL` environment variable to point to this database.

---

## 3. Restore Object Storage Files

The `storage-<timestamp>.tar.gz` archive contains every file that was in the Replit
Object Storage bucket, preserving the original key paths (e.g. `uploads/<uuid>`,
`scans/<uuid>`).

### Option A — Re-upload to a new GCS bucket

```bash
tar -xzf storage-<timestamp>.tar.gz -C ./storage-restore/

# Install gsutil (if not present): https://cloud.google.com/storage/docs/gsutil_install
gsutil -m cp -r ./storage-restore/* gs://<your-new-bucket>/
```

Set `DEFAULT_OBJECT_STORAGE_BUCKET_ID` to your new bucket ID.

### Option B — Upload to S3 / R2 / MinIO

```bash
tar -xzf storage-<timestamp>.tar.gz -C ./storage-restore/

# AWS S3
aws s3 sync ./storage-restore/ s3://<your-bucket>/

# Cloudflare R2
aws s3 sync ./storage-restore/ s3://<r2-bucket>/ \
  --endpoint-url https://<account-id>.r2.cloudflarestorage.com
```

You will also need to update the API server's storage routes (`routes/storage.ts`) to
point to your new object storage provider.

### Option C — Local filesystem (dev/testing only)

```bash
tar -xzf storage-<timestamp>.tar.gz -C /var/dexpoky-storage/
```

Serve files with nginx or update the storage routes to read from disk.

---

## 4. Environment Variables

Copy these to your new host. All are required for full functionality.

### App

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random 32+ char secret for session signing |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | GCS bucket ID (or equivalent) |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Comma-separated GCS search paths for public assets |
| `PRIVATE_OBJECT_DIR` | GCS directory for private uploads |

### Auth (Clerk)

| Variable | Description |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (frontend) |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key (backend) |
| `CLERK_SECRET_KEY` | Clerk secret key (backend) |

### Payments (Stripe)

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

### Messaging

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account SID (SMS notifications) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio sender phone number |
| `RESEND_API_KEY` | Resend API key (transactional email) |

### AI

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key (deck builder, card recognition) |

### Optional

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | GitHub PAT (only needed if running backup script) |
| `EBAY_CLIENT_ID` | eBay API client ID (price lookup) |
| `EBAY_CLIENT_SECRET` | eBay API client secret |

---

## 5. Deploy the App

The app is a pnpm monorepo. On a fresh Linux host:

```bash
# Install pnpm
npm install -g pnpm

# Clone the repo
git clone https://github.com/joelauge/dexpoky.git
cd dexpoky

# Install dependencies
pnpm install --frozen-lockfile

# Build
pnpm run build

# Run API server (port from PORT env var)
PORT=8080 node artifacts/api-server/dist/index.js

# Or run the Vite frontend in dev mode
PORT=3000 pnpm --filter @workspace/dexpoky run dev
```

For production, serve the built frontend (`artifacts/dexpoky/dist/`) as static files
and proxy `/api` to the Express server.

### nginx example

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    root /var/www/dexpoky/artifacts/dexpoky/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 6. Run a Fresh Backup

To create a new backup at any time:

```bash
pnpm --filter @workspace/scripts run backup
```

Requires `DATABASE_URL`, `GITHUB_TOKEN`, and `DEFAULT_OBJECT_STORAGE_BUCKET_ID` in
the environment. The script uploads the dump and storage archive as assets to a new
GitHub Release.

---

## 7. Verify the Restore

1. Visit `/api/healthz` — should return `{ "status": "ok" }`
2. Sign in with a Clerk account — existing users and their data should load
3. Browse to `/marketplace` — listings should appear
4. Open a card detail page — images should load from the new object storage
5. Test a wallet top-up — Stripe integration should work with the new keys
