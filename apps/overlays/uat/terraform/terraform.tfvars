# =============================================================================
# Terraform variable values for groombook-uat
# =============================================================================
# NOTE: authentik_token should be provided via AUTHENTIK_TOKEN env var,
# sourced from the authentik-credentials SealedSecret.
# The placeholder value here is not used when running via tf-controller.
# =============================================================================

authentik_url = "https://auth.farh.net"
# authentik_token = "<set via AUTHENTIK_TOKEN env var from authentik-credentials secret>"
