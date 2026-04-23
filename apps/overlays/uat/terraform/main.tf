# =============================================================================
# Terraform configuration for Authentik groombook-uat application
# =============================================================================
# This Terraform workspace manages the Authentik OAuth2 application and provider
# for the groombook-uat environment.
#
# The authentik_token used for authentication is sourced from the
# `authentik-credentials` SealedSecret (injected as TF_VAR_authentik_token
# by the Terraform CRD runnerPodTemplate.spec.varsFrom).
#
# To import existing resources (run via tf-controller exec or locally with
# AUTHENTIK_TOKEN set):
#   tofu import authentik_oauth2_provider.groombook-uat pk-284
#   tofu import authentik_application.groombook-uat e77a9c45-bed6-4a23-bc62-178f166f099e
# =============================================================================

# -----------------------------------------------------------------------------
# Provider configuration
# -----------------------------------------------------------------------------
terraform {
  required_providers {
    authentik = {
      source  = "goauthentik/authentik"
      version = "~> 2024.12"
    }
  }
}

provider "authentik" {
  url       = var.authentik_url
  api_token = var.authentik_token
  tls_verify = true
}

# -----------------------------------------------------------------------------
# OAuth2 Provider for groombook-uat
# pk = 284 (existing — imported, not recreated)
# -----------------------------------------------------------------------------
resource "authentik_oauth2_provider" "groombook-uat" {
  name        = "groombook-uat-provider"
  slug        = "groombook-uat"
  client_id   = "" # managed by imported resource; tracked via ignore_changes
  client_secret = "" # managed by imported resource; tracked via ignore_changes
  client_type = "confidential"
  redirect_uris = ["https://uat.groombook.dev/api/auth/oauth2/callback/authentik"]
  signing_key = "authentik signing key"

  # Keep Terraform from overwriting the client_id, client_secret, and signing_key
  # which are managed by the imported existing resource
  lifecycle {
    ignore_changes = [
      client_id,
      client_secret,
      signing_key,
    ]
  }
}

# -----------------------------------------------------------------------------
# Application for groombook-uat
# pk = e77a9c45-bed6-4a23-bc62-178f166f099e (existing — imported, not recreated)
# -----------------------------------------------------------------------------
resource "authentik_application" "groombook-uat" {
  name        = "groombook-uat"
  slug        = "groombook-uat"
  group       = "groombook"
  policy_ids  = []
  description = "GroomBook UAT application"

  # Link to the OAuth2 provider
  oauth2_provider = authentik_oauth2_provider.groombook-uat.id

  # Track name, slug, group, and oauth2_provider for drift detection;
  # ignore policy_ids and description which may be updated out-of-band
  lifecycle {
    ignore_changes = [
      policy_ids,
      description,
    ]
  }
}

# -----------------------------------------------------------------------------
# Outputs (for reference / verification)
# -----------------------------------------------------------------------------
output "oauth2_provider_pk" {
  description = "Authentik OAuth2 Provider primary key"
  value       = authentik_oauth2_provider.groombook-uat.pk
}

output "application_pk" {
  description = "Authentik Application primary key"
  value       = authentik_application.groombook-uat.pk
}

output "application_slug" {
  description = "Authentik Application slug"
  value       = authentik_application.groombook-uat.slug
}
