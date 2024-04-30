<!--
Copyright 2024 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->
<img align="left" width="150" src="https://services.google.com/fh/files/misc/vigenair_logo.png" alt="ViGenAiR Logo" /><br>

# ViGenAiR - Recrafting Video Ads with Generative AI

[![GitHub last commit](https://img.shields.io/github/last-commit/google-marketing-solutions/vigenair)](https://github.com/google-marketing-solutions/vigenair/commits)
[![Code Style: Google](https://img.shields.io/badge/code%20style-google-blueviolet.svg)](https://github.com/google/gts)

**Disclaimer: This is not an official Google product.**

[Overview](#overview) •
[Get started](#get-started) •
[What it solves](#challenges) •
[How it works](#solution-overview) •
[How to Contribute](#how-to-contribute)

## Updates

* [May 2024]: Launch! 🚀

## Overview

**ViGenAiR** *(pronounced vision-air)* uses state-of-the-art multimodal Generative AI on Google Cloud Platform (GCP) to automatically repurpose long-form Video Ads and generate several shorter variants and storylines at scale. It generates horizontal, vertical and square assets to power [Demand Gen](https://support.google.com/google-ads/answer/13695777?hl=en) and [YouTube video campaigns](https://support.google.com/youtube/answer/2375497?hl=en), and leverages Google Ads' built-in A/B testing to automatically identify the best variants tailored to your target audiences. ViGenAiR is an acronym for <u>Vi</u>deo <u>Gen</u>eration via <u>A</u>ds <u>R</u>ecrafting, and is more colloquially referred to as *Vigenair*.

## Get Started

Please make sure you have fulfilled all prerequisites mentioned under [Requirements](#requirements) first.

1. Make sure your system has an up-to-date installation of [Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).
1. Make sure your system has an up-to-date installation of the [gcloud CLI](https://cloud.google.com/sdk/docs/install).
1. Make sure your system has an up-to-date installation of `git` and use it to clone this repository.
1. Navigate to the directory where the source code lives.
1. Run `npm start`.

You will be asked to enter a GCP Project ID, and whether you would like to deploy GCP components, the UI, or both. If you opt to deploy GCP components, you will be asked to enter an optional [Cloud Function region](https://cloud.google.com/functions/docs/locations) (defaults to `us-central1`) and an optional [GCS location](https://cloud.google.com/storage/docs/locations) (defaults to `us`).
The `npm start` command will then ask you to authenticate to both Google Workspace (via [clasp](https://github.com/google/clasp)) and Google Cloud, followed by creating a bucket named <code>*<gcp_project_id>*-vigenair</code> (if it doesn't already exist), deploying the `vigenair` Cloud Function to your Cloud project, and finally deploying the Angular UI web app to a new Apps Script project. The URL of the web app will be output at the end of the deployment process, which you can use to run the app and start generating videos.

See [Solution Overview](#solution-overview) for more details on the different components of the solution.

### UI Web App Access Settings

By default, Vigenair runs only for the user that deployed it. This is controlled by the [Web App access settings](https://developers.google.com/apps-script/manifest/web-app-api-executable#webapp) in the project's [manifest file](./ui/appsscript.json), which is set to `MYSELF` by default. This setup works well for most cases, however if you are a Google Workspace customer you may change this value to `DOMAIN` to allow other individuals within your organization to run the app. The `npm start` command will prompt you for this as well if you opt to deploy the UI.

### Requirements

You need the following to use Vigenair:

* Google account: required to access the Vigenair UI.
* GCP project with:
  * The [Vertex AI API](https://cloud.google.com/vertex-ai/docs/generative-ai/start/quickstarts/api-quickstart) enabled: required to access Gemini in Vertex AI.
    * All users running Vigenair must be granted the [Vertex AI User](https://cloud.google.com/vertex-ai/docs/general/access-control#aiplatform.user) role on the associated GCP project.
  * The [Video AI API](https://cloud.google.com/video-intelligence) enabled (AKA Cloud Video Intelligence API): required for analysing input videos.
  * All users running Vigenair must be granted the [Storage Object User](https://cloud.google.com/storage/docs/access-control/iam-roles) role on the associated GCP project.

The Vigenair [setup and deployment script](#get-started) will create the following components:

* A Google Cloud Storage (GCS) bucket named <code>*<gcp_project_id>*-vigenair</code>
* A Cloud Function (2nd gen) named `vigenair` that fulfills both the Extractor and Combiner services. Refer to [deploy.sh](./service/deploy.sh) for specs.
* An Apps Script deployment for the frontend web app.

If you will also be deploying Vigenair, you need to have the following additional roles on the associated GCP project:

* `Storage Admin` for the entire project OR `Storage Legacy Bucket Writer` on the <code>*<gcp_project_id>*-vigenair</code> bucket. See [IAM Roles for Cloud Storage](https://cloud.google.com/storage/docs/access-control/iam-roles) for more information.
* `Cloud Functions Developer` to deploy and manage Cloud Functions. See [IAM Roles for Cloud Functions](https://cloud.google.com/functions/docs/reference/iam/roles) for more information.

## Challenges

Current Video Ads creative solutions, both within YouTube / Google Ads as well as open source, primarily focus on 4 of the [5 keys to effective advertising](https://info.ncsolutions.com/hubfs/2023%20Five%20Keys%20to%20Advertising%20Effectiveness/NCS_Five_Keys_to_Advertising_Effectiveness_E-Book_08-23.pdf) - Brand, Targeting, Reach and Recency. Those 4 pillars contribute to *only ~50%* of the potential marketing ROI, with the 5th pillar - **Creative** - capturing a *whopping ~50%* all on its own.

<center><img src='./img/creative.png' width='640px' alt='The importance of Creatives for effective adverising' /></center>

Vigenair focuses on the *Creative* pillar to help potentially **unlock ~50% ROI** while solving a huge pain point for advertisers; the generation, trafficking and A/B testing of different Video Ad formats, at **scale**, powered by Google's multimodal Generative AI - Gemini.

### Benefits

* **Inventory**: Horizontal, vertical and square Video assets in different durations allow advertisers to tap into virtually ALL Google-owned sources of inventory
* **Campaigns**: Shorter more compelling Video Ads that still capture the meaning and storyline of their original ads - ideal for *Social* and *Awareness/Consideration* campaigns
* **Creative Excellence**: Coherent Videos (e.g. dialogue doesn't get cut mid-scene, videos don't end abruptly, etc.) that follow Google's best practices for creatives, including creative direction rules for camera angles and scene cutting
* **User Control**: Users can steer the model towards generating their desired videos (via prompts and user scene selection)
* **Performance**: Built-in A/B testing provides a basis for automatically identifying the best variants tailored to the advertiser's target audiences

## Solution Overview

Vigenair's frontend is an Angular Progressive Web App (PWA) hosted on Google Apps Script and accessible via a [web app deployment](https://developers.google.com/apps-script/guides/web). As with all Google Workspace apps, users must authenticate with a Google account in order to use the Vigenair web app. Backend services are hosted on [Cloud Functions 2nd gen](https://cloud.google.com/functions/docs/concepts/version-comparison), and are triggered via Cloud Storage (GCS). Decoupling the UI and core services via GCS significantly reduces authentication overhead and effectively implements separation of concerns between the frontend and backend layers.

Vigenair uses Gemini on Vertex AI to *holistically* understand and analyse the content and storyline of a Video Ad, **automatically** splitting it into *coherent* audio/video segments that are then used to generate different shorter variants and Ad formats. Vigenair analyses the spoken dialogue in a video (if present), the visually changing shots, on-screen entities such as any identified logos and/or text, and background music and effects. It then uses all of this information to combine sections of the video together that are *coherent*; segments that won't be cut mid-dialogue nor mid-scene, and that are semantically and contextually related to one another. These coherent A/V segments serve as the building blocks for both GenAI- and user-driven recombination.

<center><img src='./img/overview.png' alt='How Vigenair works' /></center>

The generated variants may follow the original Ad's storyline - and thus serve as *mid-funnel reminder campaigns* of the original Ad for **Awareness and/or Consideration** - or introduce whole new storylines altogether, all while following Google's best practices for creatives.

### Architecture

The diagram below shows how Vigenair's components interact and communicate with one another.

<center><img src='./img/architecture.png' alt="Vigenair's architecture" /></center>

1. Users upload or select videos they have previously analysed via the UI (step #2 is skipped for already analysed videos).
2. New uploads into GCS trigger the Extractor Service, which extracts all video information and stores the results on GCS (`input.vtt`, `analysis.json` and `data.json`).
3. The UI continuously queries GCS for updates while showing a preview of the uploaded video.
    * Once the `input.vtt` is available, a transcription track is embedded onto the video preview.
    * Once the `analysis.json` is available, [object tracking](https://cloud.google.com/video-intelligence/docs/object-tracking) results are displayed as bounding boxes directly on the video preview.
    * Once the `data.json` is available, the extracted A/V Segments are displayed along with a set of user controls.
4. Users can generate and iterate on variants via a storyboard preview while modifying controls, adding desired variants to the render queue.
5. Once users are satisfied with the resulting variants, they can render them in their desired formats and settings via the Combiner Service (writing `render.json` to GCS, which serves as the input to the service, and the output is a `combos.json`).
6. The UI continuously queries GCS for updates. Once a `combos.json` is available, the final videos of the variants and all associated assets will be displayed. Users can then approve the final variants they would like to upload into Google Ads / YouTube.

### Rendering Settings

Vigenair supports different rendering settings for the audio of the generated videos. The image below describes the supported options and how they differ:

<center><img src='./img/audio.png' width='640px' alt="Vigenair's audio rendering options" /></center>

## How to Contribute

Beyond the information outlined in our [Contributing Guide](CONTRIBUTING.md), you would need to follow these additional steps to build Vigenair locally and modify the source code:

### Build and Deploy GCP Components

1. Make sure your system has an up-to-date installation of the [gcloud CLI](https://cloud.google.com/sdk/docs/install).
1. Run `gcloud auth login` and complete the authentication flow.
1. Navigate to the directory where the source code lives and run `cd ./service`
1. Run `./deploy.sh`.

### Build and Serve the Angular UI

1. Make sure your system has an up-to-date installation of [Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).
1. Navigate to the directory where the source code lives and run `cd ./ui`
1. Run `npm run deploy` to build, test and deploy (via [clasp](https://github.com/google/clasp)) all UI and Apps Script code to the target spreadsheet / Apps Script project.
1. Run `ng serve` to launch the Angular UI locally with Hot Module Replacement (HMR) during development.
