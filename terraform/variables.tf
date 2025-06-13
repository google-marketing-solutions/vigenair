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
variable "project_id" {
  type        = string
  description = "project id required"
}

variable "region" {
  type        = string
  description = "Cloud region where the resources are created"
  default     = "us-central1"
}

variable "gcs_location" {
  type        = string
  description = "GCS location to store videos in (can be multi-region like 'us' or 'eu' or single region like 'us-central1' or 'europe-west4')"
  default     = "us"
}

variable "force_destroy_tf_remote_state" {
  type        = bool
  description = "Controls whether the Terraform remote state bucket can be forcibly destroyed (deleted even if it contains objects). Defaults to 'false' to safeguard against accidental state loss. Only set this to 'true' when you intend to permanently remove the infrastructure and its state bucket."
  default     = false
}

variable "force_destroy_backend_gcs_bucket" {
  type        = bool
  description = "Controls whether the backend GCS bucket can be forcibly destroyed (deleted even if it contains objects). Defaults to 'false' to safeguard against accidental state loss. Only set this to 'true' when you intend to permanently remove the infrastructure and its state bucket."
  default     = false
}

variable "vigenair_user_principal" {
  type        = string
  description = "The user principal to assign roles to for the VigenAir project, such as 'user:', 'group:' etc"
}
