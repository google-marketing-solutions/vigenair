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

gcloud config set project maj-int-ee46670
gcloud services enable cloudresourcemanager.googleapis.com
gcloud auth application-default set-quota-project maj-int-ee46670
printf "\nINFO - GCP project set to 'maj-int-ee46670' succesfully!\n"

test $? -eq 0 || exit
