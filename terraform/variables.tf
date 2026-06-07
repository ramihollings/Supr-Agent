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

variable "enable_github" {
  type    = bool
  default = false
}

variable "gemini_api_key" {
  type      = string
  sensitive = true
  default   = ""
  validation {
    condition     = !var.enable_gemini || length(trimspace(var.gemini_api_key)) > 0
    error_message = "gemini_api_key is required when enable_gemini is true."
  }
}

variable "telegram_bot_token" {
  type      = string
  sensitive = true
  default   = ""
  validation {
    condition     = !var.enable_telegram || length(trimspace(var.telegram_bot_token)) > 0
    error_message = "telegram_bot_token is required when enable_telegram is true."
  }
}

variable "telegram_webhook_secret" {
  type      = string
  sensitive = true
  default   = ""
  validation {
    condition     = !var.enable_telegram || length(trimspace(var.telegram_webhook_secret)) > 0
    error_message = "telegram_webhook_secret is required when enable_telegram is true."
  }
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

variable "github_token" {
  description = "GitHub token used by the certified native GitHub adapter."
  type        = string
  sensitive   = true
  default     = ""
  validation {
    condition     = !var.enable_github || length(trimspace(var.github_token)) > 0
    error_message = "github_token is required when enable_github is true."
  }
}

variable "notification_channel_ids" {
  description = "Existing Cloud Monitoring notification channel resource IDs."
  type        = list(string)
  default     = []
}
