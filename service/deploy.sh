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
gcloud services enable cloudresourcemanager.googleapis.com
gcloud auth application-default set-quota-project <gcp-project-id>
printf "\nINFO - GCP project set to '<gcp-project-id>' succesfully!\n"

BUCKET_EXISTS=$(gcloud storage ls gs://<gcs-bucket> > /dev/null 2>&1 && echo "true" || echo "false")
if "${BUCKET_EXISTS}"; then
  printf "\nWARN - Bucket '<gcs-bucket>' already exists. Skipping bucket creation...\n"
else
  gcloud storage buckets create gs://<gcs-bucket> --project=<gcp-project-id> --location=<gcs-location> --uniform-bucket-level-access
  test $? -eq 0 || exit
  printf "\nINFO - Bucket '<gcs-bucket>' created successfully in location '<gcs-location>'!\n"
fi

printf "\nINFO - Enabling GCP APIs...\n"
gcloud services enable \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudfunctions.googleapis.com \
  compute.googleapis.com \
  eventarc.googleapis.com \
  logging.googleapis.com \
  pubsub.googleapis.com \
  run.googleapis.com \
  script.googleapis.com \
  serviceusage.googleapis.com \
  storage.googleapis.com \
  videointelligence.googleapis.com

PROJECT_NUMBER=$(gcloud projects describe <gcp-project-id> --format="value(projectNumber)")
STORAGE_SERVICE_ACCOUNT="service-${PROJECT_NUMBER}@gs-project-accounts.iam.gserviceaccount.com"
EVENTARC_SERVICE_ACCOUNT="service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com"
VERTEXAI_SERVICE_ACCOUNT="service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com"
COMPUTE_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
printf "\nINFO - Creating Service Agents and granting roles...\n"
for SA in "aiplatform.googleapis.com" "storage.googleapis.com" "eventarc.googleapis.com"; do
    gcloud --no-user-output-enabled beta services identity create --project=<gcp-project-id> \
        --service="${SA}"
done
COMPUTE_SA_ROLES=(
    "roles/eventarc.eventReceiver"
    "roles/run.invoker"
    "roles/cloudfunctions.invoker"
    "roles/storage.objectAdmin"
    "roles/aiplatform.user"
    "roles/logging.logWriter"
    "roles/artifactregistry.createOnPushWriter"
    "roles/cloudbuild.builds.builder"
)
for COMPUTE_SA_ROLE in "${COMPUTE_SA_ROLES[@]}"; do
    gcloud --no-user-output-enabled projects add-iam-policy-binding \
        <gcp-project-id> \
        --member="serviceAccount:${COMPUTE_SERVICE_ACCOUNT}" \
        --role="${COMPUTE_SA_ROLE}"
done
gcloud --no-user-output-enabled projects add-iam-policy-binding \
    <gcp-project-id> \
    --member="serviceAccount:${STORAGE_SERVICE_ACCOUNT}" \
    --role="roles/pubsub.publisher"
gcloud --no-user-output-enabled projects add-iam-policy-binding \
    <gcp-project-id> \
    --member="serviceAccount:${EVENTARC_SERVICE_ACCOUNT}" \
    --role="roles/eventarc.serviceAgent"
gcloud --no-user-output-enabled projects add-iam-policy-binding \
    <gcp-project-id> \
    --member="serviceAccount:${VERTEXAI_SERVICE_ACCOUNT}" \
    --role="roles/storage.objectViewer"
printf "Operation finished successfully!\n"
printf "\nINFO - Deploying the 'vigenair' Cloud Function...\n"
gcloud functions deploy vigenair \
--env-vars-file .env.yaml \
--gen2 \
--region=<gcp-region> \
--runtime=python310 \
--source=. \
--entry-point=gcs_file_uploaded \
--timeout=540s \
--memory=32Gi \
--cpu=8 \
--trigger-event-filters="type=google.cloud.storage.object.v1.finalized" \
--trigger-event-filters="bucket=<gcs-bucket>" \
--trigger-location="<gcs-location>"
test $? -eq 0 || exit
