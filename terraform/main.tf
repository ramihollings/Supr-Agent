terraform {
  required_version = ">= 1.3.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.50.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
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

  # Enable private Google access to permit nodes reaching GCP APIs directly
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

resource "google_sql_database_instance" "postgres_instance" {
  name             = "supr-postgres-instance"
  database_version = "POSTGRES_15"
  region           = var.region
  
  depends_on = [google_service_networking_connection.vpc_connection]

  settings {
    tier = "db-f1-micro" # Highly cost-efficient for standard workloads, scales easily
    
    ip_configuration {
      ipv4_enabled    = false # Disable public IP routing
      private_network = google_compute_network.supr_vpc.id
    }

    backup_configuration {
      enabled    = true
      start_time = "02:00"
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

resource "google_storage_bucket" "state_bucket" {
  name          = "${var.project_id}-supr-state"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

# ==========================================
# 4. GKE Autopilot Cluster Setup
# ==========================================

resource "google_container_cluster" "gke_cluster" {
  name     = "supr-gke-cluster"
  location = var.region

  # Enable Autopilot Mode
  enable_autopilot = true
  
  network    = google_compute_network.supr_vpc.name
  subnetwork = google_compute_subnetwork.supr_subnet.name

  # Enable the Google Cloud Storage FUSE CSI driver for mounting storage
  addons_config {
    gcs_fuse_csi_driver_config {
      enabled = true
    }
  }

  ip_allocation_policy {
    # Autopilot manages network allocations automatically
  }
}

# ==========================================
# 5. Secret Manager Setup
# ==========================================

# Secret 1: Database URL
resource "google_secret_manager_secret" "db_url_secret" {
  secret_id = "DATABASE_URL"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "db_url_val" {
  secret      = google_secret_manager_secret.db_url_secret.id
  secret_data = "postgresql://supr_admin:${var.db_password}@${google_sql_database_instance.postgres_instance.private_ip_address}:5432/${google_sql_database.supr_db.name}"
}

# Secret 2: Gemini API Key
resource "google_secret_manager_secret" "gemini_secret" {
  secret_id = "GEMINI_API_KEY"
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "gemini_val" {
  secret      = google_secret_manager_secret.gemini_secret.id
  secret_data = var.gemini_api_key
}

# Secret 3: App Master Password
resource "google_secret_manager_secret" "app_pw_secret" {
  secret_id = "APP_PASSWORD"
  replication {
    automatic = true
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
