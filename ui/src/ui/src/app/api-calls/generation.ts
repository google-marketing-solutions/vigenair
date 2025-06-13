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

import { CONFIG } from '../../../../config';
import { AppLogger } from '../../../../logging';
import { TimeUtil } from '../../../../time-util';
import {
  GenerationSettings,
  VariantTextAsset,
} from './api-calls.service.interface';
import { VertexHelper } from './vertex';
import { StorageManager } from './storage';
import { Injectable } from '@angular/core';
import { forkJoin, Observable, of, switchMap, throwError, catchError } from 'rxjs';


const GENERATE_TEXT_ASSETS_REGEX =
  /.*Headline\s?:\**(?<headline>.*)\n+\**Description\s?:\**(?<description>.*)/ims;

export interface AvSegment {
  av_segment_id: string;
  description: string;
  visual_segment_ids: number[];
  audio_segment_ids: number[];
  start_s: number;
  end_s: number;
  duration_s: number;
  transcript: string[];
  labels: string[];
  objects: string[];
  text: string[];
  logos: string[];
  details: string[];
  keywords: string;
}

export interface GenerateVariantsResponse {
  combo_id: number;
  title: string;
  scenes: string[];
  av_segments: AvSegment[];
  description: string;
  score: number;
  reasoning: string;
  duration: string;
}

@Injectable({
  providedIn: 'root',
})
export class GenerationHelper {
  constructor(
    private storageManager: StorageManager,
    private vertexHelper: VertexHelper
  ) {}

  static calculateExpectedDurationRange(duration: number): string {
    const durationFraction = 20 / 100;
    const expectedDurationRange = `${duration - duration * durationFraction}-${duration + duration * durationFraction}`;

    return expectedDurationRange;
  }

  static calculateVariantDuration(
    scenes: string[],
    avSegmentsMap: Record<string, AvSegment>
  ): string {
    let duration = 0;

    for (const scene of scenes) {
      const avSegment = avSegmentsMap[scene];
      if (avSegment) {
        duration += avSegment.end_s - avSegment.start_s;
      }
    }
    return TimeUtil.secondsToTimeString(duration);
  }

  generateTextAsset(
    variantVideoPath: string,
    textAsset: VariantTextAsset,
    textAssetLanguage: string
  ): Observable<VariantTextAsset> {
    const generationPrompt = CONFIG.vertexAi.textAssetsGenerationPrompt
      .replace('{{videoLanguage}}', textAssetLanguage)
      .replace('{{desiredCount}}', '1')
      .replace('3. ', '4. ')
      .replace(
        '{{badExamplePromptPart}}',
        CONFIG.vertexAi.textAssetsBadExamplePromptPart
      )
      .replace('{{headline}}', textAsset.headline)
      .replace('{{description}}', textAsset.description);

    return this.vertexHelper.generate(
      generationPrompt,
      `gs:/${decodeURIComponent(variantVideoPath)}`
    ).pipe(
      switchMap( response => {
        AppLogger.info(`GenerateTextAsset Response: ${response}`);
        const result = response.split('## Ad').filter(Boolean)[0];
        const matches = result.match(GENERATE_TEXT_ASSETS_REGEX);
        if (matches) {
          const { headline, description } = matches.groups as {
            headline: string;
            description: string;
          };
          return of({
            headline: String(headline).trim(),
            description: String(description).trim(),
          });
        } else {
          const message = `WARNING - Received an incomplete response from the API!\nResponse: ${response}`;
          AppLogger.warn(message);
          throw new Error(message);
        }
      }
    ));

  }

  resolveGenerationPrompt(
    gcsFolder: string,
    settings: GenerationSettings
  ): Observable<string> {
    const duration = settings.duration;
    return forkJoin({
      videoLanguage: this.getVideoLanguage(gcsFolder),
      videoScript: this.createVideoScript(
        gcsFolder,
        settings.duration
      )
    }).pipe(
      switchMap(({videoLanguage, videoScript}) => {
        const expectedDurationRange =
      GenerationHelper.calculateExpectedDurationRange(duration);
      const generationPrompt = CONFIG.vertexAi.generationPrompt
      .replace('{{{{userPrompt}}}}', settings.prompt)
      .replace('{{{{generationEvalPromptPart}}}}', settings.evalPrompt)
      .replace('{{{{desiredDuration}}}}', String(duration))
      .replace('{{{{expectedDurationRange}}}}', expectedDurationRange)
      .replace('{{{{videoLanguage}}}}', videoLanguage)
      .replace('{{{{videoScript}}}}', videoScript);
      return of(generationPrompt);
      })
    )
  }

  getVideoLanguage(gcsFolder: string): Observable<string> {
    return (
      (this.storageManager.loadTextFile(`${gcsFolder}/language.txt`)) ||
      of(CONFIG.defaultVideoLanguage)
    );
  }

