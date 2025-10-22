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

import { GcpDeploymentHandler, UiDeploymentHandler } from "./common.js";

(async () => {
  const response = await prompts([
    {
      type: "toggle",
      name: "deployGcpComponents",
      message:
        "Would you like to update the 'vigenair' service on Cloud Run / Cloud Functions?",
      initial: false,
      active: "Yes",
      inactive: "No",
    },
    {
      type: "toggle",
      name: "deployUi",
      message: "Would you like to update the UI?",
      initial: false,
      active: "Yes",
      inactive: "No",
    },
  ]);
  if (response.deployGcpComponents) {
    GcpDeploymentHandler.deployGcpComponents();
  }
  if (response.deployUi) {
    UiDeploymentHandler.deployUi(response.vertexAiRegion);
  }
})();
