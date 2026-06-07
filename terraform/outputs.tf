output "web_url" {
  value = google_cloud_run_v2_service.web.uri
}

output "worker_url" {
  value = google_cloud_run_v2_service.worker.uri
}

output "cloud_sql_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "artifact_bucket" {
  value = google_storage_bucket.artifacts.name
}

output "scheduler_service_account" {
  value = google_service_account.scheduler.email
}
