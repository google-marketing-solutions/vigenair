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

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { catchError, Observable, of, retry, switchMap, timer } from 'rxjs';
import { CONFIG } from '../../../../config';

import {
  ApiCalls,
  GeneratePreviewsResponse,
  GenerateVariantsResponse,
  GenerationSettings,
  PreviewSettings,
  PreviousRunsResponse,
  RenderedVariant,
  RenderQueue,
} from './api-calls.service.interface';

@Injectable({
  providedIn: 'root',
})
export class ApiCallsService implements ApiCalls {
  constructor(
    private ngZone: NgZone,
    private httpClient: HttpClient
  ) {}

  loadPreviousRun(folder: string): string[] {
    return [
      folder,
      `${CONFIG.cloudStorage.authenticatedEndpointBase}/${CONFIG.cloudStorage.bucket}/${encodeURIComponent(folder)}/input.mp4`,
    ];
  }

  getUserAuthToken(): Observable<string> {
    return new Observable<string>(subscriber => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      google.script.run
        .withSuccessHandler((userAuthToken: string) => {
          this.ngZone.run(() => {
            subscriber.next(userAuthToken);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error(
            'Could not retrieve the user auth token! Error: ',
            error
          );
          throw error;
        })
        .getUserAuthToken();
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  uploadVideo(
    file: File,
    analyseAudio: boolean,
    encodedUserId: string,
    filename = 'input.mp4',
    contentType = 'video/mp4'
  ): Observable<string[]> {
    const folder = `${file.name}${CONFIG.videoFolderNameSeparator}${analyseAudio ? '' : `${CONFIG.videoFolderNoAudioSuffix}${CONFIG.videoFolderNameSeparator}`}${Date.now()}${CONFIG.videoFolderNameSeparator}${encodedUserId}`;
    const fullName = encodeURIComponent(`${folder}/${filename}`);
    const url = `${CONFIG.cloudStorage.uploadEndpointBase}/b/${CONFIG.cloudStorage.bucket}/o?uploadType=media&name=${fullName}`;

    return this.getUserAuthToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient
          .post(url, file, {
            headers: new HttpHeaders({
              'Authorization': `Bearer ${userAuthToken}`,
              'Content-Type': contentType,
            }),
          })
          .pipe(
            switchMap(response => {
              console.log('Upload complete!', response);
              const videoFilePath = `${CONFIG.cloudStorage.authenticatedEndpointBase}/${CONFIG.cloudStorage.bucket}/${encodeURIComponent(folder)}/input.mp4`;
              return of([folder, videoFilePath]);
            }),
            catchError(error => {
              console.error('Upload failed with error: ', error);
              throw error;
            })
          )
      )
    );
  }

  deleteGcsFolder(folder: string): void {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    google.script.run.deleteGcsFolder(folder);
  }

  getFromGcs(url: string, retryDelay = 0, maxRetries = 0): Observable<string> {
    const gcsUrl = `${CONFIG.cloudStorage.endpointBase}/b/${CONFIG.cloudStorage.bucket}/o/${encodeURIComponent(url)}?alt=media`;

    return this.getUserAuthToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient.get(gcsUrl, {
          responseType: 'text',
          headers: new HttpHeaders({
            Authorization: `Bearer ${userAuthToken}`,
          }),
        })
      ),
      retry({
        count: maxRetries,
        delay: (error, retryCount) => {
          if (error.status && error.status === 404 && retryCount < maxRetries) {
            console.log('Expected output not available yet, retrying...');
            return timer(retryDelay);
          }
          throw error;
        },
      })
    );
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
        .withFailureHandler((error: Error) => {
          console.error(
            'Encountered an unexpected error while generating variants! Error: ',
            error
          );
          throw error;
        })
        .generateVariants(gcsFolder, settings);
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  generatePreviews(
    analysis: any,
    segments: any,
    settings: PreviewSettings
  ): Observable<GeneratePreviewsResponse> {
    return new Observable<GeneratePreviewsResponse>(subscriber => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      google.script.run
        .withSuccessHandler((previews: GeneratePreviewsResponse) => {
          this.ngZone.run(() => {
            subscriber.next(previews);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error(
            'Encountered an unexpected error while generating format previews! Error: ',
            error
          );
          throw error;
        })
        .generatePreviews(analysis, segments, settings);
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  getRunsFromGcs(): Observable<PreviousRunsResponse> {
    return new Observable<PreviousRunsResponse>(subscriber => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      google.script.run
        .withSuccessHandler((response: PreviousRunsResponse) => {
          this.ngZone.run(() => {
            subscriber.next(response);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error(
            'Could not retrieve previous runs from GCS! Error: ',
            error
          );
          throw error;
        })
        .getRunsFromGcs();
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  renderVariants(
    gcsFolder: string,
    renderQueue: RenderQueue
  ): Observable<string> {
    return new Observable<string>(subscriber => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      google.script.run
        .withSuccessHandler((response: string) => {
          this.ngZone.run(() => {
            subscriber.next(response);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error(
            'Encountered an unexpected error while rendering variants! Error: ',
            error
          );
          throw error;
        })
        .renderVariants(gcsFolder, renderQueue);
    });
  }

  getGcsFolderPath(folder: string): Observable<string> {
    return of(
      `${CONFIG.cloudStorage.browsingEndpointBase}/${CONFIG.cloudStorage.bucket}/${encodeURIComponent(folder)}`
    );
  }

  getWebAppUrl(): Observable<string> {
    return new Observable<string>(subscriber => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      google.script.run
        .withSuccessHandler((response: string) => {
          this.ngZone.run(() => {
            subscriber.next(response);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error('Could not retrieve the Web App URL! Error: ', error);
          throw error;
        })
        .getWebAppUrl();
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  storeApprovalStatus(
    folder: string,
    combos: RenderedVariant[]
  ): Observable<boolean> {
    return new Observable<boolean>(subscriber => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      google.script.run
        .withSuccessHandler((response: boolean) => {
          this.ngZone.run(() => {
            subscriber.next(response);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error('Error while storing approval status! Error: ', error);
          throw error;
        })
        .storeApprovalStatus(folder, combos);
    });
  }
}
