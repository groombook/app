# =============================================================================
# Authentik UAT user personas — Terraform resources
# =============================================================================
# Creates three Authentik users bound to the groombook-uat application:
#   - UAT Super User   (manager role, superuser)
#   - UAT Groomer      (staff/groomer role)
#   - UAT Customer     (no staff record — auth identity only)
#
# Passwords are sourced from sensitive Terraform variables which are injected
# via tf-controller varsFrom from the authentik-uat-users-credentials SealedSecret.
#
# User PKs are exported as outputs — these are the OIDC sub claims in Authentik.
# =============================================================================

# -----------------------------------------------------------------------------
# Group: groombook-uat-users
# -----------------------------------------------------------------------------
resource "authentik_group" "groombook-uat-users" {
  name = "groombook-uat-users"
}

# -----------------------------------------------------------------------------
# User: UAT Super User
# -----------------------------------------------------------------------------
resource "authentik_user" "uat-super" {
  name            = "UAT Super User"
  username        = "uat-super"
  email           = "uat-super@groombook.dev"
  password        = var.uat_super_password
  active          = true
  # Attributes stored as JSON string per authentik_user schema
  attributes_json = jsonencode({
    role = "manager"
  })
}

# Add uat-super to the group
resource "authentik_group_membership" "uat-super" {
  group = authentik_group.groombook-uat-users.id
  user  = authentik_user.uat-super.pk
}

# Bind the group to the groombook-uat application via policy binding
# This grants group members authentication access to the application
resource "authentik_policy_binding" "uat-super-group-binding" {
  policy     = authentik_group.groombook-uat-users.id
  target     = authentik_application.groombook-uat.pk
  binding_type = "group_whitelist"
}

# -----------------------------------------------------------------------------
# User: UAT Groomer (Staff)
# -----------------------------------------------------------------------------
resource "authentik_user" "uat-groomer" {
  name            = "UAT Groomer"
  username        = "uat-groomer"
  email           = "uat-groomer@groombook.dev"
  password        = var.uat_groomer_password
  active          = true
  attributes_json = jsonencode({
    role = "groomer"
  })
}

# Add uat-groomer to the group
resource "authentik_group_membership" "uat-groomer" {
  group = authentik_group.groombook-uat-users.id
  user  = authentik_user.uat-groomer.pk
}

# Bind the group to the groombook-uat application
resource "authentik_policy_binding" "uat-groomer-group-binding" {
  policy     = authentik_group.groombook-uat-users.id
  target     = authentik_application.groombook-uat.pk
  binding_type = "group_whitelist"
}

# -----------------------------------------------------------------------------
# User: UAT Customer
# -----------------------------------------------------------------------------
resource "authentik_user" "uat-customer" {
  name            = "UAT Customer"
  username        = "uat-customer"
  email           = "uat-customer@groombook.dev"
  password        = var.uat_customer_password
  active          = true
  attributes_json = jsonencode({
    role = "customer"
  })
}

# Add uat-customer to the group
resource "authentik_group_membership" "uat-customer" {
  group = authentik_group.groombook-uat-users.id
  user  = authentik_user.uat-customer.pk
}

# Bind the group to the groombook-uat application
resource "authentik_policy_binding" "uat-customer-group-binding" {
  policy     = authentik_group.groombook-uat-users.id
  target     = authentik_application.groombook-uat.pk
  binding_type = "group_whitelist"
}

# -----------------------------------------------------------------------------
# Outputs — OIDC sub claims (= user PK in Authentik)
# -----------------------------------------------------------------------------
output "uat_super_user_pk" {
  description = "UAT Super User primary key (OIDC sub)"
  value       = authentik_user.uat-super.pk
}

output "uat_groomer_user_pk" {
  description = "UAT Groomer primary key (OIDC sub)"
  value       = authentik_user.uat-groomer.pk
}

output "uat_customer_user_pk" {
  description = "UAT Customer primary key (OIDC sub)"
  value       = authentik_user.uat-customer.pk
}
