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

import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { Observable, lastValueFrom } from 'rxjs';
import {
  ApiCalls,
  GenerateVariantsResponse,
  GenerationSettings,
  PreviousRunsResponse,
  RenderQueueVariant,
} from './api-calls.service.interface';

@Injectable({
  providedIn: 'root',
})
export class ApiCallsService implements ApiCalls {
  constructor(
    private ngZone: NgZone,
    private httpClient: HttpClient
  ) {}

  bytesToBase64(bytes: any) {
    const binString = Array.from(bytes, (byte: any) =>
      String.fromCodePoint(byte)
    ).join('');
    return btoa(binString);
  }
  async loadLocalFile(path: string, mimeType: string, convertToBase64 = true) {
    const data = await lastValueFrom(
      this.httpClient.get(path, { responseType: 'text' })
    );
    if (convertToBase64) {
      const encodedDataString = this.bytesToBase64(
        new TextEncoder().encode(data)
      );
      return `data:${mimeType};base64,${encodedDataString}`;
    } else {
      return data;
    }
  }
  loadPreviousRun(folder: string): string[] {
    return ['assets', 'assets/input.mp4'];
  }
  uploadVideo(
    file: Blob,
    analyseAudio: boolean,
    encodedUserId: string
  ): Observable<string[]> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(() => {
          subscriber.next(this.loadPreviousRun(''));
          subscriber.complete();
        });
      }, 1000);
    });
  }
  deleteGcsFolder(folder: string): void {}
  getFromGcs(url: string, mimeType: string): Observable<string> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(async () => {
          if (mimeType === 'text/vtt') {
            subscriber.next(
              await this.loadLocalFile('assets/input.vtt', 'text/vtt')
            );
          } else if (mimeType === 'application/json') {
            if (url.endsWith('/analysis.json')) {
              subscriber.next(
                await this.loadLocalFile(
                  'assets/analysis.json',
                  'application/json'
                )
              );
            } else if (url.endsWith('/combos.json')) {
              subscriber.next(
                await this.loadLocalFile(
                  'assets/12345-combos/combos.json',
                  'application/json'
                )
              );
            } else if (url.endsWith('/data.json')) {
              subscriber.next(
                await this.loadLocalFile('assets/data.json', 'application/json')
              );
            }
          }
          subscriber.complete();
        });
      }, 1000);
    });
  }
  generateVariants(
    gcsFolder: string,
    settings: GenerationSettings
  ): Observable<GenerateVariantsResponse[]> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(async () => {
          subscriber.next(
            JSON.parse(
              await this.loadLocalFile(
                'assets/variants.json',
                'application/json',
                false
              )
            )
          );
          subscriber.complete();
        });
      }, 1000);
    });
  }
  getRunsFromGcs(): Observable<PreviousRunsResponse> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(() => {
          subscriber.next({
            runs: [
              'Lufthansa.mp4--1712403055317--abcdef',
              'some-video.mp4--1712403402220--ghijkl',
            ],
            encodedUserId: 'abcdef',
          });
          subscriber.complete();
        });
      }, 1000);
    });
  }
  renderVariants(
    gcsFolder: string,
    renderQueue: RenderQueueVariant[]
  ): Observable<string> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(() => {
          subscriber.next('assets/12345-combos');
          subscriber.complete();
        });
      }, 1000);
    });
  }
}
