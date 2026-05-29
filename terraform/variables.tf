variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "The target region for GCP resource deployments"
  type        = string
  default     = "us-central1"
}

variable "db_password" {
  description = "Password for the master PostgreSQL user"
  type        = string
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Gemini API key for orchestrator model calls"
  type        = string
  sensitive   = true
}

variable "app_password" {
  description = "Admin master login password for Supr Orchestrator web page access control"
  type        = string
  sensitive   = true
}
