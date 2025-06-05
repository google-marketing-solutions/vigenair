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

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { CONFIG } from '../../../../config';
import { AppLogger } from '../../../../logging';
import { of, switchMap, retry, Observable } from 'rxjs';

interface VertexAiModelParams {
  temperature: number;
  maxOutputTokens: number;
  topP: number;
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

@Injectable({
  providedIn: 'root',
})
export class VertexHelper {
  constructor(
    private httpClient: HttpClient,
    private authService: AuthService
  ) {}

  static getEndpointUrlBase(): string {
    return `https://${CONFIG.vertexAi.location}-${CONFIG.vertexAi.endpoint}/v1/projects/${CONFIG.vertexAi.projectId}/locations/${CONFIG.vertexAi.location}/publishers/google/models/${CONFIG.vertexAi.model}`;
  }

  fetchJson(url: string, request: VertexAiGeminiRequest): Observable<unknown> {
    return this.authService.getAccessToken().pipe(
      switchMap(userAuthToken => this.httpClient.post(url, JSON.stringify(request), {
        headers: new HttpHeaders({
          Authorization: `Bearer ${userAuthToken}`,
          'Content-Type': 'application/json'
        })
      }).pipe(
        switchMap(response => {
          console.log(`fetchJson got this ${response}`);
          return of(response);
        })
      )
      .pipe(
          retry({ count: CONFIG.vertexAi.quotaLimitDelay/1000, delay:  CONFIG.vertexAi.quotaLimitDelay})
      )));
  }

  generate(prompt: string, gcsVideoUrl?: string) : Observable<string> {
    return this.multimodalGenerate(prompt, gcsVideoUrl);
  }

  multimodalGenerate(prompt: string, gcsVideoUrl?: string): Observable<string> {
    const endpoint = `${VertexHelper.getEndpointUrlBase()}:streamGenerateContent`;

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
    if (gcsVideoUrl) {
      request.contents.parts.push({
        fileData: { mimeType: 'video/mp4', fileUri: gcsVideoUrl },
      });
    }
    AppLogger.debug(`Request: ${JSON.stringify(request)}`);

    return this.fetchJson(endpoint, request).pipe(
      switchMap(response => {
        const vertexResponse = response as VertexAiGeminiResponseCandidate[];
        const content: string[] = [];
        vertexResponse.forEach(candidate => {
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
        return of(contentText);
      }));
  }
}
