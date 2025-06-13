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
const USE_TERRAFORM_FOR_GCP_DEPLOYMENT = false;
const DEPLOY_UI_ON_CLOUD_RUN = false;
const CLOUD_RUN_UI_SERVICE_NAME = "vigenair-web"

interface Config {
  gcpProjectId?: string;
  gcpRegion?: string;
  gcsLocation?: string;
  vertexAiRegion?: string;
  googleOauthClientId?: string;
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
  webappDomainAccess?: boolean;
  vertexAiRegion?: string;
  googleOauthClientId?: string;
}

class ClaspManager {
  private static async isLoggedIn() {
    return await fs.exists(path.join(os.homedir(), ".clasprc.json"));
  }

  static async login() {
    const loggedIn = await ClaspManager.isLoggedIn();

    if (!loggedIn) {
      console.log("Logging in via clasp...");
      spawn.sync("clasp", ["login", "--no-localhost"], {
        stdio: "inherit",
      });
    }
  }

  static async isConfigured(rootDir: string) {
    return (
      (await fs.exists(path.join(rootDir, ".clasp-dev.json"))) ||
      (await fs.exists(path.join(rootDir, "dist", ".clasp.json")))
    );
  }

  static extractScriptLink(output: string) {
    const scriptLink = output.match(/Created new standalone script: ([^\n]*)/);

    return scriptLink?.length ? scriptLink[1] : "Not found";
  }

  static async create(
    title: string,
    scriptRootDir: string,
    filesRootDir: string
  ) {
    fs.ensureDirSync(path.join(filesRootDir, scriptRootDir));
    const res = spawn.sync(
      "clasp",
      [
        "create",
        "--type",
        "standalone",
        "--rootDir",
        scriptRootDir,
        "--title",
        title,
      ],
      { encoding: "utf-8" }
    );

    await fs.move(".clasp.json", path.join(filesRootDir, ".clasp-dev.json"));
    await fs.copyFile(
      path.join(filesRootDir, ".clasp-dev.json"),
      path.join(filesRootDir, ".clasp-prod.json")
    );
    await fs.remove(path.join(scriptRootDir, "appsscript.json"));
    const output = res.output.join();

    return ClaspManager.extractScriptLink(output);
  }
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
  static async createScriptProject() {
    if(!DEPLOY_UI_ON_CLOUD_RUN) {
      console.log();
      await ClaspManager.login();

      const claspConfigExists = await ClaspManager.isConfigured("./ui");
      if (claspConfigExists) {
        return;
      }
      console.log();
      console.log("Creating Apps Script Project...");
      const scriptLink = await ClaspManager.create("ViGenAiR", "./dist", "./ui");
      console.log();
      console.log("IMPORTANT -> Apps Script Link:", scriptLink);
      console.log();
    }
  }

  static deployUi(uiRegion: string,
    options?: {
      iapServiceId?: string;
      serviceUrlOveride?: string;
    }
  ) {
    console.log("Deploying the UI Web App...");
    if(!DEPLOY_UI_ON_CLOUD_RUN) {
      spawn.sync("npm run deploy-ui", { stdio: "inherit", shell: true });
      const res = spawn.sync("cd ui && clasp undeploy -a && clasp deploy", {
        stdio: "pipe",
        shell: true,
        encoding: "utf8",
      });
      const lastNonEmptyLine = res.output[1]
        .split("\n")
        .findLast((line: string) => line.trim().length > 0);
      let webAppLink = lastNonEmptyLine.match(/- (.*) @.*/);
      webAppLink = webAppLink?.length
        ? `https://script.google.com/a/macros/google.com/s/${webAppLink[1]}/exec`
        : "Could not extract UI Web App link from npm output! Please check the output manually.";
      console.log();
      console.log(`IMPORTANT -> UI Web App Link: ${webAppLink}`);
    } else {
      spawn.sync("npm run build-ui-cloud-run", { stdio: "inherit", shell: true });
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
      spawn.sync(`cd ui-backend && gcloud run deploy ${CLOUD_RUN_UI_SERVICE_NAME} --region=${uiDeploymentRegion} --source .${envVarsArgument}`, { stdio: "inherit", shell: true });
    }
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
    }
    configReplace({
      regex: "<gcs-bucket>",
      replacement: gcsBucket,
      paths: ["./service/deploy.sh", "./ui/src/config.ts"],
    });
    if (response.webappDomainAccess) {
      configReplace({
        regex: "MYSELF",
        replacement: "DOMAIN",
        paths: ["./ui/appsscript.json"],
      });
    }
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
