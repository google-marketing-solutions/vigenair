# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

locals {
  service_agent_roles = [
    {
      role   = "roles/eventarc.eventReceiver"
      member = data.google_compute_default_service_account.compute_service_agent.member
    },
    {
      role   = "roles/run.invoker"
      member = data.google_compute_default_service_account.compute_service_agent.member
    },
    {
      role   = "roles/cloudfunctions.invoker"
      member = data.google_compute_default_service_account.compute_service_agent.member
    },
    {
      role   = "roles/storage.objectAdmin"
      member = data.google_compute_default_service_account.compute_service_agent.member
    },
    {
      role   = "roles/aiplatform.user"
      member = data.google_compute_default_service_account.compute_service_agent.member
    },
    {
      role   = "roles/logging.logWriter"
      member = data.google_compute_default_service_account.compute_service_agent.member
    },
    {
      role   = "roles/artifactregistry.createOnPushWriter"
      member = data.google_compute_default_service_account.compute_service_agent.member
    },
    {
      role   = "roles/cloudbuild.builds.builder"
      member = data.google_compute_default_service_account.compute_service_agent.member
    },
    {
      role = "roles/pubsub.publisher"
      #The following construction is needed due to this issue: https://github.com/hashicorp/terraform-provider-google/issues/18649
      member = coalesce(google_project_service_identity.google_storage_service_agent.member, google_project_service_identity.google_storage_service_agent.member, "serviceAccount:service-${data.google_project.project_info.number}@gs-project-accounts.iam.gserviceaccount.com")
    },
    {
      role   = "roles/eventarc.serviceAgent"
      member = google_project_service_identity.eventarc_service_agent.member
    },
    {
      role   = "roles/storage.objectViewer"
      member = google_project_service_identity.ai_platform_service_agent.member
    },
  ]
}
resource "google_project_service_identity" "ai_platform_service_agent" {
  provider = google-beta
  project  = module.project_services.project_id
  service  = "aiplatform.googleapis.com"
}

resource "google_project_service_identity" "google_storage_service_agent" {
  provider = google-beta
  project  = module.project_services.project_id
  service  = "storage.googleapis.com"
}

resource "google_project_service_identity" "eventarc_service_agent" {
  provider = google-beta
  project  = module.project_services.project_id
  service  = "eventarc.googleapis.com"
}

data "google_compute_default_service_account" "compute_service_agent" {
}

resource "google_project_iam_member" "project_roles" {
  for_each = { for role in local.service_agent_roles : role.role => role }
  project  = module.project_services.project_id
  role     = each.value.role
  member   = each.value.member
}

# Propagation time for change of access policy typically takes 2 minutes
# according to https://cloud.google.com/iam/docs/access-change-propagation
# this wait make sure the policy changes are propagated before proceeding
# with the build
resource "time_sleep" "wait_for_policy_propagation" {
  create_duration = "120s"
  depends_on = [
    google_project_iam_member.project_roles
  ]
}