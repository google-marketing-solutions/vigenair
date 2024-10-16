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
import { ScriptUtil } from './script-util';

interface VertexAiModelParams {
  temperature: number;
  maxOutputTokens: number;
  topK: number;
  topP: number;
}

interface VertexAiPalmRequest {
  instances: [{ prompt: string }];
  parameters: VertexAiModelParams;
}

interface VertexAiPalmPrediction {
  content: string;
  safetyAttributes: {
    blocked: boolean;
  };
}

interface VertexAiPalmResponse {
  predictions: VertexAiPalmPrediction[] | null;
}

interface VertexAiGeminiRequest {
  contents: {
    role: 'user';
    parts: [
      { text: string },
      { inlineData: { mimeType: string; data: string } }?,
      { fileData: { mimeType: string; fileUri: string } }?,
    ];
  };
  generationConfig: VertexAiModelParams;
  safetySettings: VertexAiGeminiRequestSafetyThreshold[];
}

enum SafetyThreshold {
  HARM_BLOCK_THRESHOLD_UNSPECIFIED = 0,
  BLOCK_LOW_AND_ABOVE = 1,
  BLOCK_MEDIUM_AND_ABOVE = 2,
  BLOCK_ONLY_HIGH = 3,
  BLOCK_NONE = 4,
}

interface VertexAiGeminiRequestSafetyThreshold {
  category:
    | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
    | 'HARM_CATEGORY_HATE_SPEECH'
    | 'HARM_CATEGORY_HARASSMENT'
    | 'HARM_CATEGORY_DANGEROUS_CONTENT';
  threshold: SafetyThreshold;
}

interface VertexAiGeminiResponseCandidate {
  candidates?: [
    {
      content: {
        parts: [{ text: string }];
      };
      finishReason?: string;
    },
  ];
  error?: Record<string, unknown>;
}

export class VertexHelper {
  static getEndpointUrlBase(): string {
    return `https://${CONFIG.vertexAi.location}-${CONFIG.vertexAi.endpoint}/v1/projects/${CONFIG.vertexAi.projectId}/locations/${CONFIG.vertexAi.location}/publishers/google/models/${CONFIG.vertexAi.model}`;
  }

  static fetchJson(
    url: string,
    request: VertexAiPalmRequest | VertexAiGeminiRequest
  ): unknown {
    const response = ScriptUtil.urlFetch(url, 'POST', {
      contentType: 'application/json',
      payload: JSON.stringify(request),
    });
    AppLogger.debug(response);
    if (response.getResponseCode() === 429) {
      AppLogger.info(
        `Waiting ${
          Number(CONFIG.vertexAi.quotaLimitDelay) / 1000
        }s as API quota limit has been reached...`
      );
      Utilities.sleep(CONFIG.vertexAi.quotaLimitDelay);
      return this.fetchJson(url, request);
    }
    return JSON.parse(response.getContentText());
  }

  static generate(prompt: string): string {
    if (CONFIG.vertexAi.model.startsWith('gemini')) {
      return this.multimodalGenerate(prompt);
    }
    return this.predict(prompt);
  }

  static predict(prompt: string): string {
    const endpoint = `${this.getEndpointUrlBase()}:predict`;

    const request: VertexAiPalmRequest = {
      instances: [{ prompt: prompt }],
      parameters: CONFIG.vertexAi.modelParams,
    };
    AppLogger.debug(`Request: ${JSON.stringify(request)}`);

    const response = this.fetchJson(endpoint, request) as VertexAiPalmResponse;
    AppLogger.debug(`Response: ${JSON.stringify(response)}`);

    if (response.predictions) {
      if (response.predictions[0].safetyAttributes.blocked) {
        throw new Error(
          `Request was blocked as it triggered API safety filters. Prompt: ${prompt}`
        );
      } else if (!response.predictions[0].content) {
        throw new Error(`Received empty response from API. Prompt: ${prompt}`);
      } else {
        return response.predictions[0].content;
      }
    }
    throw new Error(JSON.stringify(response));
  }

  static multimodalGenerate(prompt: string): string {
    const endpoint = `${this.getEndpointUrlBase()}:streamGenerateContent`;

    const request: VertexAiGeminiRequest = {
      contents: {
        role: 'user',
        parts: [{ text: prompt }],
      },
      generationConfig: CONFIG.vertexAi.modelParams,
      safetySettings: [
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: SafetyThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: SafetyThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: SafetyThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: SafetyThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    };
    AppLogger.debug(`Request: ${JSON.stringify(request)}`);

    const response = this.fetchJson(
      endpoint,
      request
    ) as VertexAiGeminiResponseCandidate[];
    AppLogger.debug(`Response: ${JSON.stringify(response)}`);

    const content: string[] = [];
    response.forEach(candidate => {
      if (candidate.error) {
        throw new Error(JSON.stringify(response));
      }
      if (
        'SAFETY' === candidate.candidates![0].finishReason ||
        'BLOCKLIST' === candidate.candidates![0].finishReason
      ) {
        throw new Error(
          `Request was blocked as it triggered API safety filters. ${prompt}`
        );
      }
      content.push(candidate.candidates![0].content.parts[0].text);
    });
    const contentText = content.join('');
    if (!contentText) {
      throw new Error(JSON.stringify(response));
    }
    return contentText;
  }
}
