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

gcloud config set project <gcp-project-id>
printf "\nINFO - GCP project set to '<gcp-project-id>' succesfully!\n"

BUCKET_EXISTS=$(gcloud storage ls gs://<gcs-bucket> > /dev/null 2>&1 && echo "true" || echo "false")
if "${BUCKET_EXISTS}"; then
  printf "\nWARN - Bucket '<gcs-bucket>' already exists. Skipping bucket creation...\n"
else
  gcloud storage buckets create gs://<gcs-bucket> --project=<gcp-project-id> --location=<gcs-location>
  printf "\nINFO - Bucket '<gcs-bucket>' created successfully in location '<gcs-location>'!\n"
fi

printf "\nINFO - Deploying the 'vigenair' Cloud Function...\n"
gcloud functions deploy vigenair \
--env-vars-file .env.yaml \
--gen2 \
--region=<gcp-region> \
--runtime=python310 \
--source=. \
--entry-point=gcs_file_uploaded \
--timeout=540s \
--memory=8Gi \
--min-instances=1 \
--cpu=2 \
--trigger-event-filters="type=google.cloud.storage.object.v1.finalized" \
--trigger-event-filters="bucket=<gcs-bucket>" \
--trigger-location="<gcs-location>"
