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

import {
  AvSegment,
  GenerateVariantsResponse,
  GenerationHelper,
} from './generation';
import { PreviewHelper, VideoIntelligence } from './preview';
import { ScriptUtil } from './script-util';
import { StorageManager } from './storage';
import {
  GeneratePreviewsResponse,
  GenerationSettings,
  PreviewSettings,
  RenderQueue,
} from './ui/src/app/api-calls/api-calls.service.interface';

function getEncodedUserId() {
  const encodedUserId = Session.getActiveUser().getEmail()
    ? Utilities.base64Encode(Session.getActiveUser().getEmail())
    : Session.getTemporaryActiveUserKey();

  return encodedUserId;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getRunsFromGcs() {
  return {
    encodedUserId: getEncodedUserId(),
    runs: StorageManager.listObjects(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getFromGcs(filePath: string, mimeType: string): string | null {
  const result = StorageManager.loadFile(filePath) as GoogleAppsScript.Byte[];
  if (!result) {
    return null;
  }
  const dataUrl = `data:${mimeType};base64,${Utilities.base64Encode(result)}`;
  return dataUrl;
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
  const folder = `${gcsFolder}/${Date.now()}-combos`;

  const encodedRenderQueueJson = Utilities.base64Encode(
    JSON.stringify(renderQueue.queue),
    Utilities.Charset.UTF_8
  );
  StorageManager.uploadFile(
    encodedRenderQueueJson,
    folder,
    'render.json',
    'application/json'
  );

  const encodedSquareCropCommands = Utilities.base64Encode(
    PreviewHelper.generateCropCommands(
      renderQueue.squareCropAnalysis,
      renderQueue.sourceDimensions,
      { w: renderQueue.sourceDimensions.h, h: renderQueue.sourceDimensions.h }
    ),
    Utilities.Charset.UTF_8
  );
  StorageManager.uploadFile(
    encodedSquareCropCommands,
    folder,
    'square.txt',
    'text/plain'
  );

  const encodedVerticalCropCommands = Utilities.base64Encode(
    PreviewHelper.generateCropCommands(
      renderQueue.verticalCropAnalysis,
      renderQueue.sourceDimensions,
      {
        w:
          renderQueue.sourceDimensions.h *
          (renderQueue.sourceDimensions.h / renderQueue.sourceDimensions.w),
        h: renderQueue.sourceDimensions.h,
      }
    ),
    Utilities.Charset.UTF_8
  );
  StorageManager.uploadFile(
    encodedVerticalCropCommands,
    folder,
    'vertical.txt',
    'text/plain'
  );

  return folder;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getWebAppUrl(): string {
  return ScriptApp.getService().getUrl();
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
