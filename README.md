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
<img align="left" width="150px" src="https://services.google.com/fh/files/misc/vigenair_logo.png" alt="ViGenAiR Logo" /><br>

# ViGenAiR - Recrafting Video Ads with Generative AI

[![GitHub last commit](https://img.shields.io/github/last-commit/google/vigenair)](https://github.com/google/vigenair/commits)
[![Code Style: Google](https://img.shields.io/badge/code%20style-google-blueviolet.svg)](https://github.com/google/gts)

**Disclaimer: This is not an official Google product.**

[Overview](#overview) •
[Get started](#get-started) •
[What it solves](#why-use-vigenair) •
[How it works](#how-vigenair-works) •
[How to Contribute](#how-to-contribute)

## Updates

Update to the latest version by running `npm run update-app` after pulling the latest changes from the repository via `git pull --rebase --autostash`; you would need to redploy the *UI* for features marked as `frontend`, and *GCP components* for features marked as `backend`.

* [July 2024]
  * `frontend` + `backend`: We now render non-blurred vertical and square formats by dynamically framing the most prominent part of the video. Read more [here](#3-object-tracking-and-smart-framing)
  * `frontend` + `backend`: You can now reorder segments by dragging & dropping them during the variants preview. Read more [here](#42-user-controls-for-video-rendering)
  * `frontend` + `backend`: The UI now supports upload and processing of all video MIME types [supported by Gemini](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/video-understanding#video_requirements).
  * `frontend`: You can now both focus on OR exclude (via a new checkbox) certain topics or elements of the input video during variants generation.
  * `backend`: The Demand Gen text assets generation prompt has been adjusted to better adhere to the ["Punctuation & Symbols" policy](https://support.google.com/adspolicy/answer/14847994).
* [June 2024]
  * `frontend`: Enhanced file upload process to support >20MB files and up to browser-specific limits (~2-4GB).
  * `frontend`: Improved variants generation prompt and enhanced its adherence to user instructions.
  * `backend`: Improved Demand Gen text assets generation prompt. It is recommended to set the `CONFIG_MULTIMODAL_ASSET_GENERATION` environment variable to `'true'` for optimal asset quality.
* [May 2024]: Launch! 🚀

## Overview

**ViGenAiR** *(pronounced vision-air)* uses state-of-the-art multimodal Generative AI on Google Cloud Platform (GCP) to automatically repurpose long-form Video Ads and generate several shorter variants, formats and storylines. It generates horizontal, vertical and square assets to power [Demand Gen](https://support.google.com/google-ads/answer/13695777?hl=en) and [YouTube video campaigns](https://support.google.com/youtube/answer/2375497?hl=en), and leverages Google Ads' built-in A/B testing to automatically identify the best variants tailored to your target audiences. ViGenAiR is an acronym for **Vi**deo **Gen**eration via **A**ds **R**ecrafting, and is more colloquially referred to as *Vigenair*.

## Get Started

Please make sure you have fulfilled all prerequisites mentioned under [Requirements](#requirements) first.

1. Make sure your system has an up-to-date installation of [Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).
1. Make sure your system has an up-to-date installation of the [gcloud CLI](https://cloud.google.com/sdk/docs/install).
1. Make sure your system has an up-to-date installation of `git` and use it to clone this repository.
1. Navigate to the directory where the source code lives.
1. Install [clasp](https://github.com/google/clasp) by running `npm install @google/clasp -g`.
1. Run `npm start`.

You will be asked to enter a GCP Project ID, and whether you would like to deploy GCP components, the UI, or both. If you opt to deploy GCP components, you will be asked to enter an optional [Cloud Function region](https://cloud.google.com/functions/docs/locations) (defaults to `us-central1`) and an optional [GCS location](https://cloud.google.com/storage/docs/locations) (defaults to `us`).
The `npm start` command will then ask you to authenticate to both Google Workspace (via [clasp](https://github.com/google/clasp)) and Google Cloud, followed by creating a bucket named <code>*<gcp_project_id>*-vigenair</code> (if it doesn't already exist), deploying the `vigenair` Cloud Function to your Cloud project, and finally deploying the Angular UI web app to a new Apps Script project. The URL of the web app will be output at the end of the deployment process, which you can use to run the app and start generating videos.

See [How Vigenair Works](#how-vigenair-works) for more details on the different components of the solution.

> Note: If using a completely new GCP project with no prior deployments of Cloud Run / Cloud Functions, you may receive [Eventarc permission denied errors](https://cloud.google.com/eventarc/docs/troubleshooting#trigger-error) when deploying the `vigenair` Cloud Function for the very first time. Please wait a few minutes ([up to seven](https://cloud.google.com/iam/docs/access-change-propagation)) for all necessary permissions to propagate before retrying the `npm start` command.

### UI Web App Access Settings

By default, Vigenair runs only for the user that deployed it. This is controlled by the [Web App access settings](https://developers.google.com/apps-script/manifest/web-app-api-executable#webapp) in the project's [manifest file](./ui/appsscript.json), which is set to `MYSELF` by default. This setup works well for most cases, however if you are a Google Workspace user you may change this value to `DOMAIN` to allow other individuals within your organisation to run the app. The `npm start` command will prompt you for this as well if you opt to deploy the UI.

### Managing Apps Script Deployments

The installation script manages deployments for you; it always creates a new deployment (and archives older versions) whenever you run it, so that the version of the web app you use has the latest changes from this repository. If you would like to manually manage deployments, you may do so by navigating to the [Apps Script home page](https://script.google.com), locating and selecting the `ViGenAiR` project, then managing deployments via the *Deploy* button/drop-down in the top-right corner of the page.

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
* A Cloud Function (2nd gen) named `vigenair` that fulfills both the [Extractor and Combiner services](#solution-details). Refer to [deploy.sh](./service/deploy.sh) for specs.
* An Apps Script deployment for the frontend web app.

If you will also be deploying Vigenair, you need to have the following additional roles on the associated GCP project:

* `Storage Admin` for the entire project OR `Storage Legacy Bucket Writer` on the <code>*<gcp_project_id>*-vigenair</code> bucket. See [IAM Roles for Cloud Storage](https://cloud.google.com/storage/docs/access-control/iam-roles) for more information.
* `Cloud Functions Developer` to deploy and manage Cloud Functions. See [IAM Roles for Cloud Functions](https://cloud.google.com/functions/docs/reference/iam/roles) for more information.
* `Project IAM Admin` to be able to run the commands that set up roles and policy bindings in the deployment script. See [IAM access control](https://cloud.google.com/resource-manager/docs/access-control-proj) for more information.

## Why use Vigenair?

Current Video Ads creative solutions, both within YouTube / Google Ads as well as open source, primarily focus on 4 of the [5 keys to effective advertising](https://info.ncsolutions.com/hubfs/2023%20Five%20Keys%20to%20Advertising%20Effectiveness/NCS_Five_Keys_to_Advertising_Effectiveness_E-Book_08-23.pdf) - Brand, Targeting, Reach and Recency. Those 4 pillars contribute to *only ~50%* of the potential marketing ROI, with the 5th pillar - **Creative** - capturing a *whopping ~50%* all on its own.

<center><img src='./img/creative.png' width='640px' alt='The importance of Creatives for effective adverising' /></center>

Vigenair focuses on the *Creative* pillar to help potentially **unlock ~50% ROI** while solving a huge pain point for most advertisers; the generation of high-quality video assets in different durations and Video Ad formats, powered by Google's multimodal Generative AI - Gemini.

### Benefits

* **Inventory**: Horizontal, vertical and square Video assets in different durations allow advertisers to tap into virtually ALL Google-owned sources of inventory.
* **Campaigns**: Shorter more compelling Video Ads that still capture the meaning and storyline of their original ads - ideal for *Social* and *Awareness/Consideration* campaigns.
* **Creative Excellence**: Coherent Videos (e.g. dialogue doesn't get cut mid-scene, videos don't end abruptly, etc.) that follow Google's [best practices for effective video ads](https://www.youtube.com/ads/abcds-of-effective-video-ads/), including dynamic square and vertical aspect ratio framing,  and (coming soon) creative direction rules for camera angles and scene cutting.
* **User Control**: Users can steer the model towards generating their desired videos (via prompts and/or manual scene selection).
* **Performance**: Built-in A/B testing provides a basis for automatically identifying the best variants tailored to the advertiser's target audiences.

## How Vigenair works

Vigenair's frontend is an Angular Progressive Web App (PWA) hosted on Google Apps Script and accessible via a [web app deployment](https://developers.google.com/apps-script/guides/web). As with all Google Workspace apps, users must authenticate with a Google account in order to use the Vigenair web app. Backend services are hosted on [Cloud Functions 2nd gen](https://cloud.google.com/functions/docs/concepts/version-comparison), and are triggered via Cloud Storage (GCS). Decoupling the UI and core services via GCS significantly reduces authentication overhead and effectively implements separation of concerns between the frontend and backend layers.

Vigenair uses Gemini on Vertex AI to *holistically* understand and analyse the content and storyline of a Video Ad, **automatically** splitting it into *coherent* audio/video segments that are then used to generate different shorter variants and Ad formats. Vigenair analyses the spoken dialogue in a video (if present), the visually changing shots, on-screen entities such as any identified logos and/or text, and background music and effects. It then uses all of this information to combine sections of the video together that are *coherent*; segments that won't be cut mid-dialogue nor mid-scene, and that are semantically and contextually related to one another. These coherent A/V segments serve as the building blocks for both GenAI and user-driven recombination.

<center><img src='./img/overview.png' alt='How Vigenair works' /></center>

The generated variants may follow the original Ad's storyline - and thus serve as *mid-funnel reminder campaigns* of the original Ad for **Awareness and/or Consideration** - or introduce whole new storylines altogether, all while following Google's [best practices for effective video ads](https://www.youtube.com/ads/abcds-of-effective-video-ads/).

### Limitations

* Vigenair will not work *well* for all types of videos. Try it out with an open mind :)
* Users cannot delete previously analysed videos via the UI; they must do this directly in GCS.
* The current audio analysis and understanding tech is unable to differentiate between voice-over and any singing voices in the video. The *Analyse voice-over* checkbox in the UI's *Video selection* card can be used to counteract this; uncheck the checkbox for videos where there is no voice-over, rather just background song and/or effects.
* When generating video variants, segments selected by the LLM might not follow user prompt instructions, and the overall variant might not follow the desired target duration. It is recommended to review and potentially modify the preselected segments of the variant before adding it to the *render queue*.
* When previewing generated video variants, audio overlay settings are not applied; they are only available for fully rendered variants.
* Evaluating video variants' adherence to creative rules and guidelines is done via additional instructions within the generation prompt to Vertex AI foundational models (e.g. `Gemini 1.0 Pro`). To increase adherence and quality, consider [distilling](https://cloud.google.com/vertex-ai/generative-ai/docs/models/distill-text-models) a language model on your brand's own creative best practices, rules and guidelines first, then use this distilled model for the variants generation instead of the foundational model.

### Solution Details

The diagram below shows how Vigenair's components interact and communicate with one another.

<center><img src='./img/architecture.png' alt="Vigenair's architecture" /></center>

#### 1. Video Selection

Users upload or select videos they have previously analysed via the UI's `Video selection` card ([step #2](#2-video-processing-and-extraction) is skipped for already analysed videos).

<center><img src='./img/upload.png' width="600px" alt="Vigenair UI: Upload or select a video" /></center>

* The *Load existing video* dropdown pulls all processed videos from the associated GCS bucket when the page loads, and updates the list whenever users interact with the dropdown.
* The *My videos only* toggle filters the list to only those videos uploaded by the current user - this is particularly relevant for Google Workspace users, where the associated GCP project and GCS bucket are shared among users within the same organisation.
* The *Analyse voice-over* checkbox, which is checked by default, can be used to skip the process of transcribing and analysing any voice-over or speech in the video. **Uncheck** this checkbox for videos where there is only background music / song or effects.
* Uploads get stored in GCS in separate folders following this format: `<input_video_filename>(--n)--<timestamp>--<encoded_user_id>`.
  * `input_video_filename`: The name of the video file as it was stored on the user's file system.
  * Optional `--n` suffix to the filename: For those videos where the *Analyse voice-over* checkbox was **unchecked**.
  * `timestamp`: Current timestamp in **microseconds** (e.g. 1234567890123)
  * `encoded_user_id`: Base64 encoded version of the [user's email](https://developers.google.com/apps-script/reference/base/user#getemail) - if available - otherwise Apps Script's [temp User ID](https://developers.google.com/apps-script/reference/base/session#gettemporaryactiveuserkey).

#### 2. Video Processing and Extraction

New uploads into GCS trigger the Extractor service Cloud Function, which extracts all video information and stores the results on GCS (`input.vtt`, `analysis.json` and `data.json`).

* First, background music and voice-over (if available) are separated via the [spleeter](https://github.com/deezer/spleeter) library, and the voice-over is transcribed.
* Transcription is done via the [faster-whisper](https://github.com/SYSTRAN/faster-whisper) library, which uses OpenAI's Whisper model under the hood. By default, Vigenair uses the [small](https://github.com/openai/whisper#available-models-and-languages) multilingual model which provides the optimal quality-performance balance. If you find that it is not working well for your target language you may change the model used by the Cloud Function by setting the `CONFIG_WHISPER_MODEL` variable in the [update_config.sh](service/update_config.sh) script, which can be used to update the function's runtime variables. The transcription output is stored in an `input.vtt` file, along with a `language.txt` file containing the video's primary language, in the same folder as the input video.
* Video analysis is done via the Cloud [Video AI API](https://cloud.google.com/video-intelligence), where visual shots, detected objects - with tracking, labels, people and faces, and recognised logos and any on-screen text within the input video are extracted. The output is stored in an `analysis.json` file in the same folder as the input video.
* Finally, *coherent* audio/video segments are created using the transcription and video intelligence outputs and then cut into individual video files and stored on GCS in an `av_segments_cuts` subfolder under the root video folder. These cuts are then annotated via multimodal models on Vertex AI, which provide a description and a set of associated keywords / topics per segment. The fully annotated segments (including all information from the Video AI API) are then compiled into a `data.json` file that is stored in the same folder as the input video.

#### 3. Object Tracking and Smart Framing

The UI continuously queries GCS for updates while showing a preview of the uploaded video.

<center><img src='./img/preview-waiting.png' width="600px" alt="Vigenair UI: Video preview while waiting for analysis results" /></center>

* Once the `input.vtt` is available, a transcription track is embedded onto the video preview.
* Once the `analysis.json` is available, [object tracking](https://cloud.google.com/video-intelligence/docs/object-tracking) results are displayed as bounding boxes directly on the video preview. These can be toggled on/off via the first button in the top-left toggle group - which is set to *on* by default.
* Vertical and square format previews are also generated, and can be displayed via the second and third buttons of the toggle group, respectively. The previews are generated by dynamically moving the vertical/square crop area to capture the most prominent element in each frame.

  <center><img src='./img/preview-format.png' width="600px" alt="Vigenair UI: Video square format preview" /></center>

* Smart framing is controlled via weights that can be modified via the fourth button of the toggle group to increase or decrease the prominence score of each element, and therefore skew the crop area towards it. You can regenerate the crop area previews via the button in the settings dialog as shown below.

  <center><img src='./img/preview-format-settings.png' width="600px" alt="Vigenair UI: Video format preview settings" /></center>

* Once the `data.json` is available, the extracted A/V Segments are displayed along with a set of user controls.

#### 4.1. Variants Generation

Users are now ready for combination. They can view the A/V segments and generate / iterate on variants via a *preview* while modifying user controls, adding desired variants to the render queue.

* A/V segments are displayed in two ways:
  * In the *video preview* view: A single frame of each segment, cut mid-segment, is displayed in a filmstrip and scrolls into view while the user is previewing the video, indicating the segment that is *currently playing*. Clicking on a segment will also automatically seek to it in the video preview.

    <center><img src='./img/preview-complete.png' width="600px" alt="Vigenair UI: Segments in preview" /></center>

  * A detailed *segments list* view: Which shows additional information per segment; the segment's duration, description and extracted keywords.

    <center><img src='./img/segments.png' width="600px" alt="Vigenair UI: Segments list" /></center>

* User Controls for video variant generation:
  * Users are presented with an optional prompt which they can use to steer the output towards focusing on - or excluding, via the *Exclude from video variants* checkbox - certain aspects, like certain entities or topics in the input video, or target audience of the resulting video variant.
  * Users may also use the *Target duration* slider to set their desired target duration.
  * Users can then click `Generate` to generate variants accordingly, which will query language models on Vertex AI with a detailed script of the video to generate potential variants that fulfill the optional user-provided prompt and target duration.
* Generated variants are displayed in tabs - one per tab - and both the *video preview* and *segments list* views are updated to preselect the A/V segments of the variant currently being viewed. Clicking on the video's play button in the *video preview* mode will preview only those preselected segments.

  <center><img src='./img/variants.png' width="600px" alt="Vigenair UI: Variants preview" /></center>
  <br />

  Each variant has the following information:
  * A title which is displayed in the variant's tab.
  * A duration, which is also displayed in the variant's tab.
  * The list of A/V segments that make up the variant.
  * A description of the variant and what is happening in it.
  * An LLM-generated Score, from 1-5, representing how well the variant adheres to the input rules and guidelines, which default to a subset of [YouTubes ABCDs](https://www.youtube.com/ads/abcds-of-effective-video-ads/). Users are strongly encouraged to update this section of the generation prompt in [config.ts](ui/src/config.ts) to refer to their own brand voice and creative guidelines.
  * Reasoning for the provided score, with examples of adherence / inadherence.

#### 4.2. User Controls for Video Rendering

<center><img src='./img/render-settings.png' width="600px"  alt="Vigenair UI: Variants render settings" /></center>

* Vigenair supports different rendering settings for the audio of the generated videos. The image below describes the supported options and how they differ:

  <center><img src='./img/audio.png' width="350px" alt="Vigenair's audio rendering options" /></center>
* Whether to generate [Demand Gen](https://support.google.com/google-ads/answer/13695777) campaign text and image assets alongside the variant or not. Defaults to generating Demand Gen assets using *language* models on Vertex AI, following the same approach used to generate the variants themselves; a detailed video script of the variant. To increase the quality of the generated assets, you may update the runtime configuration of the Combiner Cloud Function via the [update_config.sh](service/update_config.sh) to use *multimodal* models instead by setting the `CONFIG_MULTIMODAL_ASSET_GENERATION` variable to `'true'`. Note that using multimodal models incurs higher costs.
* Whether to render all formats (horizontal, vertical and square) assets or to only render horizontal assets. Defaults to rendering all formats.
* Users can also select the individual segments that each variant is comprised of. This selection is available in both the *video preview* and *segments list* views. Please note that switching between variant tabs will clear any changes to the selection.
* Users may also change the order of segments via the *Reorder segments* toggle, allowing the preview and rendering of more advanced and customised variations. Please note that reodering segments will reset the variant playback, and switching the toggle *off* will restore the original order.

  <center><img src='./img/reorder-segments.gif' alt="Vigenair's segment reordering feature" /></center>

#### 4.3. Render Queue

Desired variants can be added to the render queue along with the their associated render settings:

<center><img src='./img/render-queue.png' width="600px" alt="Vigenair UI: Variants in the render queue" /></center>

* Each variant added to the render queue will be presented as a card in a sidebar that will open from the right-hand-side of the page. The card contains the thumbnail of the variant's first segment, along with the variant title, list of segments contained within it, its duration and chosen render settings (audio settings, Demand Gen assets choice and desired formats).
* Variants where the user had manually modified the preselected segments will be displayed with the score greyed out and with the suffix `(modified)` appended to the variant's title.
* Users cannot add the same variant with the *exact same segment selection and rendering settings* more than once to the render queue.
* Users can always remove variants from the render queue which they no longer desire via the dedicated button per card.
* Clicking on a variant in the render queue will *load* its settings into the *video preview* and *segments list* views, allowing users to preview the variant once more.

#### 5. Rendering

Clicking on the `Render` button inside the render queue will render the variants in their desired formats and settings via the Combiner service Cloud Function (writing `render.json` to GCS, which serves as the input to the service, and the output is a `combos.json` file. Both files, along with the *rendered* variants, are stored in a `<timestamp>-combos` subfolder below the root video folder).

<center><img src='./img/rendering.png' width="600px" alt="Vigenair UI: Rendering videos" /></center>

#### 6. Output Videos

The UI continuously queries GCS for updates. Once a `combos.json` is available, the final videos - in their different formats and along with all associated assets - will be displayed. Users can preview the final videos and select the ones they would like to upload into Google Ads / YouTube.

<center><img src='./img/rendered.png' width="600px" alt="Vigenair UI: Rendered videos display" /></center>

### Pricing and Quotas

Users are priced according to their usage of Google (Cloud and Workspace) services as detailed below. In summary, Processing *1 min of video and generating 5 variants* would cost around **$7 with `Gemini 1.0 Pro Vision`, $5.5 with `Gemini 1.5 Pro`, and $3.3 with `Gemini 1.5 Flash`**. You may define the multimodal and language models used by Vigenair by modifying the `CONFIG_VISION_MODEL` and `CONFIG_TEXT_MODEL` environment variables respectively for the Cloud Function in [deploy.sh](./service/deploy.sh), as well as the `CONFIG.vertexAi.model` property in [config.ts](ui/src/config.ts) for the frontend web app. The most cost-effective setup is using `Gemini 1.5 Flash` throughout (for both multimodal and text-only use cases), also considering [quota limits](https://cloud.google.com/vertex-ai/generative-ai/docs/quotas#quotas_by_region_and_model) per model.

For more information, refer to this detailed [Cloud pricing calculator](https://cloud.google.com/products/calculator/?dl=CiRjNjc2YTkzMC1hOWE1LTRlNjAtYTgwZS0zNTg5OWY0NzYxNGIQEhokRjU1OTJDMUUtNURBRS00QkUwLTgzNUQtMjFFOUQ5RTc1QjU1) example using `Gemini 1.0 Pro Vision`. The breakdown of the charges are:

* Apps Script (where the UI is hosted): **Free of charge**. Apps Script services have [daily quotas](https://developers.google.com/apps-script/guides/services/quotas) and the one for *URL Fetch calls* is relevant for Vigenair. Assuming a rule of thumb of *100 URL Fetch* calls per video, you would be able to process **200 videos per day** as a standard user, and **1000 videos per day** as a Workspace user.
* Cloud Storage: The storage of input and generated videos, along with intermediate media files (voice-over, background music, segment thumbnails, different JSON files for the UI, etc.). Pricing varies depending on region and duration, and you can assume a rule of thumb of **100MB per 1 min of video**, which would fall within the Cloud **free** tier. Refer to the full [pricing guide](https://cloud.google.com/storage/pricing) for more information.
* Cloud Functions (which includes Cloud Build, Eventarc and Aritfact Registry): The processing, or *up*, time only; idle-time won't be billed, unless [minimum instances](https://cloud.google.com/functions/docs/configuring/min-instances) are configured. Weigh the impact of [cold starts](https://cloud.google.com/functions/docs/concepts/execution-environment#cold-starts) vs. potential cost and decide whether to set `min-instances=1` in [deploy.sh](./service/deploy.sh) accordingly. Vigenair's cloud function is triggered for *any* file upload into the GCS bucket, and so you can assume a threshold of **max 100 invocations and 5 min of processing time per 1 min of video**, which would cost around **$1**. Refer to the full [pricing guide](https://cloud.google.com/functions/pricing) for more information.
* Vertex AI generative models:
  * Text: `Gemini 1.5 Flash` is queried with the entire [generation prompt](ui/src/config.ts), which includes a script of the video covering all its segments and potentially a user-defined section. The output is a list containing one or more variants with all their information. This process is repeated in case of errors, and users can generate variants as often as they want. Assuming an average of **15 requests per video** - continuing with the assumption that the video is 1 min long - you would be charged around **$2** (`Gemini 1.5 Pro` would cost the same).
  * Multimodal (example using `Gemini 1.0 Pro Vision`. Note that `Gemini 1.5 Pro` is *1.5* times cheaper, and `Gemini 1.5 Flash` is *15* times cheaper): The multimodal model is used to annotate every segment extracted from the video, and so the pricing varies significantly depending on the number and length of the extracted segments, which in turn vary heavily according to the content of the video; a 1 min video may produce 10 segments while another may produce 20. Assuming a threshold of **max 25 segments, avg. 2.5s each, per 1 min of video**, you would be charged around **$4** (**$2.5** for `Gemini 1.5 Pro` and **$0.3** for `Gemini 1.5 Flash`).

## How to Contribute

Beyond the information outlined in our [Contributing Guide](CONTRIBUTING.md), you would need to follow these additional steps to build Vigenair locally and modify the source code:

### Build and Deploy GCP Components

1. Make sure your system has an up-to-date installation of the [gcloud CLI](https://cloud.google.com/sdk/docs/install).
1. Run `gcloud auth login` and complete the authentication flow.
1. Navigate to the directory where the source code lives and run `cd service`
1. Run `./deploy.sh`.

### Build and Serve the Angular UI

1. Make sure your system has an up-to-date installation of [Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).
1. Install [clasp](https://github.com/google/clasp) by running `npm install @google/clasp -g`.
1. Navigate to the directory where the source code lives and run `cd ui`
1. Run `npm install` to install dependencies.
1. Run `npm run deploy` to build, test and deploy (via [clasp](https://github.com/google/clasp)) all UI and Apps Script code to the target spreadsheet / Apps Script project.
1. Navigate to the directory where the Angular UI lives: `cd src/ui`
1. Run `ng serve` to launch the Angular UI locally with Hot Module Replacement (HMR) during development.
