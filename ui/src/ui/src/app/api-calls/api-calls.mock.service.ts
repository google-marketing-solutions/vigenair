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

import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { lastValueFrom, Observable, of } from 'rxjs';
import {
  ApiCalls,
  GeneratePreviewsResponse,
  GenerateVariantsResponse,
  GenerationSettings,
  PreviewSettings,
  PreviousRunsResponse,
  RenderedVariant,
  RenderQueue,
  SegmentMarker,
  VariantTextAsset,
} from './api-calls.service.interface';

const HORIZONTAL_SAMPLE_FOLDER = 'horizontal.mp4--1234567890123--abcdef';
const COMBOS_FOLDER = 'Sample--1707812254000-combos';

@Injectable({
  providedIn: 'root',
})
export class ApiCallsService implements ApiCalls {
  constructor(
    private ngZone: NgZone,
    private httpClient: HttpClient
  ) {}

  async loadLocalFile(path: string) {
    const data = await lastValueFrom(
      this.httpClient.get(path, { responseType: 'text' })
    );
    return data;
  }
  loadPreviousRun(folder: string): string[] {
    return [`assets/${folder}`, `assets/${folder}/input.mp4`];
  }
  uploadVideo(
    file: Blob,
    analyseAudio: boolean,
    encodedUserId: string
  ): Observable<string[]> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(() => {
          subscriber.next(this.loadPreviousRun(HORIZONTAL_SAMPLE_FOLDER));
          subscriber.complete();
        });
      }, 1000);
    });
  }
  deleteGcsFolder(folder: string): void {}
  getFromGcs(url: string): Observable<string> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(async () => {
          subscriber.next(await this.loadLocalFile(url));
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
            JSON.parse(await this.loadLocalFile(`${gcsFolder}/variants.json`))
          );
          subscriber.complete();
        });
      }, 1000);
    });
  }
  generatePreviews(
    gcsFolder: string,
    analysis: any,
    segments: any,
    settings: PreviewSettings
  ): Observable<GeneratePreviewsResponse> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(async () => {
          const square = await this.loadLocalFile(`${gcsFolder}/square.json`);
          const vertical = await this.loadLocalFile(
            `${gcsFolder}/vertical.json`
          );
          subscriber.next({ square, vertical });
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
            runs: [HORIZONTAL_SAMPLE_FOLDER],
            encodedUserId: 'abcdef',
          });
          subscriber.complete();
        });
      }, 1000);
    });
  }
  getRendersFromGcs(gcsFolder: string): Observable<string[]> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(() => {
          subscriber.next([COMBOS_FOLDER]);
          subscriber.complete();
        });
      }, 1000);
    });
  }
  renderVariants(
    gcsFolder: string,
    renderQueue: RenderQueue
  ): Observable<string> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(() => {
          subscriber.next(`${gcsFolder}/${COMBOS_FOLDER}`);
          subscriber.complete();
        });
      }, 1000);
    });
  }
  getGcsFolderPath(folder: string): Observable<string> {
    return of(folder);
  }
  getWebAppUrl(): Observable<string> {
    return of('');
  }
  regenerateTextAsset(
    variantVideoPath: string,
    textAsset: VariantTextAsset,
    textAssetLanguage: string
  ): Observable<VariantTextAsset> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(() => {
          subscriber.next({
            headline: `NEW - ${textAsset.headline}`,
            description: `NEW - ${textAsset.description}`,
            approved: true,
            editable: false,
          });
          subscriber.complete();
        });
      }, 1000);
    });
  }
  storeApprovalStatus(
    gcsFolder: string,
    combos: RenderedVariant[]
  ): Observable<boolean> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(() => {
          subscriber.next(true);
          subscriber.complete();
        });
      }, 1000);
    });
  }
  getVideoLanguage(gcsFolder: string): Observable<string> {
    return new Observable(subscriber => {
      this.ngZone.run(() => {
        subscriber.next('German');
        subscriber.complete();
      });
    });
  }
  generateTextAssets(
    variantVideoPath: string,
    textAssetsLanguage: string
  ): Observable<VariantTextAsset[]> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(() => {
          const textAssets = [];
          for (let i = 0; i < 5; i++) {
            textAssets.push({
              headline: `NEW headline ${i + 1} in ${textAssetsLanguage}.`,
              description: `NEW description ${i + 1} in ${textAssetsLanguage}`,
              approved: true,
              editable: false,
            });
          }
          subscriber.next(textAssets);
          subscriber.complete();
        });
      }, 1000);
    });
  }
  splitSegment(
    gcsFolder: string,
    segmentMarkers: SegmentMarker[]
  ): Observable<string> {
    return new Observable(subscriber => {
      setTimeout(() => {
        this.ngZone.run(() => {
          subscriber.next('split complete');
          subscriber.complete();
        });
      }, 1000);
    });
  }
  updateTranscription(
    gcsFolder: string,
    transcriptionText: string
  ): Observable<boolean> {
    return of(true);
  }
}
