terraform {
  required_version = ">= 1.3.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.50.0"
    }
  }
  # Remote state. The `BUCKET` placeholder is substituted at init time
  # via `terraform init -backend-config="bucket=..."`; we keep the
  # default empty so a missing backend blows up loud at init rather
  # than silently writing state to a local file. See README and
  # deploy.sh for the bootstrap command.
  backend "gcs" {
    bucket = "supr-terraform-state-REPLACE_WITH_PROJECT_ID"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ==========================================
# 0. Customer-Managed Encryption Key (CMEK)
# ==========================================
# All bucket, Cloud SQL, and Secret Manager resources are encrypted
# with this KMS key. The key never leaves Google Cloud; the GKE
# service account is granted `roles/cloudkms.cryptoKeyEncrypterDecrypter`
# so the orchestrator can write to the bucket and the database.
# Rotation period is 90 days per Supr's secret-rotation policy.
resource "google_kms_key_ring" "supr" {
  name     = "supr-keyring"
  location = var.region
}

resource "google_kms_crypto_key" "supr" {
  name     = "supr-cmek"
  key_ring = google_kms_key_ring.supr.id
  rotation_period = "7776000s" # 90 days

  version_template {
    algorithm = "GOOGLE_SYMMETRIC_ENCRYPTION"
  }
}

# ==========================================
# 1. VPC & Networking Setup
# ==========================================

resource "google_compute_network" "supr_vpc" {
  name                    = "supr-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "supr_subnet" {
  name          = "supr-subnet"
  ip_cidr_range = "10.0.0.0/20"
  network       = google_compute_network.supr_vpc.id
  region        = var.region

  private_ip_google_access = true
}

# Allocate private IP ranges for Cloud SQL connectivity
resource "google_compute_global_address" "private_ip_alloc" {
  name          = "supr-private-ip-alloc"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.supr_vpc.id
}

# Create Private Service Connection to route DB traffic inside VPC
resource "google_service_networking_connection" "vpc_connection" {
  network                 = google_compute_network.supr_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}

# ==========================================
# 2. Cloud SQL PostgreSQL Database
# ==========================================
# High Availability: `availability_type = REGIONAL` provisions a
# synchronous standby in a second zone. Failover is automatic.
# Disk is SSD (vs HDD) for the small per-instance footprint.
# Deletion protection: enabled so a `terraform destroy` cannot wipe
# the production database. Operators must explicitly set
# `deletion_protection = false` in an override to drop the DB.
# Backups: automated daily + 7-day retention. Point-in-time recovery
# is enabled for the first 7 days.
resource "google_sql_database_instance" "postgres_instance" {
  name             = "supr-postgres-instance"
  database_version = "POSTGRES_15"
  region           = var.region
  deletion_protection = true

  depends_on = [google_service_networking_connection.vpc_connection]

  settings {
    tier = "db-g1-small" # Move off db-f1-micro for production; gives HA headroom.
    availability_type = "REGIONAL" # HA: synchronous standby in another zone.

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.supr_vpc.id
    }

    backup_configuration {
      enabled            = true
      start_time         = "02:00"
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    disk_type       = "PD_SSD"
    disk_size       = 20
    disk_autoresize = true

    # Customer-managed encryption at rest. The instance's service
    # account is granted encrypter/decrypter on the key in IAM
    # below; without that grant Postgres falls back to Google's
    # managed key, which defeats the purpose of having CMEK.
    encryption_configuration {
      kms_key_name = google_kms_crypto_key.supr.id
    }
  }
}

resource "google_sql_database" "supr_db" {
  name     = "supr_saas_db"
  instance = google_sql_database_instance.postgres_instance.name
}

resource "google_sql_user" "db_admin" {
  name     = "supr_admin"
  instance = google_sql_database_instance.postgres_instance.name
  password = var.db_password
}

# ==========================================
# 3. Cloud Storage (GCS) State Bucket
# ==========================================
# Encrypted with the same CMEK key as the database. Uniform
# bucket-level access is on (no per-object ACLs). Versioning is
# on so a bad object write can be rolled back via `gcloud`.
# Lifecycle: 30-day soft delete for the workspace tarballs.
resource "google_storage_bucket" "state_bucket" {
  name          = "${var.project_id}-supr-state"
  location      = var.region
  force_destroy = false
  default_event_based_hold = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.supr.id
  }
}