  getAvSegments(gcsFolder: string): Observable<AvSegment[]> {
    const key = `${gcsFolder}/data.json`;
    const url = StorageManager.getFileUrl(key);
    return this.storageManager.loadJsonFile(url).pipe(
      switchMap( (avSegments) => {
        return [avSegments.map((avSegment: AvSegment) => {
          if (typeof avSegment.av_segment_id === 'number') {
            avSegment.av_segment_id = String(avSegment.av_segment_id + 1);
          }
          if (avSegment.av_segment_id.endsWith('.0')) {
            avSegment.av_segment_id = avSegment.av_segment_id.replace('.0', '');
          }
          return avSegment;
        })];
      })
     );      
  }

  createVideoScript(gcsFolder: string, duration: number): Observable<string> {
    return this.getAvSegments(gcsFolder).pipe(
      switchMap( (avSegments: AvSegment[]) => {
        const videoScript: string[] = [];
        avSegments.forEach(avSegment => {
          if (avSegment.duration_s <= duration) {
            videoScript.push(`Scene ${avSegment.av_segment_id}`);
            videoScript.push(`${avSegment.start_s} --> ${avSegment.end_s}`);
            videoScript.push(
              `Duration: ${(avSegment.end_s - avSegment.start_s).toFixed(2)}s`
            );
            const description = avSegment.description;
            if (description) {
              videoScript.push(`Description: ${description.trim()}`);
            }
            videoScript.push(
              `Number of visual shots: ${avSegment.visual_segment_ids.length}`
            );
            const transcript = avSegment.transcript;
            const details = avSegment.labels.concat(avSegment.objects);
            const text = avSegment.text.map((t: string) => `"${t}"`);
            const logos = avSegment.logos;
            const keywords = avSegment.keywords;
    
            if (transcript) {
              videoScript.push(`Off-screen speech: "${transcript.join(' ')}"`);
            }
            if (details) {
              videoScript.push(`On-screen details: ${details.join(', ')}`);
            }
            if (text) {
              videoScript.push(`On-screen text: ${text.join(', ')}`);
            }
            if (logos) {
              videoScript.push(`Logos: ${logos.join(', ')}`);
            }
            if (keywords) {
              videoScript.push(`Keywords: ${keywords.trim()}`);
            }
            videoScript.push('');
          }
        });
        return videoScript.join('\n');
      })
    );
  }





  generateVariants(gcsFolder: string, settings: GenerationSettings): Observable<GenerateVariantsResponse[]> {
    return forkJoin({
      prompt: this.resolveGenerationPrompt(
        gcsFolder,
        settings
      ),
      avSegments: this.getAvSegments(gcsFolder)
     
    }).pipe(
      switchMap(({prompt, avSegments}) => {
        const avSegmentsMap = avSegments.reduce(
          (segments, segment) => ({
            ...segments,
            [segment.av_segment_id]: segment,
          }),
          {} as Record<string, AvSegment>
        );
        const allScenes = Object.keys(avSegmentsMap).join(', ');
        return this._generateVariantsRecursive(prompt, avSegments, avSegmentsMap, allScenes, settings, 1);
      })
    );
  }

  private _generateVariantsRecursive(
    prompt: string,
    avSegments: AvSegment[],
    avSegmentsMap: Record<string, AvSegment>,
    allScenes: string,
    settings: GenerationSettings,
    iteration: number
  ): Observable<GenerateVariantsResponse[]> {
    const MAX_RECURSIVE_CALLS = 10; // Define a max retry limit

    if (iteration > MAX_RECURSIVE_CALLS) {
      const errorMessage = `Max retries (${MAX_RECURSIVE_CALLS}) reached for generating variants. Prompt: ${prompt}`;
      AppLogger.error(errorMessage);
      return throwError(() => new Error(errorMessage));
    }

    return this.vertexHelper.generate(prompt).pipe(
      switchMap(response => { // response is a string
        AppLogger.info(`GenerateVariants Response #${iteration}: ${response}`);
        const variants: GenerateVariantsResponse[] = [];
        const results = response.split('## Combination').filter(Boolean);
        const regex =
          /.*Title\s?:\**(?<title>.*)\n+\**Scenes\s?:\**(?<scenes>.*)\n+\**Reasoning\s?:\**(?<description>.*)\n+\**Score\s?:\**(?<score>.*)\n+\**Duration\s?:\**(?<duration>.*)\n+\**ABCD\s?:\**\n+(?<reasoning>[\w\W\s\S\d\D]*)/ims;

        results.forEach((result, index) => {
          const matches = result.match(regex);
          if (matches && matches.groups) {
            const { title, scenes, description, score, reasoning } =
              matches.groups as {
                title: string;
                scenes: string;
                description: string;
                score: string;
                duration: string; // from regex, used in calculateVariantDuration
                reasoning: string;
              };
            const trimmedScenes = String(scenes)
              .trim()
              .split(', ')
              .filter(Boolean)
              .map(scene =>
                scene.toLowerCase().replace('scene ', '').replace('.0', '')
              )
              .join(', ');

            if (trimmedScenes !== allScenes) {
              const outputScenes = trimmedScenes.split(', ').filter(Boolean);
              const variant: GenerateVariantsResponse = {
                combo_id: index + 1,
                title: String(title).trim(),
                scenes: outputScenes,
                av_segments: avSegments.filter((segment: AvSegment) =>
                  outputScenes.includes(segment.av_segment_id)
                ),
                description: String(description).trim(),
                score: Number(String(score).trim()),
                reasoning: String(reasoning).trim(),
                duration: GenerationHelper.calculateVariantDuration(
                  outputScenes,
                  avSegmentsMap
                ),
              };
              variants.push(variant);
            } else {
              AppLogger.warn(
                `WARNING - Received a response with ALL scenes (Iteration ${iteration}).\nResponse: ${result}`
              );
            }
          } else {
            AppLogger.warn(
              `WARNING - Received an incomplete response for iteration #${iteration} from the API!\nResponse: ${result}`
            );
          }
        });

        if (variants.length > 0) {
          return of(variants.sort(
            (a, b) =>
              Math.abs(settings.duration - TimeUtil.timeStringToSeconds(a.duration)) -
              Math.abs(settings.duration - TimeUtil.timeStringToSeconds(b.duration)) ||
              b.score - a.score
          ));
        } else {
          AppLogger.warn(`No variants found in iteration ${iteration}. Retrying...`);
          return this._generateVariantsRecursive(prompt, avSegments, avSegmentsMap, allScenes, settings, iteration + 1);
        }
      }),
      catchError(error => {
        AppLogger.error(`Error in _generateVariantsRecursive (Iteration ${iteration}) calling vertexHelper.generate: ${error.message || error}`);
        return throwError(() => error);
      })
    );
  }

