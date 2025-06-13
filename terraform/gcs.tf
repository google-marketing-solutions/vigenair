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
  gcs_bucket_name_suffix = "-vigenair"
  backend_bucket_iam_bindings = {
    "roles/storage.folderAdmin"  = var.vigenair_user_principal,
    "roles/storage.objectAdmin"  = var.vigenair_user_principal,
    "roles/storage.bucketViewer" = var.vigenair_user_principal
  }
}

resource "google_storage_bucket" "tf_backend" {
  name     = "${module.project_services.project_id}-vigenair-tf-backend"
  location = var.region

  force_destroy               = var.force_destroy_tf_remote_state
  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

resource "local_file" "remote_backend" {
  file_permission = "0644"
  filename        = "${path.module}/backend.tf"

  content = <<-EOT
  terraform {
    backend "gcs" {
      bucket = "${google_storage_bucket.tf_backend.name}"
    }
  }
  EOT
}

resource "google_storage_bucket" "backend_service_bucket" {
  name     = "${module.project_services.project_id}${local.gcs_bucket_name_suffix}"
  location = var.gcs_location

  force_destroy               = var.force_destroy_backend_gcs_bucket
  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

resource "google_storage_bucket_iam_member" "vigenair_user_backend_bucket_access" {
  for_each = local.backend_bucket_iam_bindings
  bucket   = google_storage_bucket.backend_service_bucket.name
  role     = each.key
  member   = each.value
}