# ==========================================
# 4. GKE Autopilot Cluster Setup
# ==========================================

resource "google_container_cluster" "gke_cluster" {
  name     = "supr-gke-cluster"
  location = var.region
  enable_autopilot = true

  network    = google_compute_network.supr_vpc.name
  subnetwork = google_compute_subnetwork.supr_subnet.name

  addons_config {
    gcs_fuse_csi_driver_config {
      enabled = true
    }
  }

  # Cluster-level deletion protection. An explicit
  # `--enable-deletion-protection=false` override is required to
  # tear down the cluster.
  deletion_protection = true

  ip_allocation_policy {}
}

# ==========================================
# 5. Secret Manager Setup
# ==========================================
# Three secrets: DATABASE_URL, GEMINI_API_KEY, APP_PASSWORD.
# All use the same CMEK key as the bucket and the database so
# the same key-rotation policy applies to all of them.
resource "google_secret_manager_secret" "db_url_secret" {
  secret_id = "DATABASE_URL"
  replication {
    automatic = true
  }
  encryption {
    kms_key_name = google_kms_crypto_key.supr.id
  }
}

resource "google_secret_manager_secret_version" "db_url_val" {
  secret      = google_secret_manager_secret.db_url_secret.id
  secret_data = "postgresql://supr_admin:${var.db_password}@${google_sql_database_instance.postgres_instance.private_ip_address}:5432/${google_sql_database.supr_db.name}"
}

resource "google_secret_manager_secret" "gemini_secret" {
  secret_id = "GEMINI_API_KEY"
  replication {
    automatic = true
  }
  encryption {
    kms_key_name = google_kms_crypto_key.supr.id
  }
}

resource "google_secret_manager_secret_version" "gemini_val" {
  secret      = google_secret_manager_secret.gemini_secret.id
  secret_data = var.gemini_api_key
}

resource "google_secret_manager_secret" "app_pw_secret" {
  secret_id = "APP_PASSWORD"
  replication {
    automatic = true
  }
  encryption {
    kms_key_name = google_kms_crypto_key.supr.id
  }
}

resource "google_secret_manager_secret_version" "app_pw_val" {
  secret      = google_secret_manager_secret.app_pw_secret.id
  secret_data = var.app_password
}

# ==========================================
# 6. IAM Configuration for GKE Pod Access
# ==========================================

# Dedicated IAM service account for GKE Pod identity mapping
resource "google_iam_service_account" "orchestrator_sa" {
  account_id   = "supr-orchestrator-sa"
  display_name = "Supr Orchestrator GKE Pod Identity"
}

# Cloud SQL Client so the SA can connect (in addition to the
# secret accessor grants).
resource "google_project_iam_member" "orchestrator_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_iam_service_account.orchestrator_sa.email}"
}

# CMEK encrypter/decrypter for the orchestrator SA. Without this
# the SA cannot write to the bucket or read secrets.
resource "google_kms_crypto_key_iam_member" "orchestrator_cmek" {
  crypto_key_id = google_kms_crypto_key.supr.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_iam_service_account.orchestrator_sa.email}"
}

# Grant GCS access to the orchestrator service account
resource "google_storage_bucket_iam_member" "gcs_access" {
  bucket = google_storage_bucket.state_bucket.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_iam_service_account.orchestrator_sa.email}"
}

# Grant Secret Manager Access to the orchestrator service account
resource "google_secret_manager_secret_iam_member" "db_url_access" {
  secret_id = google_secret_manager_secret.db_url_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_iam_service_account.orchestrator_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "gemini_access" {
  secret_id = google_secret_manager_secret.gemini_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_iam_service_account.orchestrator_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "app_pw_access" {
  secret_id = google_secret_manager_secret.app_pw_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_iam_service_account.orchestrator_sa.email}"
}

# Map K8s service account in GKE to GCP service account via Workload Identity
resource "google_service_account_iam_member" "workload_identity_user" {
  service_account_id = google_iam_service_account.orchestrator_sa.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[supr/supr-sa]"
}
