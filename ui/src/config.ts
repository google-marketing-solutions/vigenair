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

import {PROMPTS} from './prompts';

/**
 * CONFIG holds various configuration parameters for the application.
 * This includes settings for interacting with Google Cloud Storage and Vertex AI,
 * as well as default values for video processing, transcription, and retry logic.
 */
export const CONFIG = {
    cloudStorage: {
        bucket: '<gcs-bucket>',
        endpointBase: 'https://storage.googleapis.com/storage/v1',
        uploadEndpointBase: 'https://storage.googleapis.com/upload/storage/v1',
        authenticatedEndpointBase: 'https://storage.mtls.cloud.google.com',
        browsingEndpointBase: 'https://console.cloud.google.com/storage/browser',
        files: {
            subtitles: 'input.vtt',
            analysis: 'analysis.json',
            data: 'data.json',
            presplit: 'presplit_data.json',
            split: '_split.json',
            combos: 'combos.json',
            render: 'render.json',
            approval: 'approval.json',
            formats: {
                square: 'square.txt',
                vertical: 'vertical.txt',
            },
        },
    },
    vertexAi: {
        endpoint: 'aiplatform.googleapis.com',
        projectId: '<gcp-project-id>',
        location: '<vertexai-region>',
        quotaLimitDelay: 10 * 1000, // 10s,
        model: 'gemini-2.5-flash',
        modelParams: {
            temperature: 1,
            topP: 1,
            maxOutputTokens: 8192,
            thinkingConfig: {
                thinkingBudget: 0,
            },
        },
        generationPrompt: PROMPTS.generationPrompt,
        aspectRatioOnlyPrompt: PROMPTS.aspectRatioOnlyPrompt,
        abcdBusinessObjectives: PROMPTS.abcdBusinessObjectives,
        textAssetsGenerationPrompt: PROMPTS.textAssetsGenerationPrompt,
        textAssetsBadExamplePromptPart: PROMPTS.textAssetsBadExamplePromptPart,
    },
    defaultVideoLanguage: 'English',
    defaultVideoWidth: 1280,
    defaultVideoHeight: 720,
    defaultVideoDurationStep: 5,
    videoFolderNameSeparator: '--',
    videoFolderNoAudioSuffix: 'n',
    videoIntelligenceConfidenceThreshold: 0.7,
    defaultTranscriptionService: 'whisper', // whisper | gemini
    defaultCacheExpiration: 60, // in seconds
    defaultDuration: 30, // in seconds
    retryDelay: 6000, // in milliseconds
    maxRetries: 600,
    maxRetriesAppsScript: 5,
    debug: true,
};
