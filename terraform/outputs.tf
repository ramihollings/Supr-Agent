output "vpc_network_name" {
  description = "The name of the VPC network created"
  value       = google_compute_network.supr_vpc.name
}

output "cloud_sql_private_ip" {
  description = "The private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.postgres_instance.private_ip_address
}

output "gke_cluster_endpoint" {
  description = "The endpoint URL for the GKE cluster control plane"
  value       = google_container_cluster.gke_cluster.endpoint
}

output "state_bucket_name" {
  description = "The name of the GCS bucket used for state storage"
  value       = google_storage_bucket.state_bucket.name
}

output "orchestrator_service_account_email" {
  description = "The GCP Service Account email mapped to our Kubernetes workload"
  value       = google_iam_service_account.orchestrator_sa.email
}
