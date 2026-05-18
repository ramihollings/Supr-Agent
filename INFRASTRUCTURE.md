# Supr v3.5 Production Infrastructure Guide

This document outlines the Google Cloud Infrastructure requirements for deploying Supr in a production environment.

## 1. The Challenge of Statelessness
Google Cloud Run is a stateless container execution environment. This means that every time the container spins down, the local file system is wiped.

Supr relies on three local file paths for state:
1. `supr_local.db` (SQLite Database)
2. `.agents/` (Identity Profiles)
3. `supr_workspaces/` (Sandbox File I/O)

To resolve this in Cloud Run, we use **Cloud Storage FUSE**.

## 2. Setting up Cloud Storage FUSE

Before deploying using `deploy.sh` or `cloudbuild.yaml`, you must provision a Google Cloud Storage bucket to act as the persistent mount.

### Step A: Create the Bucket
\`\`\`bash
export PROJECT_ID=$(gcloud config get-value project)
gcloud storage buckets create gs://$PROJECT_ID-supr-state --location=us-central1
\`\`\`

### Step B: Configure Service Accounts
Your Cloud Run service account must have the **Storage Object Admin** IAM role to read and write to this bucket.

\`\`\`bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:YOUR_COMPUTE_SERVICE_ACCOUNT@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
\`\`\`

## 3. Deployment

Once the bucket is created and IAM is configured, you can deploy the container with the volume mounts.
The included `deploy.sh` script automatically configures the Gen2 execution environment and mounts the GCS bucket to `/app/.agents` and `/app/supr_workspaces`.

*(Note: For SQLite `supr_local.db`, GCS FUSE does not officially support file locking required by SQLite WAL mode. For enterprise production, consider mounting a Google Cloud Filestore (NFS) volume instead of GCS FUSE, or migrating the `lib/db.ts` adapter to Cloud SQL Postgres).*

## 4. Environment Variables

Ensure the following environment variables are set in the Cloud Run service:
- `GEMINI_API_KEY`: Required for LLM orchestration.
- `NODE_ENV`: Should be set to `production`.
