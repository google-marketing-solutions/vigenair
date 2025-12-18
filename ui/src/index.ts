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

interface VideoFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  time: number;
}

interface VideoObject {
  name: string;
  start: number;
  end: number;
  frames: VideoFrame[];
}

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
  const createPreview = (targetW: number, targetH: number) =>
    JSON.stringify(
      PreviewHelper.createPreview(
        segments,
        analysis,
        sourceDimensions,
        { w: targetW, h: targetH },
        settings.weights
      )
    );

  // Calculate dimensions based on source height to maintain resolution
  const h = sourceDimensions.h;

  const squarePreview = PreviewHelper.createPreview(
    segments,
    analysis,
    sourceDimensions,
    { w: h, h },
    settings.weights
  );
  const verticalPreview = PreviewHelper.createPreview(
    segments,
    analysis,
    sourceDimensions,
    { w: h * (9 / 16), h },
    settings.weights
  );

  return {
    square: JSON.stringify(squarePreview), // Legacy support
    vertical: JSON.stringify(verticalPreview), // Legacy support
    '1:1': createPreview(h, h),
    '9:16': createPreview(h * (9 / 16), h),
    '16:9': createPreview(h * (16 / 9), h),
    '3:4': createPreview(h * (3 / 4), h),
    '4:3': createPreview(h * (4 / 3), h),
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function renderVariants(gcsFolder: string, renderQueue: RenderQueue): string {
  const queueNamePrefix = renderQueue.queueName
    ? `${renderQueue.queueName}${CONFIG.videoFolderNameSeparator}`
    : '';
  const folder = `${gcsFolder}/${queueNamePrefix}${Date.now()}-combos`;

  const formatMapping: Record<string, string> = {
    '1:1': 'square',
    '9:16': 'vertical',
    '16:9': 'horizontal',
    '3:4': '3_4',
    '4:3': '4_3',
  };

  if (renderQueue.previewAnalyses) {
    for (const [format, analysis] of Object.entries(
      renderQueue.previewAnalyses
    )) {
      const [wRatio, hRatio] = format.split(':').map(Number);
      const targetH = renderQueue.sourceDimensions.h;
      const targetW = targetH * (wRatio / hRatio);

      const encodedCropCommands = Utilities.base64Encode(
        PreviewHelper.generateCropCommands(
          analysis as unknown as [VideoObject],
          { w: targetW, h: targetH },
          CONFIG.defaultVideoHeight // Assuming preview was scaled to default height
        ),
        Utilities.Charset.UTF_8
      );
      StorageManager.uploadFile(
        encodedCropCommands,
        folder,
        `crop_${formatMapping[format] || format}.txt`,
        'text/plain'
      );
    }
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
function updateTranscription(
  gcsFolder: string,
  transcriptionText: string
): boolean {
  try {
    // Parse the VTT text into structured data
    const transcriptionData = parseVttText(transcriptionText);

    // Save the transcription as VTT file
    const encodedVtt = Utilities.base64Encode(
      transcriptionText,
      Utilities.Charset.UTF_8
    );
    StorageManager.uploadFile(
      encodedVtt,
      gcsFolder,
      'input.vtt',
      'text/vtt'
    );

    // Update data.json with new transcription
    updateDataJsonWithTranscription(gcsFolder, transcriptionData);

    return true;
  } catch (error) {
    console.error('Error updating transcription:', error);
    return false;
  }
}

interface VttSegment {
  start: number;
  end: number;
  text: string;
}

function parseVttText(vttText: string): VttSegment[] {
  const segments: VttSegment[] = [];
  const lines = vttText.split('\n');

  let i = 0;
  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for timestamp line
    const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (timestampMatch) {
      const startTime = parseVttTimestamp(timestampMatch[1]);
      const endTime = parseVttTimestamp(timestampMatch[2]);

      // Collect text lines until empty line or next timestamp
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
        textLines.push(lines[i].trim());
        i++;
      }

      if (textLines.length > 0) {
        segments.push({
          start: startTime,
          end: endTime,
          text: textLines.join(' ')
        });
      }
    }
    i++;
  }

  return segments;
}

function parseVttTimestamp(timestamp: string): number {
  const parts = timestamp.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const secondsParts = parts[2].split('.');
  const seconds = Number(secondsParts[0]);
  const ms = Number(secondsParts[1]);

  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

function updateDataJsonWithTranscription(gcsFolder: string, transcriptionData: VttSegment[]) {
  // Load existing data.json
  const dataJson = StorageManager.loadFile(`${gcsFolder}/data.json`, true) as string;
  if (!dataJson) {
    throw new Error('data.json not found');
  }

  const avSegments = JSON.parse(dataJson);

  // Update transcript field in each av_segment
  for (const avSegment of avSegments) {
    const segmentStart = avSegment.start_s;
    const segmentEnd = avSegment.end_s;

    // Find all transcription segments that overlap with this av_segment
    const overlappingTranscripts = transcriptionData.filter(
      (t: VttSegment) => t.start < segmentEnd && t.end > segmentStart
    );

    // Combine the text from overlapping segments
    avSegment.transcript = overlappingTranscripts.map((t: VttSegment) => t.text);
  }

  // Save updated data.json
  const encodedJson = Utilities.base64Encode(
    JSON.stringify(avSegments),
    Utilities.Charset.UTF_8
  );
  StorageManager.uploadFile(
    encodedJson,
    gcsFolder,
    'data.json',
    'application/json'
  );
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
