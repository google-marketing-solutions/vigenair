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
data "local_file" "env_config_file" {
  filename = "${path.root}/../service/.env.yaml"
}

locals {
  service_environment_variables = yamldecode(data.local_file.env_config_file.content)
}

data "archive_file" "service_source_code_archive" {
  type        = "zip"
  output_path = "${path.root}/service_source_code.zip"
  source_dir  = "${path.root}/../service"
  excludes = [
    ".env.yaml",
    ".gitignore",
    ".gcloudignore",
    "deploy.sh",
    "update_config.sh",
    "pylintrc",
  ]
}

module "source_code_bucket" {
  source        = "github.com/terraform-google-modules/terraform-google-cloud-storage.git//modules/simple_bucket?ref=27829d2c0e0b3edac6ef03858d2ba40f06f492f9" # commit hash of version 9.1.0
  project_id    = module.project_services.project_id
  name          = "virgenair-service-source-${var.project_id}"
  location      = var.region
  force_destroy = true

  iam_members = [{
    role   = "roles/storage.admin"
    member = data.google_compute_default_service_account.compute_service_agent.member
  }]
}

resource "google_storage_bucket_object" "gcs_service_source_code_archive" {
  name   = "vigenair_service_source_${data.archive_file.service_source_code_archive.output_sha256}.zip"
  source = data.archive_file.service_source_code_archive.output_path
  bucket = module.source_code_bucket.name
}


resource "google_cloudfunctions2_function" "vigenair_service" {
  name     = "vigenair"
  project  = module.project_services.project_id
  location = var.region

  # Build config to prepare the code to run on Cloud Functions 2
  build_config {
    runtime = "python310"
    source {
      storage_source {
        bucket = module.source_code_bucket.name
        object = google_storage_bucket_object.gcs_service_source_code_archive.name
      }

    }
    entry_point = "gcs_file_uploaded"
  }

  event_trigger {
    trigger_region        = var.gcs_location
    event_type            = "google.cloud.storage.object.v1.finalized"
    service_account_email = data.google_compute_default_service_account.compute_service_agent.email
    retry_policy          = "RETRY_POLICY_RETRY"
    event_filters {
      attribute = "bucket"
      value     = google_storage_bucket.backend_service_bucket.name
    }
  }

  service_config {
    available_memory      = "32Gi"
    available_cpu         = "8"
    timeout_seconds       = 540
    environment_variables = local.service_environment_variables
  }

  depends_on = [
    time_sleep.wait_for_policy_propagation
  ]
}