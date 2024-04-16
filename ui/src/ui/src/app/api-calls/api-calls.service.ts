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

import { Injectable, NgZone } from '@angular/core';
import { Observable, retry } from 'rxjs';
import {
  ApiCalls,
  GenerateVariantsResponse,
  GenerationSettings,
} from './api-calls.service.interface';

@Injectable({
  providedIn: 'root',
})
export class ApiCallsService implements ApiCalls {
  constructor(private ngZone: NgZone) {}

  blobToDataURL(blob: Blob) {
    return new Promise(resolve => {
      const a = new FileReader();
      a.onload = function (e) {
        resolve(e.target!.result);
      };
      a.readAsDataURL(blob);
    });
  }

  uploadVideo(file: File): Observable<string> {
    return new Observable(subscriber => {
      this.blobToDataURL(file).then(dataUrl => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        google.script.run
          .withSuccessHandler((folder: string) => {
            this.ngZone.run(() => {
              subscriber.next(folder);
              subscriber.complete();
            });
          })
          .uploadVideo(dataUrl, file.name);
      });
    });
  }

  getFromGcs(
    url: string,
    mimeType: string,
    retryDelay?: number,
    maxRetries = 0
  ): Observable<string> {
    return new Observable<string>(subscriber => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      google.script.run
        .withSuccessHandler((dataUrl?: string) => {
          if (!dataUrl) {
            subscriber.error('404');
          } else {
            this.ngZone.run(() => {
              subscriber.next(dataUrl);
              subscriber.complete();
            });
          }
        })
        .getFromGcs(url, mimeType);
    }).pipe(retry({ count: maxRetries, delay: retryDelay }));
  }

  generateVariants(
    gcsFolder: string,
    settings: GenerationSettings
  ): Observable<GenerateVariantsResponse[]> {
    return new Observable<GenerateVariantsResponse[]>(subscriber => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      google.script.run
        .withSuccessHandler((variants: GenerateVariantsResponse[]) => {
          this.ngZone.run(() => {
            subscriber.next(variants);
            subscriber.complete();
          });
        })
        .generateVariants(gcsFolder, settings);
    });
  }

  getRunsFromGcs(): Observable<string[]> {
    return new Observable<string[]>(subscriber => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      google.script.run
        .withSuccessHandler((runs: string[]) => {
          this.ngZone.run(() => {
            subscriber.next(runs);
            subscriber.complete();
          });
        })
        .getRunsFromGcs();
    });
  }
}
