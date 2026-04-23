# Import existing Authentik resources into Terraform state.
# These blocks are consumed on the first apply and become no-ops thereafter.

import {
  to = authentik_oauth2_provider.groombook-uat
  id = "284"
}

import {
  to = authentik_application.groombook-uat
  id = "e77a9c45-bed6-4a23-bc62-178f166f099e"
}
