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
import { catchError, Observable, of, retry, switchMap, timer, map, forkJoin} from 'rxjs';
import { CONFIG } from '../../../../config';
import { PreviewHelper } from './preview';
import { GenerationHelper } from './generation';
import { AuthService } from './auth.service';
import { StorageManager } from './storage';

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
    private httpClient: HttpClient,
    private authService: AuthService,
    private storageManager: StorageManager,
    private generationHelper: GenerationHelper
  ) {}

  loadPreviousRun(folder: string): string[] {
    return [
      folder,
      `${CONFIG.cloudStorage.authenticatedEndpointBase}/${CONFIG.cloudStorage.bucket}/${encodeURIComponent(folder)}/input.mp4`,
    ];
  }

  getUserAuthToken(): Observable<string> {
    return this.authService.getAccessToken().pipe(
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
    const videoFolderTranscriptionSuffix =
      CONFIG.defaultTranscriptionService.charAt(0);
    // eslint-disable-next-line no-useless-escape
    const sanitisedFileName = file.name.replace(/[#\[\]*?:"<>|]/g, ''); // See https://cloud.google.com/storage/docs/objects#naming
    const folder = `${sanitisedFileName}${CONFIG.videoFolderNameSeparator}${analyseAudio ? videoFolderTranscriptionSuffix : CONFIG.videoFolderNoAudioSuffix}${CONFIG.videoFolderNameSeparator}${Date.now()}${CONFIG.videoFolderNameSeparator}${encodedUserId}`;

    return this.storageManager.uploadBlob(file, folder, filename, contentType).pipe(
      map(response => {
        const videoFilePath = `${CONFIG.cloudStorage.authenticatedEndpointBase}/${CONFIG.cloudStorage.bucket}/${encodeURIComponent(folder)}/input.mp4`;
        return [folder, videoFilePath];
      }),
      catchError(error => {
        console.error('Upload failed with error: ', error);
        throw error;
      })
    );
  }

  deleteFile(filePath: string): void {
    const gcsUrl = `${CONFIG.cloudStorage.endpointBase}/b/${CONFIG.cloudStorage.bucket}/o/${encodeURIComponent(filePath)}`;
    this.getUserAuthToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient.delete(gcsUrl, {
          headers: new HttpHeaders({
            Authorization: `Bearer ${userAuthToken}`,
          }),
        })
        .pipe(
          map(() => console.log(`Deleted ${filePath}`)),
          catchError(error => {
            console.error('Delete file failed with error: ', error);
            throw error;
          })
        )
    ));
  }


  deleteGcsFolder(folder: string): void {
    const gcsUrl = this.getStorageUrl('', folder);
    this.getUserAuthToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient.get(gcsUrl, {
          responseType: 'json',
          headers: new HttpHeaders({
            Authorization: `Bearer ${userAuthToken}`,
          }),
        }).pipe(
          map((response: any) => {
            response.items.forEach((item: any) => {
              this.deleteFile(item.name);
            });
            console.log(`Deleted video folder ${folder}`);
          }),
          catchError(error => {
            console.error('Delete folder failed with error: ', error);
            throw error;
          })
        )
      )
    );
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
    return this.generationHelper.generateVariants(gcsFolder, settings);
  }

  generatePreviews(
    gcsFolder: string,
    analysis: any,
    segments: any,
    settings: PreviewSettings
  ): Observable<GeneratePreviewsResponse> {

    const sourceDimensions = settings.sourceDimensions;
    const squarePreview = PreviewHelper.createPreview(
      segments,
      analysis,
      sourceDimensions,
      { w: sourceDimensions.h, h: sourceDimensions.h },
      settings.weights
    );
    const verticalPreview = PreviewHelper.createPreview(
      segments,
      analysis,
      sourceDimensions,
      {
        w: sourceDimensions.h * (sourceDimensions.h / sourceDimensions.w),
        h: sourceDimensions.h,
      },
      settings.weights
    );

    return of({
      square: JSON.stringify(squarePreview),
      vertical: JSON.stringify(verticalPreview),
    });
  }

  getStorageUrl(delimiter = '/', prefix?: string): string {
    let url = `${CONFIG.cloudStorage.endpointBase}/b/${CONFIG.cloudStorage.bucket}/o?`;
    if (delimiter) {
      url += `delimiter=${encodeURIComponent(delimiter)}`;
    }
    if (prefix) {
      if (!url.endsWith('?')) {
        url += '&';
      }
      url += `prefix=${encodeURIComponent(prefix)}`;
    }
    return url;
  }

  getRunsFromGcs(): Observable<PreviousRunsResponse> {
    return forkJoin({
      runs: this.storageManager.listObjects(),
      user: this.getCurrentUser()
    }).pipe(
      switchMap(({runs, user}) => {
        return of({
          encodedUserId: btoa(user),
          runs: runs
        });
      })
    );
  }

  getRendersFromGcs(gcsFolder: string): Observable<string[]> {
    const url = this.getStorageUrl('/', `${gcsFolder}/`);
    return this.getUserAuthToken().pipe(
      switchMap(userAuthToken =>
        this.httpClient.get(url, {
          responseType: 'json',
          headers: new HttpHeaders({
            Authorization: `Bearer ${userAuthToken}`,
          }),
        })
          .pipe(
            switchMap((response: any) => {
              const renders = (response?.prefixes || []).map((prefix: string) =>
                prefix.replace(gcsFolder ?? '', '').split('/')[0]
              )
              .filter((elem: string) => elem.endsWith('-combos'));
              return of(renders);

            }),
            catchError(error => {
              console.error('Load renders failed with error: ', error);
              throw error;
            })
          )
      )
    );
  }

  renderVariants(
    gcsFolder: string,
    renderQueue: RenderQueue
  ): Observable<string> {
    const queueNamePrefix = renderQueue.queueName
    ? `${renderQueue.queueName}${CONFIG.videoFolderNameSeparator}`
    : '';
  const folder = `${gcsFolder}/${queueNamePrefix}${Date.now()}-combos`;
  const uploadTasks: Observable<unknown>[] = [];

  if (renderQueue.squareCropAnalysis) {
    const encodedSquareCropCommands = PreviewHelper.generateCropCommands(
      renderQueue.squareCropAnalysis,
      {
        w: renderQueue.sourceDimensions.h,
        h: renderQueue.sourceDimensions.h,
      },
      CONFIG.defaultVideoHeight
    );
    uploadTasks.push(
      this.storageManager.uploadStringContent(
        encodedSquareCropCommands,
        folder,
        CONFIG.cloudStorage.files.formats.square
      )
    );
  }

  if (renderQueue.verticalCropAnalysis) {
    const encodedVerticalCropCommands =
      PreviewHelper.generateCropCommands(
        renderQueue.verticalCropAnalysis,
        {
          w:
            renderQueue.sourceDimensions.h *
            (renderQueue.sourceDimensions.h / renderQueue.sourceDimensions.w),
          h: renderQueue.sourceDimensions.h,
        },
        CONFIG.defaultVideoHeight *
          (CONFIG.defaultVideoHeight / CONFIG.defaultVideoWidth)
      );
    uploadTasks.push(
      this.storageManager.uploadStringContent(
        encodedVerticalCropCommands,
        folder,
        CONFIG.cloudStorage.files.formats.vertical
      )
    );
  }

  const encodedRenderQueueJson = JSON.stringify(renderQueue.queue);
  uploadTasks.push(
    this.storageManager.uploadStringContent(
      encodedRenderQueueJson,
      folder,
      CONFIG.cloudStorage.files.render,
      'application/json'
    )
  );

  return forkJoin(uploadTasks).pipe(
    map(() => folder),
    catchError(error => {
      console.error('Render variants failed with error: ', error);
      throw error;
    })
  );
}

  getGcsFolderPath(folder: string): Observable<string> {
    return of(
      `${CONFIG.cloudStorage.browsingEndpointBase}/${CONFIG.cloudStorage.bucket}/${encodeURIComponent(folder)}`
    );
  }

  getWebAppUrl(): Observable<string> {
    return this.httpClient.get('service_url', {
      responseType: 'json',
    })
    .pipe(
      switchMap((response: any) => {
        return of(response?.url);
      }),
      catchError(error => {
        console.error('Failed to get service url: ', error);
        throw error;
      })
    );
  }

  getCurrentUser(): Observable<string> {
    return this.httpClient.get('userinfo', {
      responseType: 'text',
    })
      .pipe(
        switchMap((response: any) => {
          return of(response);
        }),
        catchError(error => {
          console.error('Failed to get user info: ', error);
          throw error;
        })
      );
  }

  regenerateTextAsset(
    variantVideoPath: string,
    textAsset: VariantTextAsset,
    textAssetLanguage: string
  ): Observable<VariantTextAsset> {
    return this.generationHelper.generateTextAsset(
      variantVideoPath,
      textAsset,
      textAssetLanguage
    );
  }

  storeApprovalStatus(
    folder: string,
    combos: RenderedVariant[]
  ): Observable<boolean> {
    const combosStr = JSON.stringify(combos);
    return this.storageManager.uploadStringContent(
      combosStr,
      folder,
      CONFIG.cloudStorage.files.approval,
      'application/json'
    ).pipe(
      map(() => true),
      catchError(error => {
        console.error('Error while storing approval status! Error: ', error);
        throw error;
      })
    );
  }

  getVideoLanguage(gcsFolder: string): Observable<string> {
    return this.generationHelper.getVideoLanguage(gcsFolder);
  }

  generateTextAssets(
    variantVideoPath: string,
    textAssetsLanguage: string
  ): Observable<VariantTextAsset[]> {
    return this.generationHelper.generateTextAssets(
      variantVideoPath,
      textAssetsLanguage
    ).pipe(
      retry({ count: CONFIG.maxRetriesAppsScript, delay: CONFIG.retryDelay })
    );
  }

  splitSegment(
    gcsFolder: string,
    segmentMarkers: SegmentMarker[]
  ): Observable<string> {
    const segmentMarkersStr = JSON.stringify(segmentMarkers);
    this.storageManager.renameFile(
      `${gcsFolder}/${CONFIG.cloudStorage.files.data}`,
      `${gcsFolder}/${CONFIG.cloudStorage.files.presplit}`
    );
    return this.storageManager.uploadStringContent(
      segmentMarkersStr,
      gcsFolder,
      `${Date.now()}${CONFIG.cloudStorage.files.split}`,
      'application/json'
    ).pipe(
      map(() => String(segmentMarkers[0].av_segment_id)),
      catchError(error => {
        console.error('Encountered an unexpected error while splitting a segment! Error: ',
          error);
        throw error;
      })
    );
  }
}
