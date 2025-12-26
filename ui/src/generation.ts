/**
 * Copyright 2025 Google LLC
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
import {
  GenerationSettings,
  VariantTextAsset,
} from './ui/src/app/api-calls/api-calls.service.interface';
import { VertexHelper } from './vertex';

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

export class GenerationHelper {
  static resolveGenerationPrompt(
    gcsFolder: string,
    settings: GenerationSettings
  ): string {
    const videoLanguage = GenerationHelper.getVideoLanguage(gcsFolder);
    const avSegments = GenerationHelper.getAvSegments(gcsFolder);

    // If not shortening, use full video duration
    const duration = settings.shortenVideo
      ? settings.duration
      : avSegments.reduce((total, seg) => total + seg.duration_s, 0);

    const expectedDurationRange =
      GenerationHelper.calculateExpectedDurationRange(duration);
    const videoScript = GenerationHelper.createVideoScript(
      gcsFolder,
      settings.shortenVideo ? settings.duration : Number.MAX_SAFE_INTEGER
    );

    // Use aspect-ratio-only prompt if not shortening, otherwise use regular prompt
    const promptTemplate = settings.shortenVideo
      ? CONFIG.vertexAi.generationPrompt
      : CONFIG.vertexAi.aspectRatioOnlyPrompt;

    const generationPrompt = promptTemplate
      .replace('{{{{userPrompt}}}}', settings.prompt)
      .replace('{{{{generationEvalPromptPart}}}}', settings.evalPrompt)
      .replace('{{{{desiredDuration}}}}', String(duration))
      .replace('{{{{expectedDurationRange}}}}', expectedDurationRange)
      .replace('{{{{videoLanguage}}}}', videoLanguage)
      .replace('{{{{videoScript}}}}', videoScript);

    return generationPrompt;
  }

  static getVideoLanguage(gcsFolder: string): string {
    return (
      (StorageManager.loadFile(`${gcsFolder}/language.txt`, true) as string) ||
      CONFIG.defaultVideoLanguage
    );
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
    return JSON.parse(avSegments).map((avSegment: AvSegment) => {
      if (typeof avSegment.av_segment_id === 'number') {
        avSegment.av_segment_id = String(avSegment.av_segment_id + 1);
      }
      if (avSegment.av_segment_id.endsWith('.0')) {
        avSegment.av_segment_id = avSegment.av_segment_id.replace('.0', '');
      }
      return avSegment;
    }) as AvSegment[];
  }

  static createVideoScript(gcsFolder: string, duration: number): string {
    const avSegments = GenerationHelper.getAvSegments(gcsFolder);
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
  }

  static promptLogger(gcsFolder: string, settings: GenerationSettings) {
    const prompt = GenerationHelper.resolveGenerationPrompt(
      gcsFolder,
      settings
    );
    return prompt;
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
        [segment.av_segment_id]: segment,
      }),
      {}
    );
    // Sort the scene IDs to ensure consistent comparison
    const allScenesArray = Object.keys(avSegmentsMap).sort((a, b) => Number(a) - Number(b));
    const allScenes = allScenesArray.join(', ');
    let iteration = 0;
    const maxIterations = 5;

    while (!variants.length && iteration < maxIterations) {
      iteration++;
      AppLogger.info(`GenerateVariants attempt #${iteration} of ${maxIterations}`);
      AppLogger.info(`Mode: ${settings.shortenVideo ? 'SHORTENING' : 'ASPECT RATIO ONLY'}`);
      const response = VertexHelper.generate(prompt);
      AppLogger.info(`GenerateVariants Response #${iteration}: ${response}`);

      const results = response.split('## Combination').filter(Boolean);
      AppLogger.info(`Split response into ${results.length} results`);

      // More flexible regex that handles optional whitespace and asterisks
      // Allows ABCD field to have text on same line or new line
      const regex =
        /.*Title\s?:\**\s*(?<title>.*?)\n+\**Scenes\s?:\**\s*(?<scenes>.*?)\n+\**Reasoning\s?:\**\s*(?<description>.*?)\n+\**Score\s?:\**\s*(?<score>.*?)\n+\**Duration\s?:\**\s*(?<duration>.*?)\n+\**ABCD\s?:\**\s*\n*(?<reasoning>[\w\W\s\S\d\D]*)/ims;

      results.forEach((result, index) => {
        AppLogger.info(`\n=== Processing result #${index + 1} ===`);
        const matches = result.match(regex);
        if (matches) {
          AppLogger.info(`Result #${index + 1} matched regex`);
          const { title, scenes, description, score, reasoning } =
            matches.groups as {
              title: string;
              scenes: string;
              description: string;
              score: string;
              duration: string;
              reasoning: string;
            };
          const trimmedScenes = String(scenes)
            .trim()
            .split(', ')
            .filter(Boolean)
            .map(scene =>
              scene.toLowerCase().replace('scene ', '').replace('.0', '')
            );

          // Sort for consistent comparison
          const sortedTrimmedScenes = trimmedScenes.sort((a, b) => Number(a) - Number(b));
          const trimmedScenesStr = sortedTrimmedScenes.join(', ');

          AppLogger.info(`Scenes found: "${trimmedScenesStr}"`);
          AppLogger.info(`All scenes: "${allScenes}"`);

          // For crop-only mode, accept all scenes. For shortening mode, reject if all scenes are included.
          const shouldAcceptVariant = settings.shortenVideo
            ? trimmedScenesStr !== allScenes
            : true;

          AppLogger.info(`Should accept variant: ${shouldAcceptVariant} (mode: ${settings.shortenVideo ? 'shortening' : 'aspect-ratio-only'})`);

          if (shouldAcceptVariant) {
            const outputScenes = sortedTrimmedScenes;
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
            AppLogger.info(`✓ Variant #${variants.length} added: "${variant.title}"`);
          } else {
            AppLogger.warn(
              `✗ Rejected: Response with ALL scenes in shortening mode.\nScenes: ${trimmedScenesStr}\nResponse snippet: ${result.substring(0, 200)}...`
            );
          }
        } else {
          // Regex match failed - provide detailed diagnostics
          const errorTitle = `✗ REGEX MATCH FAILED for result #${index + 1}`;
          AppLogger.error(errorTitle);
          console.error(errorTitle);

          const expectedFormat = [
            'Expected format:',
            '  Title: [text]',
            '  Scenes: [numbers]',
            '  Reasoning: [text]',
            '  Score: [number]',
            '  Duration: [number]',
            '  ABCD:',
            '  [ABCD text]'
          ];
          expectedFormat.forEach(line => {
            AppLogger.error(line);
            console.error(line);
          });

          AppLogger.error('\nActual response received:');
          console.error('\nActual response received:');
          AppLogger.error(result);
          console.error(result);

          // Try to identify what's missing
          const hasTitle = /Title\s*:/i.test(result);
          const hasScenes = /Scenes\s*:/i.test(result);
          const hasReasoning = /Reasoning\s*:/i.test(result);
          const hasScore = /Score\s*:/i.test(result);
          const hasDuration = /Duration\s*:/i.test(result);
          const hasABCD = /ABCD\s*:/i.test(result);

          const fieldCheck = [
            '\nField presence check:',
            `  Title: ${hasTitle ? '✓' : '✗ MISSING'}`,
            `  Scenes: ${hasScenes ? '✓' : '✗ MISSING'}`,
            `  Reasoning: ${hasReasoning ? '✓' : '✗ MISSING'}`,
            `  Score: ${hasScore ? '✓' : '✗ MISSING'}`,
            `  Duration: ${hasDuration ? '✓' : '✗ MISSING'}`,
            `  ABCD: ${hasABCD ? '✓' : '✗ MISSING'}`
          ];
          fieldCheck.forEach(line => {
            AppLogger.error(line);
            console.error(line);
          });
        }
      });
    }

    AppLogger.info(`\n=== Generation Summary ===`);
    AppLogger.info(`Total variants generated: ${variants.length}`);
    AppLogger.info(`Iterations used: ${iteration}/${maxIterations}`);

    if (!variants.length) {
      const errorMsg = `Failed to generate valid variants after ${maxIterations} attempts. Please check the logs for details.`;
      AppLogger.error(errorMsg);
      throw new Error(errorMsg);
    }

    return variants.sort(
      (a, b) =>
        Math.abs(settings.duration - TimeUtil.timeStringToSeconds(a.duration)) -
          Math.abs(
            settings.duration - TimeUtil.timeStringToSeconds(b.duration)
          ) || b.score - a.score
    );
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

  static generateTextAsset(
    variantVideoPath: string,
    textAsset: VariantTextAsset,
    textAssetLanguage: string
  ): VariantTextAsset {
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

    const response = VertexHelper.generate(
      generationPrompt,
      `gs:/${decodeURIComponent(variantVideoPath)}`
    );
    AppLogger.info(`GenerateTextAsset Response: ${response}`);
    const result = response.split('## Ad').filter(Boolean)[0];
    const matches = result.match(GENERATE_TEXT_ASSETS_REGEX);
    if (matches) {
      const { headline, description } = matches.groups as {
        headline: string;
        description: string;
      };
      return {
        headline: String(headline).trim(),
        description: String(description).trim(),
      };
    } else {
      const message = `WARNING - Received an incomplete response from the API!\nResponse: ${response}`;
      AppLogger.warn(message);
      throw new Error(message);
    }
  }

  static generateTextAssets(
    variantVideoPath: string,
    textAssetsLanguage: string
  ) {
    const count = 5;
    const generationPrompt = CONFIG.vertexAi.textAssetsGenerationPrompt
      .replace('{{videoLanguage}}', textAssetsLanguage)
      .replace('{{desiredCount}}', String(count))
      .replace('{{badExamplePromptPart}}\n    ', '');

    const textAssets: VariantTextAsset[] = [];
    let iteration = 0;

    while (textAssets.length < count) {
      iteration++;
      const response = VertexHelper.generate(
        generationPrompt,
        `gs:/${decodeURIComponent(variantVideoPath)}`
      );
      AppLogger.info(`GenerateTextAssets Response: ${response}`);

      const results = response.split('## Ad').filter(Boolean);

      for (const result of results) {
        const matches = result.match(GENERATE_TEXT_ASSETS_REGEX);
        if (matches) {
          const { headline, description } = matches.groups as {
            headline: string;
            description: string;
          };
          textAssets.push({
            headline: String(headline).trim(),
            description: String(description).trim(),
          });
          if (textAssets.length === count) {
            break;
          }
        } else {
          AppLogger.warn(
            `WARNING - Received an incomplete response for iteration #${iteration} from the API!\nResponse: ${response}`
          );
        }
      }
    }
    return textAssets;
  }
}
