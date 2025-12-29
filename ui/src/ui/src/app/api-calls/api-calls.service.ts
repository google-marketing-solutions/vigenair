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

/// <reference types="google-apps-script" />

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { catchError, map, Observable, of, retry, switchMap, timer } from 'rxjs';
import { CONFIG } from '../../../../config';

import { StringUtil } from '../../../../string-util';
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
          subscriber.error(error);
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
    filename?: string,
    contentType?: string
  ): Observable<string[]> {
    // Detect file extension and set appropriate filename and content type
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const actualFilename = filename || `input.${fileExtension}`;
    const actualContentType = contentType || file.type || 'video/mp4';

    const videoFolderTranscriptionSuffix =
      CONFIG.defaultTranscriptionService.charAt(0);
    // eslint-disable-next-line no-useless-escape
    const sanitisedFileName = StringUtil.gcsSanitise(file.name);
    const folder = `${sanitisedFileName}${CONFIG.videoFolderNameSeparator}${analyseAudio ? videoFolderTranscriptionSuffix : CONFIG.videoFolderNoAudioSuffix}${CONFIG.videoFolderNameSeparator}${Date.now()}${CONFIG.videoFolderNameSeparator}${encodedUserId}`;
    const fullName = encodeURIComponent(`${folder}/${actualFilename}`);
    const url = `${CONFIG.cloudStorage.uploadEndpointBase}/b/${CONFIG.cloudStorage.bucket}/o?uploadType=media&name=${fullName}`;

    return this.getUserAuthToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient
          .post(url, file, {
            headers: new HttpHeaders({
              'Authorization': `Bearer ${userAuthToken}`,
              'Content-Type': actualContentType,
            }),
          })
          .pipe(
            switchMap(response => {
              console.log('Upload complete!', response);
              // Backend converts .mov files to .mp4, so use .mp4 in the video path
              const finalFilename = fileExtension === 'mov' ? 'input.mp4' : actualFilename;
              const videoFilePath = `${CONFIG.cloudStorage.authenticatedEndpointBase}/${CONFIG.cloudStorage.bucket}/${encodeURIComponent(folder)}/${finalFilename}`;

              // For .mov files, emit initial response but also start polling for converted file
              if (fileExtension === 'mov') {
                // Emit the folder and a temporary path first
                const result: string[] = [folder, videoFilePath, 'converting'];
                return of(result);
              }

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

  waitForConvertedVideo(folder: string): Observable<string> {
    const mp4Path = `${folder}/input.mp4`;
    const videoUrl = `${CONFIG.cloudStorage.authenticatedEndpointBase}/${CONFIG.cloudStorage.bucket}/${encodeURIComponent(folder)}/input.mp4`;

    console.log('Waiting for converted MP4 file...');

    // Poll for the MP4 file with HEAD request to check existence
    return this.getUserAuthToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient.head(
          `${CONFIG.cloudStorage.endpointBase}/b/${CONFIG.cloudStorage.bucket}/o/${encodeURIComponent(mp4Path)}?alt=media`,
          {
            headers: new HttpHeaders({
              Authorization: `Bearer ${userAuthToken}`,
            }),
          }
        ).pipe(
          map(() => {
            console.log('Converted MP4 file is ready!');
            return videoUrl;
          })
        )
      ),
      retry({
        count: 30, // Try for up to 30 times (about 60 seconds with 2s delay)
        delay: (error, retryCount) => {
          if (error.status && error.status === 404 && retryCount < 30) {
            console.log(`Conversion in progress, retrying (${retryCount}/30)...`);
            return timer(2000); // Wait 2 seconds between retries
          }
          throw error;
        },
      })
    );
  }

  deleteGcsFolder(folder: string): void {
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
            console.log(`Expected output not available yet, retrying (${retryCount}/${maxRetries})...`);
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
    console.log('API Service: Starting generateVariants call');
    console.log('Settings:', settings);
    return new Observable<GenerateVariantsResponse[]>(subscriber => {
      const startTime = Date.now();
      google.script.run
        .withSuccessHandler((variants: GenerateVariantsResponse[]) => {
          const elapsed = Date.now() - startTime;
          console.log(`API Service: Received success response after ${elapsed}ms`);
          console.log('Variants received:', variants);
          console.log('Number of variants:', variants?.length);
          this.ngZone.run(() => {
            subscriber.next(variants);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          const elapsed = Date.now() - startTime;
          console.error(`API Service: Received error after ${elapsed}ms`);
          console.error(
            'Encountered an unexpected error while generating variants! Error: ',
            error
          );
          subscriber.error(error);
        })
        .generateVariants(gcsFolder, settings);
      console.log('API Service: google.script.run call initiated');
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  generatePreviews(
    gcsFolder: string,
    analysis: any,
    segments: any,
    settings: PreviewSettings
  ): Observable<GeneratePreviewsResponse> {
    return new Observable<GeneratePreviewsResponse>(subscriber => {
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
          subscriber.error(error);
        })
        .generatePreviews(analysis, segments, settings);
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  getRunsFromGcs(): Observable<PreviousRunsResponse> {
    return new Observable<PreviousRunsResponse>(subscriber => {
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
          subscriber.error(error);
        })
        .getRunsFromGcs();
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  getRendersFromGcs(gcsFolder: string): Observable<string[]> {
    return new Observable<string[]>(subscriber => {
      google.script.run
        .withSuccessHandler((response: string[]) => {
          this.ngZone.run(() => {
            subscriber.next(response);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error(
            'Could not retrieve previous renders from GCS! Error: ',
            error
          );
          subscriber.error(error);
        })
        .getRendersFromGcs(gcsFolder);
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  renderVariants(
    gcsFolder: string,
    renderQueue: RenderQueue
  ): Observable<string> {
    return new Observable<string>(subscriber => {
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
          subscriber.error(error);
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
      google.script.run
        .withSuccessHandler((response: string) => {
          this.ngZone.run(() => {
            subscriber.next(response);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error('Could not retrieve the Web App URL! Error: ', error);
          subscriber.error(error);
        })
        .getWebAppUrl();
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  regenerateTextAsset(
    variantVideoPath: string,
    textAsset: VariantTextAsset,
    textAssetLanguage: string
  ): Observable<VariantTextAsset> {
    return new Observable<VariantTextAsset>(subscriber => {
      google.script.run
        .withSuccessHandler((textAsset: VariantTextAsset) => {
          this.ngZone.run(() => {
            textAsset.approved = true;
            textAsset.editable = false;
            subscriber.next(textAsset);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error('Could not regenerate text asset! Error: ', error);
          subscriber.error(error);
        })
        .regenerateTextAsset(variantVideoPath, textAsset, textAssetLanguage);
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  storeApprovalStatus(
    folder: string,
    combos: RenderedVariant[]
  ): Observable<boolean> {
    return new Observable<boolean>(subscriber => {
      google.script.run
        .withSuccessHandler((response: boolean) => {
          this.ngZone.run(() => {
            subscriber.next(response);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error('Error while storing approval status! Error: ', error);
          subscriber.error(error);
        })
        .storeApprovalStatus(folder, combos);
    });
  }

  getVideoLanguage(gcsFolder: string): Observable<string> {
    return new Observable<string>(subscriber => {
      google.script.run
        .withSuccessHandler((videoLanguage: string) => {
          this.ngZone.run(() => {
            subscriber.next(videoLanguage);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error(
            'Could not retrieve the video language! Error: ',
            error
          );
          subscriber.error(error);
        })
        .getVideoLanguage(gcsFolder);
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  generateTextAssets(
    variantVideoPath: string,
    textAssetsLanguage: string
  ): Observable<VariantTextAsset[]> {
    return new Observable<VariantTextAsset[]>(subscriber => {
      google.script.run
        .withSuccessHandler((textAssets: VariantTextAsset[]) => {
          this.ngZone.run(() => {
            textAssets.forEach(textAsset => {
              textAsset.approved = true;
              textAsset.editable = false;
            });
            subscriber.next(textAssets);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error('Could not generate text assets! Error: ', error);
          subscriber.error(error);
        })
        .generateTextAssets(variantVideoPath, textAssetsLanguage);
    }).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  splitSegment(
    gcsFolder: string,
    segmentMarkers: SegmentMarker[]
  ): Observable<string> {
    return new Observable<string>(subscriber => {
      google.script.run
        .withSuccessHandler((response: string) => {
          this.ngZone.run(() => {
            subscriber.next(response);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error(
            'Encountered an unexpected error while splitting a segment! Error: ',
            error
          );
          subscriber.error(error);
        })
        .splitSegment(gcsFolder, segmentMarkers);
    });
  }

  updateTranscription(
    gcsFolder: string,
    transcriptionText: string
  ): Observable<boolean> {
    return new Observable<boolean>(subscriber => {
      google.script.run
        .withSuccessHandler((response: boolean) => {
          this.ngZone.run(() => {
            subscriber.next(response);
            subscriber.complete();
          });
        })
        .withFailureHandler((error: Error) => {
          console.error(
            'Encountered an unexpected error while updating transcription! Error: ',
            error
          );
          subscriber.error(error);
        })
        .updateTranscription(gcsFolder, transcriptionText);
    });
  }
}
