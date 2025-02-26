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

import { Observable } from 'rxjs';

export type FormatType = 'horizontal' | 'vertical' | 'square';
export type OverlayType =
  | 'variant_start'
  | 'variant_end'
  | 'video_start'
  | 'video_end';
export type AbcdType = 'awareness' | 'consideration' | 'action' | 'shorts';
export type AbcdBusinessObjective = {
  displayName: string;
  value: string;
  promptPart: string;
};
export type AbcdBusinessObjectives = Map<AbcdType, AbcdBusinessObjective>;

export interface GenerationSettings {
  prompt: string;
  evalPrompt: string;
  duration: number;
  demandGenAssets: boolean;
}

export interface AvSegment {
  av_segment_id: number;
  start_s: number;
  end_s: number;
  selected?: boolean;
  played?: boolean;
  segment_screenshot_uri?: string;
}

export interface GenerateVariantsResponse {
  combo_id: number;
  title: string;
  scenes: number[];
  av_segments: AvSegment[];
  description: string;
  score: number;
  reasoning: string;
  duration: string;
  variants?: VariantFormats;
  render_settings?: RenderSettings;
  images?: VariantImageAssets;
  texts?: VariantTextAsset[];
}

export interface PreviousRunsResponse {
  encodedUserId: string;
  runs: string[];
}

export interface PreviousRender {
  value: string;
  displayName: string;
}

export interface RenderSettings {
  generate_image_assets: boolean;
  generate_text_assets: boolean;
  formats: FormatType[];
  use_music_overlay: boolean;
  use_continuous_audio: boolean;
  fade_out: boolean;
  overlay_type?: OverlayType;
}

export interface RenderQueue {
  queue: RenderQueueVariant[];
  queueName: string;
  squareCropAnalysis: any;
  verticalCropAnalysis: any;
  sourceDimensions: { w: number; h: number };
}

export interface RenderQueueVariant {
  original_variant_id: number;
  av_segments: AvSegment[];
  title: string;
  description: string;
  score: number;
  score_reasoning: string;
  render_settings: RenderSettings;
  duration: string;
  userSelection: boolean;
  scenes: string;
}

export interface EntityApproval {
  entity: string;
  approved: boolean;
}

export interface VariantFormats {
  horizontal?: EntityApproval;
  vertical?: EntityApproval;
  square?: EntityApproval;
}

export interface VariantImageAssets {
  horizontal?: EntityApproval[];
  vertical?: EntityApproval[];
  square?: EntityApproval[];
}

export interface VariantTextAsset {
  headline: string;
  description: string;
  approved?: boolean;
  editable?: boolean;
}

export interface RenderedVariant {
  variant_id: number;
  av_segments: Record<string, AvSegment>;
  title: string;
  description: string;
  score: number;
  reasoning: string;
  variants?: VariantFormats;
  duration: string;
  scenes: string;
  render_settings: RenderSettings;
  images?: VariantImageAssets;
  texts?: VariantTextAsset[];
}

export interface GeneratePreviewsResponse {
  square: string;
  vertical: string;
}

export interface PreviewWeights {
  text: number;
  face: number;
  objects: {
    person: number;
  };
}

export interface PreviewSettings {
  sourceDimensions: { w: number; h: number };
  weights: PreviewWeights;
}

export interface ApiCalls {
  uploadVideo(
    file: Blob,
    analyseAudio: boolean,
    encodedUserId: string
  ): Observable<string[]>;
  loadPreviousRun(folder: string): string[];
  deleteGcsFolder(folder: string): void;
  getFromGcs(
    url: string,
    retryDelay?: number,
    maxRetries?: number
  ): Observable<string>;
  generateVariants(
    gcsFolder: string,
    settings: GenerationSettings
  ): Observable<GenerateVariantsResponse[]>;
  generatePreviews(
    gcsFolder: string,
    analysis: any,
    segments: any,
    settings: PreviewSettings
  ): Observable<GeneratePreviewsResponse>;
  getRunsFromGcs(): Observable<PreviousRunsResponse>;
  getRendersFromGcs(gcsFolder: string): Observable<string[]>;
  renderVariants(
    gcsFolder: string,
    renderQueue: RenderQueue
  ): Observable<string>;
  getGcsFolderPath(folder: string): Observable<string>;
  getWebAppUrl(): Observable<string>;
  regenerateTextAsset(
    variantVideoPath: string,
    textAsset: VariantTextAsset,
    textAssetLanguage: string
  ): Observable<VariantTextAsset>;
  storeApprovalStatus(
    gcsFolder: string,
    combos: RenderedVariant[]
  ): Observable<boolean>;
  getVideoLanguage(gcsFolder: string): Observable<string>;
  generateTextAssets(
    variantVideoPath: string,
    textAssetsLanguage: string
  ): Observable<VariantTextAsset[]>;
}
