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
export interface GenerationSettings {
  prompt: string;
  duration: number;
  demandGenAssets: boolean;
}

export interface AvSegment {
  av_segment_id: number;
  start_s: number;
  end_s: number;
  selected?: boolean;
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
}

export interface PreviousRunsResponse {
  encodedUserId: string;
  runs: string[];
}

export interface RenderSettings {
  generate_image_assets: boolean;
  generate_text_assets: boolean;
  render_all_formats: boolean;
  use_music_overlay: boolean;
  use_continuous_audio: boolean;
}

export interface RenderQueueVariant {
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

export interface SelectedSegmentEventParams {
  segmentId: number;
  selected: boolean;
}

export interface ApiCalls {
  uploadVideo(file: Blob, analyseAudio: boolean): Observable<string>;
  deleteGcsFolder(folder: string): void;
  getFromGcs(
    url: string,
    mimeType: string,
    retryDelay?: number,
    maxRetries?: number
  ): Observable<string>;
  generateVariants(
    gcsFolder: string,
    settings: GenerationSettings
  ): Observable<GenerateVariantsResponse[]>;
  getRunsFromGcs(): Observable<PreviousRunsResponse>;
  renderVariants(
    gcsFolder: string,
    renderQueue: RenderQueueVariant[]
  ): Observable<void>;
}