  generateTextAssets(
    variantVideoPath: string,
    textAssetsLanguage: string
  ): Observable<VariantTextAsset[]> {
    const count = 5;
    const generationPrompt = CONFIG.vertexAi.textAssetsGenerationPrompt
      .replace('{{videoLanguage}}', textAssetsLanguage)
      .replace('{{desiredCount}}', String(count))
      .replace('{{badExamplePromptPart}}\n    ', '');

    const textAssets: VariantTextAsset[] = [];
    const videoUrl = `gs:/${decodeURIComponent(variantVideoPath)}`;

    return this._generateTextAssetsRecursive(
      generationPrompt,
      videoUrl,
      count,
      [], // Start with an empty array
      1 // Start with iteration 1
    );
  }
  private _generateTextAssetsRecursive(
    prompt: string,
    videoUrl: string,
    count: number,
    currentTextAssets: VariantTextAsset[],
    iteration: number
  ): Observable<VariantTextAsset[]> {
    const MAX_RECURSIVE_CALLS = 10; // Define a max retry limit

    if (iteration > MAX_RECURSIVE_CALLS) {
      const errorMessage = `Max retries (${MAX_RECURSIVE_CALLS}) reached for generating text assets. Needed ${count}, got ${currentTextAssets.length}.`;
      AppLogger.error(errorMessage);
      return throwError(() => new Error(errorMessage));
    }

    return this.vertexHelper.generate(prompt, videoUrl).pipe(
      switchMap(response => {
        AppLogger.info(`GenerateTextAssets Response #${iteration}: ${response}`);
        const newTextAssets: VariantTextAsset[] = [...currentTextAssets]; // Create a new array to avoid mutating the one passed in

        const results = response.split('## Ad').filter(Boolean);
        const regex = GENERATE_TEXT_ASSETS_REGEX;

        for (const result of results) {
          const matches = result.match(regex);
          if (matches && matches.groups) {
            const { headline, description } = matches.groups as {
              headline: string;
              description: string;
            };
            newTextAssets.push({
              headline: String(headline).trim(),
              description: String(description).trim(),
            });
            // Stop adding if we reach the desired count within this iteration's results
            if (newTextAssets.length >= count) {
              break;
            }
          } else {
            AppLogger.warn(
              `WARNING - Received an incomplete response for iteration #${iteration} from the API!\nResponse: ${result}`
            );
          }
        }

        if (newTextAssets.length >= count) {
          // We have enough assets, return the first 'count'
          return of(newTextAssets.slice(0, count));
        } else {
          // Not enough assets, retry
          AppLogger.warn(`Only found ${newTextAssets.length} text assets in iteration ${iteration}. Need ${count}. Retrying...`);
          return this._generateTextAssetsRecursive(
            prompt,
            videoUrl,
            count,
            newTextAssets, // Pass the updated array
            iteration + 1
          );
        }
      }),
      catchError(error => {
        AppLogger.error(`Error in _generateTextAssetsRecursive (Iteration ${iteration}) calling vertexHelper.generate: ${error.message || error}`);
        // Propagate the error up the chain
        return throwError(() => error);
      })
    );
}
}
