#!/bin/bash
# Copyright 2024 Google LLC.
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

# Deploy the ViGenAiR cloud function to the target GCP project.
gcloud functions deploy vigenair \
--env-vars-file .env.yaml \
--gen2 \
--region=us-central1 \
--runtime=python310 \
--source=. \
--entry-point=gcs_file_uploaded \
--timeout=540s \
--memory=32Gi \
--min-instances=1 \
--cpu=8 \
--trigger-event-filters="type=google.cloud.storage.object.v1.finalized" \
--trigger-event-filters="bucket=gps-generative-ai-vigenair" \
--trigger-location="us"
