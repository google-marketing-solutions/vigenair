/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const prompts = require("prompts");

import {
  DEFAULT_GCP_REGION,
  DEFAULT_GCS_LOCATION,
  GcpDeploymentHandler,
  PromptsResponse,
  UiDeploymentHandler,
  UserConfigManager,
} from "./common.js";

const config = UserConfigManager.getUserConfig();

(async () => {
  const response = await prompts([
    {
      type: "text",
      name: "gcpProjectId",
      message: `Enter your GCP Project ID - [${
        config.gcpProjectId
          ? `Current: ${config.gcpProjectId}`
          : "e.g. my-project-123"
      }]:`,
      initial: config.gcpProjectId ?? "",
      validate: (value: string) => (!value ? "Required" : true),
    },
    {
      type: "toggle",
      name: "deployGcpComponents",
      message:
        "Would you like to deploy the 'vigenair' service on Cloud Run / Cloud Functions?",
      initial: true,
      active: "Yes",
      inactive: "No",
    },
    {
      type: (prev: boolean, values: PromptsResponse, prompt: unknown) =>
        values.deployGcpComponents ? "text" : null,
      name: "gcpRegion",
      message: `Enter a GCP region for the 'vigenair' service to run in - [${
        config.gcpRegion
          ? `Current: ${config.gcpRegion}`
          : `Default: ${DEFAULT_GCP_REGION}`
      }]:`,
      intitial: config.gcpRegion ?? DEFAULT_GCP_REGION,
    },
    {
      type: (prev: boolean, values: PromptsResponse, prompt: unknown) =>
        values.deployGcpComponents ? "text" : null,
      name: "gcsLocation",
      message: `Enter a GCS location to store videos in (can be multi-region like 'us' or 'eu' or single region like 'us-central1' or 'europe-west4') - [${
        config.gcsLocation
          ? `Current: ${config.gcsLocation}`
          : `Default: ${DEFAULT_GCS_LOCATION}`
      }]:`,
      intitial: config.gcsLocation ?? DEFAULT_GCS_LOCATION,
    },
    {
      type: "toggle",
      name: "deployUi",
      message: "Would you like to deploy the UI?",
      initial: true,
      active: "Yes",
      inactive: "No",
    },
    {
      type: (prev: boolean, values: PromptsResponse, prompt: unknown) =>
        values.deployUi ? "toggle" : null,
      name: "webappDomainAccess",
      message:
        "Are you a Google Workspace user and would like to deploy the application for all users in your domain?",
      initial: false,
      active: "Yes",
      inactive: "No",
    },
    {
      type: (prev: boolean, values: PromptsResponse, prompt: unknown) =>
        values.deployUi ? "text" : null,
      name: "vertexAiRegion",
      message: `Enter a GCP region to access Vertex AI generative models. Refer to https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations#available-regions for available regions - [${
        config.vertexAiRegion
          ? `Current: ${config.vertexAiRegion}`
          : `Default: ${DEFAULT_GCP_REGION}`
      }]:`,
      intitial: config.vertexAiRegion ?? DEFAULT_GCP_REGION,
    },
    {
      type: (prev: boolean, values: PromptsResponse, prompt: unknown) =>
        values.deployUi ? "text" : null,
      name: "googleOauthClientId",
      message: `Enter your Google OAuth client ID. Refer to https://console.cloud.google.com/auth/clients`,
      initial: config.googleOauthClientId ?? "",
    }
  ]);
  UserConfigManager.setUserConfig(response);

  if (response.deployGcpComponents) {
    await GcpDeploymentHandler.checkGcloudAuth();
    GcpDeploymentHandler.deployGcpComponents();
  }

  if (response.deployUi) {
    await UiDeploymentHandler.createScriptProject();
    UiDeploymentHandler.deployUi(response.vertexAiRegion);
  }
})();
