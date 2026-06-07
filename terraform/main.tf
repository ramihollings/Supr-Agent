provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  database_user = "supr"
  services = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "secretmanager.googleapis.com",
  ])
  web_secret_access = toset(concat(
    ["DB_PASSWORD", "APP_PASSWORD", "AUTH_SECRET"],
    var.enable_gemini ? ["GEMINI_API_KEY"] : [],
    var.enable_telegram ? ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"] : [],
    var.enable_github ? ["GITHUB_TOKEN"] : [],
  ))
  worker_secret_access = toset(concat(
    ["DB_PASSWORD", "AUTH_SECRET"],
    var.enable_gemini ? ["GEMINI_API_KEY"] : [],
    var.enable_github ? ["GITHUB_TOKEN"] : [],
  ))
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

resource "google_storage_bucket" "workspace_snapshots" {
  name                        = "${var.project_id}-supr-workspace-snapshots"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false
  versioning { enabled = true }
  lifecycle_rule {
    condition { age = 30 }
    action { type = "Delete" }
  }
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(["DB_PASSWORD", "APP_PASSWORD", "AUTH_SECRET", "GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "GITHUB_TOKEN"])
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "sql_client" {
  for_each = toset([google_service_account.web.email, google_service_account.worker.email])
  project  = var.project_id
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${each.value}"
}

resource "google_secret_manager_secret_iam_member" "web_secret_accessor" {
  for_each  = local.web_secret_access
  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.web.email}"
}

resource "google_secret_manager_secret_iam_member" "worker_secret_accessor" {
  for_each  = local.worker_secret_access
  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_storage_bucket_iam_member" "artifact_access" {
  bucket = google_storage_bucket.artifacts.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_storage_bucket_iam_member" "workspace_snapshot_access" {
  bucket = google_storage_bucket.workspace_snapshots.name
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
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_iam_member.worker_secret_accessor,
  ]

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
      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 5
        period_seconds        = 5
        failure_threshold     = 24
        http_get {
          path = "/api/health/live"
          port = 3001
        }
      }
      liveness_probe {
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
        http_get {
          path = "/api/health/live"
          port = 3001
        }
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
        value = local.database_user
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
        name  = "SUPR_WORKSPACE_SNAPSHOT_BUCKET"
        value = google_storage_bucket.workspace_snapshots.name
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
      dynamic "env" {
        for_each = var.enable_github ? ["enabled"] : []
        content {
          name = "GITHUB_TOKEN"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["GITHUB_TOKEN"].secret_id
              version = "latest"
            }
          }
        }
      }
      env {
        name  = "SUPR_GITHUB_ENABLED"
        value = tostring(var.enable_github)
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
  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_iam_member.web_secret_accessor,
  ]

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
      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 5
        period_seconds        = 5
        failure_threshold     = 24
        http_get {
          path = "/api/health/live"
          port = 3001
        }
      }
      liveness_probe {
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
        http_get {
          path = "/api/health/live"
          port = 3001
        }
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
        value = local.database_user
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
        for_each = var.enable_github ? ["enabled"] : []
        content {
          name = "GITHUB_TOKEN"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["GITHUB_TOKEN"].secret_id
              version = "latest"
            }
          }
        }
      }
      env {
        name  = "SUPR_GITHUB_ENABLED"
        value = tostring(var.enable_github)
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
          name  = "TELEGRAM_CHAT_ID"
          value = var.telegram_chat_id
        }
      }
      env {
        name  = "SUPR_TELEGRAM_ENABLED"
        value = tostring(var.enable_telegram)
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

resource "google_logging_metric" "scheduler_ticks" {
  name   = "supr_scheduler_ticks"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.name=\"scheduler.tick\""
}

resource "google_logging_metric" "execution_failures" {
  name   = "supr_execution_failures"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.name=\"execution.failed\""
}

resource "google_logging_metric" "scheduler_queue_age" {
  name            = "supr_scheduler_queue_age_ms"
  filter          = "resource.type=\"cloud_run_revision\" AND jsonPayload.name=\"scheduler.tick\""
  value_extractor = "EXTRACT(jsonPayload.attributes.queueAgeMs)"
  metric_descriptor {
    metric_kind = "GAUGE"
    value_type  = "INT64"
    unit        = "ms"
  }
}

resource "google_logging_metric" "stuck_leases" {
  name            = "supr_stuck_leases"
  filter          = "resource.type=\"cloud_run_revision\" AND jsonPayload.name=\"scheduler.tick\""
  value_extractor = "EXTRACT(jsonPayload.attributes.stuckLeases)"
  metric_descriptor {
    metric_kind = "GAUGE"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_logging_metric" "budget_incidents" {
  name   = "supr_budget_incidents"
  filter = "resource.type=\"cloud_run_revision\" AND (jsonPayload.name=\"budget.soft_limit_exceeded\" OR jsonPayload.name=\"budget.hard_limit_exceeded\")"
}

resource "google_monitoring_alert_policy" "scheduler_stale" {
  display_name          = "Supr scheduler ticks are stale"
  combiner              = "OR"
  notification_channels = var.notification_channel_ids
  conditions {
    display_name = "No scheduler tick for five minutes"
    condition_absent {
      filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.scheduler_ticks.name}\" AND resource.type=\"cloud_run_revision\""
      duration = "300s"
    }
  }
}

resource "google_monitoring_alert_policy" "execution_failures" {
  display_name          = "Supr repeated execution failures"
  combiner              = "OR"
  notification_channels = var.notification_channel_ids
  conditions {
    display_name = "Five terminal failures in five minutes"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.execution_failures.name}\" AND resource.type=\"cloud_run_revision\""
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = 4
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "queue_growth" {
  display_name          = "Supr execution queue growth"
  combiner              = "OR"
  notification_channels = var.notification_channel_ids
  conditions {
    display_name = "Cloud Tasks queue depth above 100"
    condition_threshold {
      filter          = "resource.type=\"cloud_tasks_queue\" AND resource.label.queue_id=\"${google_cloud_tasks_queue.executions.name}\" AND metric.type=\"cloudtasks.googleapis.com/queue/depth\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 100
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "queue_age" {
  display_name          = "Supr execution queue age"
  combiner              = "OR"
  notification_channels = var.notification_channel_ids
  conditions {
    display_name = "Oldest queued execution is over five minutes old"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.scheduler_queue_age.name}\" AND resource.type=\"cloud_run_revision\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 300000
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "stuck_leases" {
  display_name          = "Supr stuck execution leases"
  combiner              = "OR"
  notification_channels = var.notification_channel_ids
  conditions {
    display_name = "One or more execution leases are expired"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.stuck_leases.name}\" AND resource.type=\"cloud_run_revision\""
      duration        = "120s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "budget_incidents" {
  display_name          = "Supr budget threshold crossed"
  combiner              = "OR"
  notification_channels = var.notification_channel_ids
  conditions {
    display_name = "A budget warning or hard limit was emitted"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.budget_incidents.name}\" AND resource.type=\"cloud_run_revision\""
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "database_down" {
  display_name          = "Supr PostgreSQL unavailable"
  combiner              = "OR"
  notification_channels = var.notification_channel_ids
  conditions {
    display_name = "Cloud SQL database reports unavailable"
    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.label.database_id=\"${var.project_id}:${google_sql_database_instance.postgres.name}\" AND metric.type=\"cloudsql.googleapis.com/database/up\""
      duration        = "120s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MIN"
      }
    }
  }
}
