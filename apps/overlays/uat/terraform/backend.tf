# =============================================================================
# Backend configuration for Terraform state
# =============================================================================
# Uses Kubernetes backend with tf-controller managed state secret.
# tf-controller creates a Kubernetes Secret named:
#   tfstate-<name>-<secret_suffix>
# i.e. tfstate-authentik-uat-authentik-uat-tf-state
# in the namespace specified by the Terraform CRD metadata.namespace (groombook-uat).
#
# Valid Kubernetes backend attributes for tf-controller:
#   secret_suffix, namespace, config_path, cluster_ca_cert, client_certificate,
#   client_key, token, exec, host, insecure, username, password,
#   in_cluster, load_config, config_paths
# =============================================================================

terraform {
  backend "kubernetes" {
    secret_suffix = "authentik-uat-tf-state"
    namespace     = "groombook-uat"
  }
}
