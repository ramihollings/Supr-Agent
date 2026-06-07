variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "image" {
  type = string
}

variable "database_tier" {
  type    = string
  default = "db-custom-1-3840"
}

variable "worker_concurrency" {
  type    = number
  default = 2
}

variable "worker_max_instances" {
  type    = number
  default = 4
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "app_password" {
  type      = string
  sensitive = true
}

variable "auth_secret" {
  type      = string
  sensitive = true
}

variable "enable_gemini" {
  type    = bool
  default = false
}

variable "enable_telegram" {
  type    = bool
  default = false
}

variable "gemini_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "telegram_bot_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "telegram_webhook_secret" {
  type      = string
  sensitive = true
  default   = ""
}
