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

const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const replace = require("replace");
const spawn = require("cross-spawn");

export const DEFAULT_GCP_REGION = "us-central1";
export const DEFAULT_GCS_LOCATION = "us";
const GCS_BUCKET_NAME_SUFFIX = "-vigenair";
const USE_TERRAFORM_FOR_GCP_DEPLOYMENT = true;
const CLOUD_RUN_UI_SERVICE_NAME = "vigenair-web"

interface Config {
  gcpProjectId?: string;
  gcpRegion?: string;
  gcsLocation?: string;
  vertexAiRegion?: string;
  googleOauthClientId?: string;
  userPrincipal?: string;
}

interface ConfigReplace {
  regex: string;
  replacement: string;
  paths: string[];
}

export interface PromptsResponse {
  gcpProjectId: string;
  deployGcpComponents: boolean;
  deployUi: boolean;
  gcpRegion?: string;
  gcsLocation?: string;
  vertexAiRegion?: string;
  googleOauthClientId?: string;
  userPrincipal?: string;
}

export class GcpDeploymentHandler {
  static async checkGcloudAuth() {
    const gcloudAuthExists = await fs.exists(
      path.join(os.homedir(), ".config", "gcloud", "credentials.db")
    );
    const gcloudAppDefaultCredsExists = await fs.exists(
      path.join(
        os.homedir(),
        ".config",
        "gcloud",
        "application_default_credentials.json"
      )
    );
    if (!gcloudAuthExists) {
      console.log("Logging in via gcloud...");
      spawn.sync("gcloud auth login", { stdio: "inherit", shell: true });
      console.log();
    }
    if (!gcloudAppDefaultCredsExists) {
      console.log(
        "Setting Application Default Credentials (ADC) via gcloud..."
      );
      spawn.sync("gcloud auth application-default login", {
        stdio: "inherit",
        shell: true,
      });
      console.log();
    }
  }

  static deployGcpComponents() {
    console.log(
      "Deploying the 'vigenair' service on Cloud Run / Cloud Functions..."
    );
    spawn.sync(
      `npm run ${USE_TERRAFORM_FOR_GCP_DEPLOYMENT ? "tf-" : ""}deploy-service`,
      { stdio: "inherit", shell: true }
    );
  }
}

export class UiDeploymentHandler {
  static deployUi(uiRegion: string,
    options?: {
      iapServiceId?: string;
      serviceUrlOveride?: string;
    }
  ) {
    console.log("Deploying the UI Web App...");
    spawn.sync("npm run deploy-ui", { stdio: "inherit", shell: true });
    const projectId = UserConfigManager.getUserConfig().gcpProjectId;
    const userPrincipal = UserConfigManager.getUserConfig().userPrincipal;
    const uiDeploymentRegion = uiRegion || DEFAULT_GCP_REGION;
    const envVarsList: string[] = [];
    if(options?.iapServiceId) {
      envVarsList.push(`IAP_SERVICE_ID=${options.iapServiceId}`);
    }
    if(options?.serviceUrlOveride) {
      envVarsList.push(`SERVICE_URL_OVERRIDE=${options.serviceUrlOveride}`);
    }
    let envVarsArgument = "";
    if (envVarsList.length > 0) {
      envVarsArgument = ` --set-env-vars=${envVarsList.join(",")}`;
    }

    spawn.sync(`cd ui-backend && gcloud run deploy ${CLOUD_RUN_UI_SERVICE_NAME} \
      --project=${projectId} \
      --region=${uiDeploymentRegion} \
      --no-allow-unauthenticated \
      --source .${envVarsArgument}`, { stdio: "inherit", shell: true });

    spawn.sync(`gcloud beta services identity create \
      --service=iap.googleapis.com \
      --project=${projectId}`, { stdio: "inherit", shell: true });

    spawn.sync(`gcloud run services add-iam-policy-binding ${CLOUD_RUN_UI_SERVICE_NAME} \
      --project=${projectId} \
      --region=${uiDeploymentRegion} \
      --member="serviceAccount:service-$(gcloud projects describe ${projectId}  --format='value(projectNumber)')@gcp-sa-iap.iam.gserviceaccount.com" \
      --role='roles/run.invoker'`, { stdio: "inherit", shell: true });

    spawn.sync(`gcloud beta run services update ${CLOUD_RUN_UI_SERVICE_NAME} \
      --project=${projectId} \
      --region=${uiDeploymentRegion} \
      --iap`, { stdio: "inherit", shell: true });

    spawn.sync(`gcloud beta iap web add-iam-policy-binding \
      --service=${CLOUD_RUN_UI_SERVICE_NAME} \
      --resource-type=cloud-run \
      --project=${projectId} \
      --region=${uiDeploymentRegion} \
      --member=${userPrincipal} \
      --role='roles/iap.httpsResourceAccessor'`, { stdio: "inherit", shell: true });
  }
}

