provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  services = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
  ])
}

resource "google_project_service" "required" {
  for_each           = local.services
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "supr" {
  location      = var.region
  repository_id = "supr"
  format        = "DOCKER"
  depends_on    = [google_project_service.required]
}

resource "google_service_account" "web" {
  account_id   = "supr-web"
  display_name = "Supr web service"
}

resource "google_service_account" "worker" {
  account_id   = "supr-worker"
  display_name = "Supr worker service"
}

resource "google_service_account" "scheduler" {
  account_id   = "supr-scheduler"
  display_name = "Supr scheduler invoker"
}

resource "google_sql_database_instance" "postgres" {
  name                = "supr-postgres"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = true
  depends_on          = [google_project_service.required]

  settings {
    tier              = var.database_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 20
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled = true
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }
  }
}

resource "google_sql_database" "supr" {
  name     = "supr"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "supr" {
  name     = "supr"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

resource "google_storage_bucket" "artifacts" {
  name                        = "${var.project_id}-supr-artifacts"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false
  versioning { enabled = true }
  lifecycle_rule {
    condition { age = 90 }
    action { type = "Delete" }
  }
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(["DB_PASSWORD", "APP_PASSWORD", "AUTH_SECRET", "GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"])
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.secrets["DB_PASSWORD"].id
  secret_data = var.db_password
}

resource "google_secret_manager_secret_version" "app_password" {
  secret      = google_secret_manager_secret.secrets["APP_PASSWORD"].id
  secret_data = var.app_password
}

resource "google_secret_manager_secret_version" "auth_secret" {
  secret      = google_secret_manager_secret.secrets["AUTH_SECRET"].id
  secret_data = var.auth_secret
}

resource "google_secret_manager_secret_version" "gemini" {
  count       = var.enable_gemini ? 1 : 0
  secret      = google_secret_manager_secret.secrets["GEMINI_API_KEY"].id
  secret_data = var.gemini_api_key
}

resource "google_secret_manager_secret_version" "telegram_token" {
  count       = var.enable_telegram ? 1 : 0
  secret      = google_secret_manager_secret.secrets["TELEGRAM_BOT_TOKEN"].id
  secret_data = var.telegram_bot_token
}

resource "google_secret_manager_secret_version" "telegram_secret" {
  count       = var.enable_telegram ? 1 : 0
  secret      = google_secret_manager_secret.secrets["TELEGRAM_WEBHOOK_SECRET"].id
  secret_data = var.telegram_webhook_secret
}

resource "google_project_iam_member" "sql_client" {
  for_each = toset([google_service_account.web.email, google_service_account.worker.email])
  project  = var.project_id
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${each.value}"
}

resource "google_project_iam_member" "secret_accessor" {
  for_each = toset([google_service_account.web.email, google_service_account.worker.email])
  project  = var.project_id
  role     = "roles/secretmanager.secretAccessor"
  member   = "serviceAccount:${each.value}"
}

resource "google_storage_bucket_iam_member" "artifact_access" {
  bucket = google_storage_bucket.artifacts.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_cloud_tasks_queue" "executions" {
  name     = "supr-executions"
  location = var.region
  rate_limits {
    max_concurrent_dispatches = var.worker_max_instances * var.worker_concurrency
    max_dispatches_per_second = 5
  }
  retry_config {
    max_attempts       = 5
    max_retry_duration = "3600s"
    min_backoff        = "10s"
    max_backoff        = "300s"
  }
  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "task_enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.web.email}"
}

resource "google_service_account_iam_member" "web_can_mint_task_identity" {
  service_account_id = google_service_account.scheduler.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.web.email}"
}

resource "google_cloud_run_v2_service" "worker" {
  name                = "supr-worker"
  location            = var.region
  deletion_protection = var.environment == "production"
  ingress             = "INGRESS_TRAFFIC_ALL"
  depends_on          = [google_project_service.required]

  template {
    service_account                  = google_service_account.worker.email
    timeout                          = "1800s"
    max_instance_request_concurrency = var.worker_concurrency
    scaling {
      min_instance_count = 0
      max_instance_count = var.worker_max_instances
    }
    containers {
      image = var.image
      resources {
        limits = { cpu = "2", memory = "4Gi" }
      }
      env {
        name  = "SUPR_SERVICE_ROLE"
        value = "worker"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "SUPR_INTERNAL_SERVICE_ACCOUNT"
        value = google_service_account.scheduler.email
      }
      env {
        name  = "PGHOST"
        value = "/cloudsql/${google_sql_database_instance.postgres.connection_name}"
      }
      env {
        name  = "PGUSER"
        value = google_sql_user.supr.name
      }
      env {
        name  = "PGDATABASE"
        value = google_sql_database.supr.name
      }
      env {
        name  = "SUPR_ARTIFACT_BUCKET"
        value = google_storage_bucket.artifacts.name
      }
      env {
        name = "PGPASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["DB_PASSWORD"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["AUTH_SECRET"].secret_id
            version = "latest"
          }
        }
      }
      dynamic "env" {
        for_each = var.enable_gemini ? ["enabled"] : []
        content {
          name = "GEMINI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["GEMINI_API_KEY"].secret_id
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance { instances = [google_sql_database_instance.postgres.connection_name] }
    }
  }
}

resource "google_cloud_run_v2_service" "web" {
  name                = "supr-web"
  location            = var.region
  deletion_protection = var.environment == "production"
  ingress             = "INGRESS_TRAFFIC_ALL"
  depends_on          = [google_project_service.required]

  template {
    service_account                  = google_service_account.web.email
    timeout                          = "300s"
    max_instance_request_concurrency = 40
    scaling {
      min_instance_count = var.environment == "production" ? 1 : 0
      max_instance_count = 5
    }
    containers {
      image = var.image
      resources {
        limits = { cpu = "2", memory = "2Gi" }
      }
      env {
        name  = "SUPR_SERVICE_ROLE"
        value = "web"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "PGHOST"
        value = "/cloudsql/${google_sql_database_instance.postgres.connection_name}"
      }
      env {
        name  = "PGUSER"
        value = google_sql_user.supr.name
      }
      env {
        name  = "PGDATABASE"
        value = google_sql_database.supr.name
      }
      env {
        name  = "CLOUD_TASKS_LOCATION"
        value = var.region
      }
      env {
        name  = "CLOUD_TASKS_QUEUE"
        value = google_cloud_tasks_queue.executions.name
      }
      env {
        name  = "CLOUD_TASKS_SERVICE_ACCOUNT"
        value = google_service_account.scheduler.email
      }
      env {
        name  = "SUPR_WORKER_URL"
        value = google_cloud_run_v2_service.worker.uri
      }
      env {
        name  = "SUPR_INTERNAL_SERVICE_ACCOUNT"
        value = google_service_account.scheduler.email
      }
      env {
        name = "PGPASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["DB_PASSWORD"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "APP_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["APP_PASSWORD"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["AUTH_SECRET"].secret_id
            version = "latest"
          }
        }
      }
      dynamic "env" {
        for_each = var.enable_gemini ? ["enabled"] : []
        content {
          name = "GEMINI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["GEMINI_API_KEY"].secret_id
              version = "latest"
            }
          }
        }
      }
      dynamic "env" {
        for_each = var.enable_telegram ? ["enabled"] : []
        content {
          name = "TELEGRAM_BOT_TOKEN"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["TELEGRAM_BOT_TOKEN"].secret_id
              version = "latest"
            }
          }
        }
      }
      dynamic "env" {
        for_each = var.enable_telegram ? ["enabled"] : []
        content {
          name = "TELEGRAM_WEBHOOK_SECRET"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["TELEGRAM_WEBHOOK_SECRET"].secret_id
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance { instances = [google_sql_database_instance.postgres.connection_name] }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public_web" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "worker_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

resource "google_cloud_scheduler_job" "tick" {
  name      = "supr-scheduler-tick"
  region    = var.region
  schedule  = "* * * * *"
  time_zone = "UTC"
  http_target {
    uri         = "${google_cloud_run_v2_service.web.uri}/api/internal/scheduler/tick"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.web.uri
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}
