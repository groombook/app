# =============================================================================
# Variables for Authentik groombook-uat Terraform workspace
# =============================================================================

variable "authentik_url" {
  description = "Base URL of the Authentik instance"
  type        = string
  default     = "https://auth.farh.net"
}

variable "authentik_token" {
  description = "API token for Authentik (from authentik-credentials secret via AUTHENTIK_TOKEN env var)"
  type        = string
  sensitive   = true
}

variable "uat_super_password" {
  description = "Password for the UAT Super User account"
  type        = string
  sensitive   = true
}

variable "uat_groomer_password" {
  description = "Password for the UAT Groomer staff account"
  type        = string
  sensitive   = true
}

variable "uat_customer_password" {
  description = "Password for the UAT Customer account"
  type        = string
  sensitive   = true
}
