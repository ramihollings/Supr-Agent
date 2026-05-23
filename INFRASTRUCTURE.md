# Supr v3.5 Production Deployment & Infrastructure Guide

This comprehensive guide outlines the deployment options, security controls, and infrastructure patterns for running **Supr** in a production environment. 

Supr is built on Next.js, SQLite (`better-sqlite3`), and standard container paradigms, allowing it to be deployed seamlessly on **Google Cloud Platform (GCP)** or self-hosted on a **VPS**.

---

## 1. Production Architecture Overview

Supr's runtime depends on three stateful local resources:
1. `supr_local.db` (SQLite Database storing missions, glidepaths, tasks, approvals, memory items, and event logs)
2. `.agents/` (Identity profile descriptions and definitions)
3. `supr_workspaces/` (Temporary sandboxed workspaces where code is written, validated, and run)

### Deployment Modes
* **Google Cloud Platform (Serverless)**: Utilizes Google Cloud Run (Gen2 Execution Environment) mapped with Cloud Storage FUSE for high availability, zero scaling when idle, and serverless maintenance.
* **VPS Self-Hosting (Docker Compose)**: Run natively on a lightweight Virtual Private Server (Ubuntu, Debian, etc.) using Docker Compose. SQLite performs optimally here due to the POSIX local filesystem locks.

---

## 2. Global Security Configurations

To secure your production instance, configure these environment variables in your deployment:

### A. Session Authentication (`APP_PASSWORD`)
By default, Supr runs in open-development mode. For public production deployments, set:
```bash
APP_PASSWORD=your_secure_master_password
```
* When this variable is set, Next.js global middleware (`middleware.ts`) intercepts requests and enforces cookie-based session verification.
* Users must authenticate through a high-fidelity, neo-brutalist `/login` page using the master password.
* Secure session tokens are written as `HttpOnly`, `SameSite=Lax` cookies.

### B. SSRF Protection (Server-Side Request Forgery)
The built-in scraper proxy (`/api/proxy`) intercepts target URLs to prevent CORS errors during research. 
To secure this channel, Supr includes dynamic DNS-resolving network filtration:
* All direct local addresses (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`) are blocked.
* The proxy dynamically resolves the destination domain using DNS lookup and scans the resolved IP against RFC 1918 private subnets:
  * `10.0.0.0/8`
  * `172.16.0.0/12`
  * `192.168.0.0/16`
  * `169.254.0.0/16` (Link-Local / Cloud Metadata Services like GCP metadata `169.254.169.254`)
* Requests mapping to these zones are blocked with a `403 Forbidden` response.

---

## 3. Google Cloud Platform Deployment

GCP Cloud Run provides a serverless execution environment. To persist the database and agent states across container recycles, we mount a Google Cloud Storage bucket using **GCS FUSE**.

### Step A: Create a Cloud Storage Bucket
Provision a dedicated storage bucket in the same region as your planned Cloud Run service:
```bash
export PROJECT_ID=$(gcloud config get-value project)
export REGION="us-central1"

gcloud storage buckets create gs://$PROJECT_ID-supr-state --location=$REGION
```

### Step B: Grant Service Account Permissions
Cloud Run requires access to read/write to the GCS bucket. Grant the default or custom Compute service account the **Storage Object Admin** role:
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:YOUR_COMPUTE_SERVICE_ACCOUNT@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```
*(Replace `YOUR_COMPUTE_SERVICE_ACCOUNT` with your actual GCP Compute Service Account ID).*

### Step C: Configure Cloud Run Mounts & Environment Variables
In GCP Cloud Run, point `SQLITE_DB_PATH` inside the container to a folder within the FUSE volume. This mounts the database file directly onto GCS for full persistence:
* Set `SQLITE_DB_PATH=/app/.agents/supr_local.db`
* GCS FUSE volumes can be configured via `deploy.sh` or through `cloudbuild.yaml`.

The included `deploy.sh` script automates this build and mount flow:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 4. VPS Self-Hosting Deployment (Docker Compose)

Self-hosting on a VPS (e.g., DigitalOcean, Linode, AWS EC2, Hetzner) is the **recommended** way to run SQLite-heavy applications. Because the VPS uses a standard local filesystem (ext4/XFS), SQLite WAL mode locking is extremely fast and robust.

### Step A: Install Prerequisites
Ensure Docker and Docker Compose are installed on your VPS:
```bash
# Ubuntu/Debian installation
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
```

### Step B: Create a `.env` File
Create a `.env` file in the root folder of the project on your VPS:
```env
# Required for agent orchestration
GEMINI_API_KEY=AIzaSy...

# Highly Recommended for public VPS
APP_PASSWORD=a_highly_secure_admin_password
```

### Step C: Run with Docker Compose
Start the containerized service in detached background mode:
```bash
docker compose up -d
```
Docker Compose will automatically:
1. Build the production standalone Next.js image.
2. Spin up the container on port `3000`.
3. Create host directories `./data/agents` and `./data/workspaces` to persist agent profiles and `supr_local.db` inside `./data/agents/supr_local.db` with standard file locking.
4. Auto-restart the app if the system reboots or the container encounters an error.

### Step D: Optional Reverse Proxy & SSL (Recommended)
To serve the app securely over HTTPS (port 443), put a lightweight reverse proxy like **Caddy** in front of port 3000. 

Create a `Caddyfile`:
```caddy
yourdomain.com {
    reverse_proxy localhost:3000
}
```
Caddy will automatically provision and renew a free Let's Encrypt SSL certificate. Run Caddy:
```bash
sudo apt install -y caddy
sudo systemctl enable --now caddy
```

---

## 5. Troubleshooting & Maintenance

### Database Backups
Because the SQLite database is a single file, backup is extremely simple:
* **GCP**: Configure your Cloud Storage bucket to keep version history or set up standard GCS scheduled backups.
* **VPS**: Periodically backup `./data/agents/supr_local.db` using a cron job:
  ```bash
  sqlite3 ./data/agents/supr_local.db ".backup './data/backups/supr_backup_$(date +%F).db'"
  ```

### Resetting Authentication Session
If you ever change your `APP_PASSWORD` or want to force invalidate all active user sessions, simply delete the `supr_auth_token` cookie from your browser, or restart the container to invalidate runtime caches.
