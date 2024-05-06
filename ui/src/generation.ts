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

import { CONFIG } from './config';
import { AppLogger } from './logging';
import { StorageManager } from './storage';
import { TimeUtil } from './time-util';
import { GenerationSettings } from './ui/src/app/api-calls/api-calls.service.interface';
import { VertexHelper } from './vertex';

export interface AvSegment {
  av_segment_id: number;
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
  scenes: number[];
  av_segments: AvSegment[];
  description: string;
  score: number;
  reasoning: string;
  duration: string;
}

export class GenerationHelper {
  static resolveGenerationPrompt(
    gcsFolder: string,
    settings: GenerationSettings
  ): string {
    const videoLanguage =
      (StorageManager.loadFile(`${gcsFolder}/language.txt`, true) as string) ||
      CONFIG.defaultVideoLanguage;
    const duration = settings.duration;
    const expectedDurationRange =
      GenerationHelper.calculateExpectedDurationRange(duration);
    const videoScript = GenerationHelper.createVideoScript(
      gcsFolder,
      settings.duration
    );

    const generationPrompt = CONFIG.vertexAi.generationPrompt
      .replace('{{userPrompt}}', settings.prompt)
      .replace('{{desiredDuration}}', String(duration))
      .replace('{{expectedDurationRange}}', expectedDurationRange)
      .replace('{{videoLanguage}}', videoLanguage)
      .replace('{{videoScript}}', videoScript);

    return generationPrompt;
  }

  static calculateExpectedDurationRange(duration: number): string {
    const durationFraction = 20 / 100;
    const expectedDurationRange = `${duration - duration * durationFraction}-${duration + duration * durationFraction}`;

    return expectedDurationRange;
  }

  static getAvSegments(gcsFolder: string): AvSegment[] {
    const key = `${gcsFolder}/data.json`;
    let avSegments = CacheService.getScriptCache().get(key);

    if (!avSegments) {
      avSegments = StorageManager.loadFile(key, true) as string;
      try {
        CacheService.getScriptCache().put(
          key,
          avSegments,
          CONFIG.defaultCacheExpiration
        );
      } catch (e) {
        AppLogger.warn(
          `WARNING - Failed to cache ${key} - check the associated file size as Apps Script caches content up to 100KB only.`
        );
      }
    }
    return JSON.parse(avSegments) as AvSegment[];
  }

  static createVideoScript(gcsFolder: string, duration: number): string {
    const avSegments = GenerationHelper.getAvSegments(gcsFolder);
    const videoScript: string[] = [];

    avSegments.forEach((avSegment, index) => {
      if (avSegment.duration_s <= duration) {
        videoScript.push(`Scene ${index + 1}`);
        videoScript.push(`${avSegment.start_s} --> ${avSegment.end_s}`);
        videoScript.push(
          `Duration: ${(avSegment.end_s - avSegment.start_s).toFixed(2)}s`
        );
        const description = avSegment.description.trim();
        if (description) {
          videoScript.push(`Description: ${description}`);
        }
        videoScript.push(
          `Number of visual shots: ${avSegment.visual_segment_ids.length}`
        );
        const transcript = avSegment.transcript;
        const details = avSegment.labels.concat(avSegment.objects);
        const text = avSegment.text.map((t: string) => `"${t}"`);
        const logos = avSegment.logos;
        const keywords = avSegment.keywords.trim();

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
          videoScript.push(`Keywords: ${keywords}`);
        }
        videoScript.push('');
      }
    });
    return videoScript.join('\n');
  }

  static generateVariants(gcsFolder: string, settings: GenerationSettings) {
    const prompt = GenerationHelper.resolveGenerationPrompt(
      gcsFolder,
      settings
    );
    const variants: GenerateVariantsResponse[] = [];
    const avSegments = GenerationHelper.getAvSegments(gcsFolder);
    const avSegmentsMap = avSegments.reduce(
      (segments, segment) => ({
        ...segments,
        [String(segment.av_segment_id + 1)]: segment,
      }),
      {}
    );
    const allScenes = Object.keys(avSegmentsMap).join(', ');
    let iteration = 0;

    while (!variants.length) {
      iteration++;
      const response = VertexHelper.generate(prompt);
      AppLogger.info(`GenerateVariants Response #${iteration}: ${response}`);

      const results = response.split('## Combination').filter(Boolean);
      const regex =
        /.*Title:\**(?<title>.*)\n+\**Scenes:\**(?<scenes>.*)\n+\**Reasoning:\**(?<description>.*)\n+\**Score:\**(?<score>.*)\n+\**ABCD:\**\n+(?<reasoning>[\w\W\s\S\d\D]*)/ims;

      results.forEach((result, index) => {
        const matches = result.match(regex);
        if (matches) {
          const { title, scenes, description, score, reasoning } =
            matches.groups as {
              title: string;
              scenes: string;
              description: string;
              score: string;
              reasoning: string;
            };
          if (scenes.trim() !== allScenes) {
            const outputScenes = String(scenes)
              .trim()
              .split(', ')
              .filter(Boolean)
              .map(scene => Number(scene));
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
              `WARNING - Received a response with ALL scenes.\nResponse: ${result}`
            );
          }
        } else {
          AppLogger.warn(
            `WARNING - Received an incomplete response for iteration #${iteration} from the API!\nResponse: ${result}`
          );
        }
      });
    }
    return variants.sort(
      (a, b) =>
        b.score - a.score ||
        TimeUtil.timeStringToSeconds(a.duration) -
          TimeUtil.timeStringToSeconds(b.duration)
    );
  }

  static calculateVariantDuration(
    scenes: number[],
    avSegmentsMap: Record<string, AvSegment>
  ): string {
    let duration = 0;

    for (const scene of scenes) {
      const avSegment = avSegmentsMap[String(scene)];
      if (avSegment) {
        duration += avSegment.end_s - avSegment.start_s;
      }
    }
    return TimeUtil.secondsToTimeString(duration);
  }
}
