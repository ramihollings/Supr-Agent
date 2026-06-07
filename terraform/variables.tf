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

variable "enable_gemini" {
  type    = bool
  default = false
}

variable "enable_telegram" {
  type    = bool
  default = false
}

variable "enable_github" {
  type    = bool
  default = false
}

variable "telegram_chat_id" {
  description = "Telegram chat ID authorized to operate Supr."
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_telegram || length(trimspace(var.telegram_chat_id)) > 0
    error_message = "telegram_chat_id is required when enable_telegram is true."
  }
}

variable "notification_channel_ids" {
  description = "Existing Cloud Monitoring notification channel resource IDs."
  type        = list(string)
  default     = []
}
