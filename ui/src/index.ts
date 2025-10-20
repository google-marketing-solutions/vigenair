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

/**
 * Methods in this file are referenced in ./ui/src/app/api-calls/*.
 * Do not rename without ensuring all references are updated.
 */

import { CONFIG } from './config';
import {
  AvSegment,
  GenerateVariantsResponse,
  GenerationHelper,
} from './generation';
import { PreviewHelper, VideoIntelligence } from './preview';
import { ScriptUtil } from './script-util';
import { StorageManager } from './storage';
import { StringUtil } from './string-util';
import {
  GeneratePreviewsResponse,
  GenerationSettings,
  PreviewSettings,
  RenderedVariant,
  RenderQueue,
  SegmentMarker,
  VariantTextAsset,
} from './ui/src/app/api-calls/api-calls.service.interface';

function getEncodedUserId() {
  const encodedUserId = Session.getActiveUser().getEmail()
    ? Utilities.base64Encode(Session.getActiveUser().getEmail())
    : Session.getTemporaryActiveUserKey();

  return StringUtil.gcsSanitise(encodedUserId);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getRunsFromGcs() {
  return {
    encodedUserId: getEncodedUserId(),
    runs: StorageManager.listObjects(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getRendersFromGcs(gcsFolder: string) {
  const combosFolders = StorageManager.listObjects('/', `${gcsFolder}/`).filter(
    folderName => folderName.endsWith('-combos')
  );
  return combosFolders;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getUserAuthToken() {
  return ScriptUtil.getOAuthToken();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function deleteGcsFolder(folder: string) {
  StorageManager.deleteFolder(folder);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateVariants(
  gcsFolder: string,
  settings: GenerationSettings
): GenerateVariantsResponse[] {
  return GenerationHelper.generateVariants(gcsFolder, settings);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generatePreviews(
  analysis: VideoIntelligence,
  segments: AvSegment[],
  settings: PreviewSettings
): GeneratePreviewsResponse {
  const sourceDimensions = settings.sourceDimensions;
  const squarePreview = PreviewHelper.createPreview(
    segments,
    analysis,
    sourceDimensions,
    { w: sourceDimensions.h, h: sourceDimensions.h },
    settings.weights
  );
  const verticalPreview = PreviewHelper.createPreview(
    segments,
    analysis,
    sourceDimensions,
    {
      w: sourceDimensions.h * (sourceDimensions.h / sourceDimensions.w),
      h: sourceDimensions.h,
    },
    settings.weights
  );
  return {
    square: JSON.stringify(squarePreview),
    vertical: JSON.stringify(verticalPreview),
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function renderVariants(gcsFolder: string, renderQueue: RenderQueue): string {
  const queueNamePrefix = renderQueue.queueName
    ? `${renderQueue.queueName}${CONFIG.videoFolderNameSeparator}`
    : '';
  const folder = `${gcsFolder}/${queueNamePrefix}${Date.now()}-combos`;

  if (renderQueue.squareCropAnalysis) {
    const encodedSquareCropCommands = Utilities.base64Encode(
      PreviewHelper.generateCropCommands(
        renderQueue.squareCropAnalysis,
        {
          w: renderQueue.sourceDimensions.h,
          h: renderQueue.sourceDimensions.h,
        },
        CONFIG.defaultVideoHeight
      ),
      Utilities.Charset.UTF_8
    );
    StorageManager.uploadFile(
      encodedSquareCropCommands,
      folder,
      CONFIG.cloudStorage.files.formats.square,
      'text/plain'
    );
  }

  if (renderQueue.verticalCropAnalysis) {
    const encodedVerticalCropCommands = Utilities.base64Encode(
      PreviewHelper.generateCropCommands(
        renderQueue.verticalCropAnalysis,
        {
          w:
            renderQueue.sourceDimensions.h *
            (renderQueue.sourceDimensions.h / renderQueue.sourceDimensions.w),
          h: renderQueue.sourceDimensions.h,
        },
        CONFIG.defaultVideoHeight *
          (CONFIG.defaultVideoHeight / CONFIG.defaultVideoWidth)
      ),
      Utilities.Charset.UTF_8
    );
    StorageManager.uploadFile(
      encodedVerticalCropCommands,
      folder,
      CONFIG.cloudStorage.files.formats.vertical,
      'text/plain'
    );
  }

  const encodedRenderQueueJson = Utilities.base64Encode(
    JSON.stringify(renderQueue.queue),
    Utilities.Charset.UTF_8
  );
  StorageManager.uploadFile(
    encodedRenderQueueJson,
    folder,
    CONFIG.cloudStorage.files.render,
    'application/json'
  );

  return folder;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getWebAppUrl(): string {
  return ScriptApp.getService().getUrl();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function regenerateTextAsset(
  variantVideoPath: string,
  textAsset: VariantTextAsset,
  textAssetLanguage: string
): VariantTextAsset {
  return GenerationHelper.generateTextAsset(
    variantVideoPath,
    textAsset,
    textAssetLanguage
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateTextAssets(
  variantVideoPath: string,
  textAssetsLanguage: string
): VariantTextAsset[] {
  return GenerationHelper.generateTextAssets(
    variantVideoPath,
    textAssetsLanguage
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function storeApprovalStatus(
  gcsFolder: string,
  combos: RenderedVariant[]
): boolean {
  const encodedJson = Utilities.base64Encode(
    JSON.stringify(combos),
    Utilities.Charset.UTF_8
  );
  StorageManager.uploadFile(
    encodedJson,
    gcsFolder,
    CONFIG.cloudStorage.files.approval,
    'application/json'
  );
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getVideoLanguage(gcsFolder: string) {
  return GenerationHelper.getVideoLanguage(gcsFolder);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function splitSegment(
  gcsFolder: string,
  segmentMarkers: SegmentMarker[]
): string {
  const encodedJson = Utilities.base64Encode(
    JSON.stringify(segmentMarkers),
    Utilities.Charset.UTF_8
  );
  StorageManager.renameFile(
    `${gcsFolder}/${CONFIG.cloudStorage.files.data}`,
    `${gcsFolder}/${CONFIG.cloudStorage.files.presplit}`
  );
  StorageManager.uploadFile(
    encodedJson,
    gcsFolder,
    `${Date.now()}${CONFIG.cloudStorage.files.split}`,
    'application/json'
  );
  return String(segmentMarkers[0].av_segment_id);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function doGet(e: GoogleAppsScript.Events.DoGet) {
  const output = HtmlService.createTemplateFromFile('ui')
    .evaluate()
    .setTitle('ViGenAiR - Recrafting Video Ads with Generative AI')
    .setFaviconUrl(
      'https://services.google.com/fh/files/misc/vigenair_logo.png'
    );
  if (e && e.parameter && e.parameter['inputCombosFolder']) {
    output.append(
      `<input id="input-combos-folder" type="hidden" value="${e.parameter['inputCombosFolder']}">`
    );
  }
  return output;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function include(filename: string) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