export class UserConfigManager {
  static setUserConfig(response: PromptsResponse) {
    const configReplace = (config: ConfigReplace) => {
      replace({
        regex: config.regex,
        replacement: config.replacement,
        paths: config.paths,
        recursive: false,
        silent: true,
      });
    };

    console.log();
    console.log("Reverting local changes...");
    spawn.sync("git checkout -- ./service/.env.yaml", {
      stdio: "inherit",
      shell: true,
    });
    spawn.sync("git checkout -- ./service/deploy.sh", {
      stdio: "inherit",
      shell: true,
    });
    spawn.sync("git checkout -- ./ui/src/config.ts", {
      stdio: "inherit",
      shell: true,
    });
    spawn.sync("git checkout -- ./ui/appsscript.json", {
      stdio: "inherit",
      shell: true,
    });
    spawn.sync("git checkout -- ./terraform/pre_deploy.sh", {
      stdio: "inherit",
      shell: true,
    });
    spawn.sync(
      "cp ./terraform/terraform.tfvars.template ./terraform/terraform.tfvars",
      {
        stdio: "inherit",
        shell: true,
      }
    );
    console.log("Setting user configuration...");
    const gcpProjectId = response.gcpProjectId;
    const gcpRegion = response.gcpRegion || DEFAULT_GCP_REGION;
    const gcsLocation = response.gcsLocation || DEFAULT_GCS_LOCATION;
    const gcsBucket = `${gcpProjectId
      .replace("google.com:", "")
      .replace(".", "-")
      .replace(":", "-")}${GCS_BUCKET_NAME_SUFFIX}`;
    const vertexAiRegion = response.vertexAiRegion || DEFAULT_GCP_REGION;
    const googleOauthClientId = response.googleOauthClientId || '';
    const userPrincipal = response.userPrincipal || '';

    configReplace({
      regex: "<gcp-project-id>",
      replacement: gcpProjectId,
      paths: [
        "./service/.env.yaml",
        "./service/deploy.sh",
        "./ui/src/config.ts",
        "./terraform/terraform.tfvars",
        "./terraform/pre_deploy.sh",
      ],
    });

    if (response.deployGcpComponents) {
      configReplace({
        regex: "<gcp-region>",
        replacement: gcpRegion,
        paths: [
          "./service/.env.yaml",
          "./service/deploy.sh",
          "./terraform/terraform.tfvars",
        ],
      });

      configReplace({
        regex: "<gcs-location>",
        replacement: gcsLocation,
        paths: ["./service/deploy.sh", "./terraform/terraform.tfvars"],
      });

      configReplace({
        regex: "<vigenair-user-principal>",
        replacement: userPrincipal,
        paths: ["./service/deploy.sh", "./terraform/terraform.tfvars"],
      });
    }
    configReplace({
      regex: "<gcs-bucket>",
      replacement: gcsBucket,
      paths: ["./service/deploy.sh", "./ui/src/config.ts"],
    });
    if (response.deployUi) {
      configReplace({
        regex: "<vertexai-region>",
        replacement: vertexAiRegion,
        paths: ["./ui/src/config.ts"],
      });

      configReplace({
        regex: "<google-oauth-client-id>",
        replacement: googleOauthClientId,
        paths: ["./ui/src/config.ts"],
      });
    }
    fs.writeFileSync(
      ".config.json",
      JSON.stringify({
        gcpProjectId,
        gcpRegion,
        gcsLocation,
        vertexAiRegion,
        googleOauthClientId,
      })
    );
    console.log();
  }

  static getUserConfig(): Config {
    if (fs.existsSync(".config.json")) {
      return JSON.parse(fs.readFileSync(".config.json"));
    }
    return {};
  }
}
