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
const { Storage } = require("@google-cloud/storage")
const { ServiceUsageClient } = require("@google-cloud/service-usage");

export const DEFAULT_GCP_REGION = "us-central1";
export const DEFAULT_GCS_LOCATION = "us";
const GCS_BUCKET_NAME_SUFFIX = "-vigenair";

interface Config {
  gcpProjectId?: string;
  gcpRegion?: string;
  gcsLocation?: string;
  vertexAiRegion?: string;
  gcsBucket?: string;
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
}

class ClaspManager {
  private static async isLoggedIn() {
    return await fs.exists(path.join(os.homedir(), ".clasprc.json"));
  }

  static async login() {
    const loggedIn = await ClaspManager.isLoggedIn();

    if (!loggedIn) {
      console.log("Logging in via clasp...");
      spawn.sync("clasp", ["login"], { stdio: "inherit" });
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

    await fs.move(
      path.join(scriptRootDir, ".clasp.json"),
      path.join(filesRootDir, ".clasp-dev.json")
    );
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

  static async deployGcpComponents(config: Config) {
    GcloudCliHandler.setupGcloudCli(config);
    await GcpServiceUsageHandler.enableProjectAPIs(config);
    await GCSDeploymentHandler.createBackendBucket(config);
    console.log(
      "Deploying the 'vigenair' service on Cloud Run / Cloud Functions..."
    );
    spawn.sync("npm run deploy-service", { stdio: "inherit", shell: true });
  }
}

class GcloudCliHandler {
  static setupGcloudCli(config: Config) {
    console.log(
      "INFO - Setup gcloud..."
    );
    spawn.sync(`gcloud config set project ${config.gcpProjectId}`, {
      stdio: "inherit",
      shell: true,
    });
    spawn.sync("gcloud services enable cloudresourcemanager.googleapis.com", {
      stdio: "inherit",
      shell: true,
    });
    spawn.sync(`gcloud auth application-default set-quota-project ${config.gcpProjectId}`, {
      stdio: "inherit",
      shell: true,
    });
    console.log(
      `INFO - gcloud project set to '${config.gcpProjectId}' succesfully!`
    )
  }
}

class UserAgentTagHandler {
  private static _USER_AGENT_PREFIX: string = "cloud-solutions/mas-vigenair-deploy-";
  private static _SOFTWARE_VERSION: string = "-1";
  private static _getSoftwareVersion(): string {
    if(UserAgentTagHandler._SOFTWARE_VERSION === "-1") {
      var CONFIG_KEY = "CONFIG_BACKEND_VERSION";
      var configLines = fs.readFileSync("./service/.env.yaml").toString().split("\n");
      var softwareVersionLine = configLines.filter((line: string) => line.includes(CONFIG_KEY))[0];
      UserAgentTagHandler._SOFTWARE_VERSION = softwareVersionLine.match(/\'(.+)\'/)[1];
    }
    return UserAgentTagHandler._SOFTWARE_VERSION;
  }
  static get USER_AGENT_TRACKING_ID(): string {
    return `${UserAgentTagHandler._USER_AGENT_PREFIX}${UserAgentTagHandler._getSoftwareVersion()}`;
  }
}

class GcpServiceUsageHandler {
  private static _SERVICE_USAGE_CLIENT: typeof ServiceUsageClient;
  private static _readAPIList(): string[] {
    return fs.readFileSync("./service/project_apis.txt").toString().split("\n");
  }
  private static _getServiceUsageClient(config: Config): typeof ServiceUsageClient{
    if(typeof GcpServiceUsageHandler._SERVICE_USAGE_CLIENT === "undefined") {
      GcpServiceUsageHandler._SERVICE_USAGE_CLIENT = new ServiceUsageClient({
        projectId: config.gcpProjectId,
        userAgent: UserAgentTagHandler.USER_AGENT_TRACKING_ID
      });
    }
    return GcpServiceUsageHandler._SERVICE_USAGE_CLIENT;
  }
  private static async _getEnabledAPIs(config: Config) {
    const client = GcpServiceUsageHandler._getServiceUsageClient(config);
    const parent = `projects/${config.gcpProjectId}`;
    const filter = "state:ENABLED";
    const result: string[] = [];
    for await (const service of client.listServicesAsync({
      parent,
      filter,
    })) {
      result.push(service.name);
    }
    return result;
  }

  private static async _batchEnableServices(config: Config, serviceIds: string[]) {
    const client = GcpServiceUsageHandler._getServiceUsageClient(config);
    const parent = `projects/${config.gcpProjectId}`;
    const [operation] = await client.batchEnableServices({
      parent,
      serviceIds,
    });
    const [response] = await operation.promise();
    console.log(response);
  }

  static async enableProjectAPIs(config: Config){
    const requiredEnabledAPIs: string[] = GcpServiceUsageHandler._readAPIList();
    const enabledProjectAPIs = await GcpServiceUsageHandler._getEnabledAPIs(config);
    const enabledAPIs: string[] = enabledProjectAPIs
      // Extract service api name from the full service resource name: projects/xxxxxx/services/[service-api-name]
      .map((fullServiceName: string) => fullServiceName.split("/services/")[1]);
    const apisToBeEnabled: string[] = [];
    for(const serviceName of requiredEnabledAPIs) {
      if (!enabledAPIs.includes(serviceName)) {
        apisToBeEnabled.push(serviceName);
      }
    }
    if (apisToBeEnabled.length > 0) {
      console.log('INFO - Enabling GCP APIs:');
      apisToBeEnabled.forEach((api) => console.log(api));
      GcpServiceUsageHandler._batchEnableServices(config, apisToBeEnabled);
    } else {
      console.log("All required APIs are already enabled.");
    }
  }
}

class GCSDeploymentHandler {
  static async createBackendBucket(config: Config) {
    try {
      const storage = new Storage({
        projectId: config.gcpProjectId,
        userAgent: UserAgentTagHandler.USER_AGENT_TRACKING_ID
      });
      const bucket = storage.bucket(config.gcsBucket);
      const bucketExists = await bucket.exists();
      if (!bucketExists[0]) {
        await storage.createBucket(config.gcsBucket, {
          location: config.gcsLocation,
        });
        await storage.bucket(config.gcsBucket).setMetadata({
          iamConfiguration: {
            uniformBucketLevelAccess: {
              enabled: true,
            },
          },
        });
        console.log(
          `INFO - Bucket '${config.gcsBucket}' created successfully in location '${config.gcsLocation}'!`
        )
      } else {
        console.log(
          `WARN - Bucket '${config.gcsBucket}' already exists. Skipping bucket creation...`
        )
      }
    } catch (e) {
      console.log(e);
    }
  }
}

export class UiDeploymentHandler {
  static async createScriptProject() {
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

  static deployUi() {
    console.log("Deploying the UI Web App...");
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
    console.log("Setting user configuration...");
    const gcpProjectId = response.gcpProjectId;
    const gcpRegion = response.gcpRegion || DEFAULT_GCP_REGION;
    const gcsLocation = response.gcsLocation || DEFAULT_GCS_LOCATION;
    const gcsBucket = `${gcpProjectId
      .replace("google.com:", "")
      .replace(".", "-")
      .replace(":", "-")}${GCS_BUCKET_NAME_SUFFIX}`;
    const vertexAiRegion = response.vertexAiRegion || DEFAULT_GCP_REGION;

    configReplace({
      regex: "<gcp-project-id>",
      replacement: gcpProjectId,
      paths: [
        "./service/.env.yaml",
        "./service/deploy.sh",
        "./ui/src/config.ts",
      ],
    });

    if (response.deployGcpComponents) {
      configReplace({
        regex: "<gcp-region>",
        replacement: gcpRegion,
        paths: ["./service/.env.yaml", "./service/deploy.sh"],
      });

      configReplace({
        regex: "<gcs-location>",
        replacement: gcsLocation,
        paths: ["./service/deploy.sh"],
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
    }
    fs.writeFileSync(
      ".config.json",
      JSON.stringify({
        gcpProjectId,
        gcpRegion,
        gcsLocation,
        vertexAiRegion,
        gcsBucket,
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
